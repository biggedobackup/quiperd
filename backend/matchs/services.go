package matchs

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"quiperd/backend/administration"
	"quiperd/backend/config"
	"quiperd/backend/portefeuilles"
	"quiperd/backend/tempsreel"
)

// ─── Points d'extension inter-modules (posés au démarrage, évitent les cycles) ─────────

// OuvrirLitigeAuto est branché par le package litiges. Appelé UNIQUEMENT une fois que le
// match est déjà passé en statut `litige` par une transition atomique : le hook se contente
// de créer la ligne de litige, de prévenir les joueurs et l'arbitrage.
// Depuis la refonte, un désaccord n'ouvre plus le litige tout de suite : le match passe
// d'abord en `preuve_requise` et le litige n'est ouvert qu'au dépôt des preuves ou à
// l'expiration de l'échéance de preuve.
var OuvrirLitigeAuto func(tx *gorm.DB, tampon *tempsreel.Tampon, matchID uuid.UUID, motif string)

// NotifierReglement est l'ancien point d'extension (posé par main.go). Conservé pour
// compatibilité : il est utilisé seulement si NotifierFinMatch n'a pas été branché.
var NotifierReglement func(tx *gorm.DB, gagnantID, perdantID uuid.UUID, gain decimal.Decimal)

// NotifierFinMatch remplace NotifierReglement en acceptant le tampon temps réel : les
// notifications créées dans la transaction ne sont diffusées qu'après le commit.
// Branché par litiges.Brancher() au démarrage.
var NotifierFinMatch func(tx *gorm.DB, tampon *tempsreel.Tampon, gagnantID, perdantID uuid.UUID, gain decimal.Decimal)

// NotifierJoueurs est branché par litiges.Brancher() : envoie la même notification aux deux
// joueurs d'un match (score proposé, désaccord, nul, rejoue, abandon) sans que matchs
// importe notifications.
var NotifierJoueurs func(tx *gorm.DB, tampon *tempsreel.Tampon, joueurs []uuid.UUID, titre, message, typ string)

// CloturerLitigeAuto est branché par litiges.Brancher() : marque résolu le litige encore
// ouvert d'un match réglé par une autre voie (validation administrative).
var CloturerLitigeAuto func(tx *gorm.DB, tampon *tempsreel.Tampon, matchID uuid.UUID, arbitreID *uuid.UUID, decision string)

// ─── Erreurs métier (converties en codes HTTP par les contrôleurs) ────────────────────

var (
	// ErrNonParticipant : l'appelant ne joue pas ce match (403).
	ErrNonParticipant = errors.New("ce match ne vous concerne pas")
	// ErrPasEnCours : le match n'accepte plus de déclaration (409).
	ErrPasEnCours = errors.New("le match n'est plus en cours de déclaration")
	// ErrDejaDeclare : ce joueur a déjà déclaré la manche courante (409).
	ErrDejaDeclare = errors.New("vous avez déjà déclaré cette manche")
	// ErrRienAConfirmer : aucun score adverse en attente de confirmation (409).
	ErrRienAConfirmer = errors.New("aucune déclaration de votre adversaire n'est en attente de confirmation")
	// ErrPasEnNul : le match n'attend pas de choix après un nul (409).
	ErrPasEnNul = errors.New("ce match n'attend pas de choix après un match nul")
	// ErrDejaChoisi : ce joueur a déjà fait son choix pour la manche (409).
	ErrDejaChoisi = errors.New("vous avez déjà fait votre choix pour cette manche")
	// ErrEtatIncoherent : la transition a été gagnée par un autre appel concurrent (409).
	ErrEtatIncoherent = errors.New("l'état du match a changé, rechargez la page")
)

// ─── Charges utiles des événements temps réel (contrat gelé, cf. tempsreel/evenements.go) ─

// ChargeScorePropose — match.score_propose. Les scores sont donnés du point de vue du
// DÉCLARANT : le client affiche « Confirmer scoreContre-scorePour » à son adversaire.
type ChargeScorePropose struct {
	MatchID              uuid.UUID `json:"matchId"`
	Manche               int       `json:"manche"`
	Declarant            uuid.UUID `json:"declarant"`
	ScorePour            int       `json:"scorePour"`
	ScoreContre          int       `json:"scoreContre"`
	EcheanceConfirmation time.Time `json:"echeanceConfirmation"`
}

// ChargeScoreConfirme — match.score_confirme (les deux déclarations concordent).
type ChargeScoreConfirme struct {
	MatchID      uuid.UUID  `json:"matchId"`
	Manche       int        `json:"manche"`
	GagnantID    *uuid.UUID `json:"gagnantId,omitempty"`
	PerdantID    *uuid.UUID `json:"perdantId,omitempty"`
	ScoreJoueur1 *int       `json:"scoreJoueur1,omitempty"`
	ScoreJoueur2 *int       `json:"scoreJoueur2,omitempty"`
}

// ChargeDesaccord — match.desaccord.
type ChargeDesaccord struct {
	MatchID        uuid.UUID `json:"matchId"`
	Manche         int       `json:"manche"`
	EcheancePreuve time.Time `json:"echeancePreuve"`
}

// ChargeNul — match.nul.
type ChargeNul struct {
	MatchID       uuid.UUID `json:"matchId"`
	Manche        int       `json:"manche"`
	EcheanceChoix time.Time `json:"echeanceChoix"`
}

// ChargeNulChoix — match.nul_choix (l'adversaire voit le choix en direct).
type ChargeNulChoix struct {
	MatchID       uuid.UUID `json:"matchId"`
	Manche        int       `json:"manche"`
	UtilisateurID uuid.UUID `json:"utilisateurId"`
	Choix         string    `json:"choix"`
}

// ChargeRejoue — match.rejoue (nouvelle manche, escrow inchangé).
type ChargeRejoue struct {
	MatchID uuid.UUID `json:"matchId"`
	Manche  int       `json:"manche"`
}

// ChargePartage — match.partage. `rendu` est le net crédité à CHAQUE joueur,
// `commission` le total conservé par la plateforme (2 × mise × taux).
type ChargePartage struct {
	MatchID    uuid.UUID       `json:"matchId"`
	Rendu      decimal.Decimal `json:"rendu"`
	Commission decimal.Decimal `json:"commission"`
}

// ChargeAbandon — match.abandon (échéance de confirmation dépassée).
type ChargeAbandon struct {
	MatchID   uuid.UUID `json:"matchId"`
	GagnantID uuid.UUID `json:"gagnantId"`
	Motif     string    `json:"motif"`
}

// ChargeChrono — match.chrono. `type` ∈ confirmation | preuve | choix_nul.
type ChargeChrono struct {
	MatchID  uuid.UUID `json:"matchId"`
	Type     string    `json:"type"`
	Manche   int       `json:"manche"`
	Echeance time.Time `json:"echeance"`
}

// ChargeTermine — match.termine : le match enrichi, aplati, complété du gain et de la
// commission. `gain` vaut 0 sur un partage (aucun gagnant), `rendu` figure alors dans
// l'événement match.partage qui le précède.
type ChargeTermine struct {
	MatchEnrichi
	Gain       decimal.Decimal `json:"gain"`
	Commission decimal.Decimal `json:"commission"`
}

// ─── Création et lecture ──────────────────────────────────────────────────────────────

// CreerMatch insère un match quand un second joueur rejoint un défi.
// Appelé depuis defis.Rejoindre, dans la même transaction que le blocage des mises.
func CreerMatch(tx *gorm.DB, defiID, joueur1ID, joueur2ID uuid.UUID, montant decimal.Decimal, devise string) (*MatchDefi, error) {
	maintenant := time.Now().UTC()
	m := MatchDefi{
		DefiID: defiID, Joueur1ID: joueur1ID, Joueur2ID: joueur2ID,
		MontantMise: montant, Devise: devise, Statut: StatutEnCours,
		Manche: 1, DateDebut: &maintenant,
	}
	if err := tx.Create(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// Charger renvoie un match par id.
func Charger(db *gorm.DB, id uuid.UUID) (*MatchDefi, error) {
	var m MatchDefi
	if err := db.First(&m, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// ChargerVerrouille lit un match avec SELECT ... FOR UPDATE. TOUT chemin qui fait avancer
// la machine à états (déclaration, confirmation, choix de nul, expiration d'un chrono) doit
// passer par ici AVANT de lire les déclarations : sans ce verrou, deux joueurs qui déclarent
// en même temps liraient chacun « une seule déclaration » et le match resterait bloqué.
// Ordre de verrous unique dans toute l'application : la ligne match, puis les portefeuilles.
func ChargerVerrouille(tx *gorm.DB, id uuid.UUID) (*MatchDefi, error) {
	var m MatchDefi
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&m, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// MatchEnrichi est un match complété des libellés utiles aux clients (mobile, web) :
// noms des joueurs, jeu et plateforme du défi. Lecture seule — jamais utilisé pour écrire.
type MatchEnrichi struct {
	MatchDefi
	Joueur1Nom string `gorm:"column:joueur_1_nom" json:"joueur1Nom"`
	Joueur2Nom string `gorm:"column:joueur_2_nom" json:"joueur2Nom"`

	// Photos de profil des deux joueurs. On expose le **chemin stocké**, pas une URL : le
	// fichier est servi par une route protégée (`GET /utilisateurs/{id}/photo`) que les
	// clients construisent eux-mêmes à partir de l'identifiant du joueur. Ce champ ne sert
	// donc qu'à deux choses — savoir s'il Y A une photo (chaîne vide = aucune, on retombe
	// sur le monogramme) et servir de version pour le cache du navigateur, comme le fait
	// déjà la barre du joueur pour sa propre photo.
	Joueur1Photo string `gorm:"column:joueur_1_photo" json:"joueur1Photo"`
	Joueur2Photo string `gorm:"column:joueur_2_photo" json:"joueur2Photo"`

	JeuNom        string `gorm:"column:jeu_nom" json:"jeuNom"`
	PlateformeNom string `gorm:"column:plateforme_nom" json:"plateformeNom"`
}

func requeteEnrichie(db *gorm.DB) *gorm.DB {
	return db.Table("matchs m").
		Select(`m.*, u1.nom_utilisateur AS joueur_1_nom, u2.nom_utilisateur AS joueur_2_nom,
			u1.photo_profil AS joueur_1_photo, u2.photo_profil AS joueur_2_photo,
			j.nom AS jeu_nom, p.nom AS plateforme_nom`).
		Joins("LEFT JOIN utilisateurs u1 ON u1.id = m.joueur_1_id").
		Joins("LEFT JOIN utilisateurs u2 ON u2.id = m.joueur_2_id").
		Joins("LEFT JOIN defis d ON d.id = m.defi_id").
		Joins("LEFT JOIN jeux j ON j.id = d.jeu_id").
		Joins("LEFT JOIN plateformes p ON p.id = d.plateforme_id")
}

// ChargerEnrichi renvoie un match par id avec ses libellés.
func ChargerEnrichi(db *gorm.DB, id uuid.UUID) (*MatchEnrichi, error) {
	var m MatchEnrichi
	res := requeteEnrichie(db).Where("m.id = ?", id).Limit(1).Scan(&m)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &m, nil
}

// ChargerEnrichiParDefi renvoie le match d'un défi (s'il existe) avec ses libellés.
func ChargerEnrichiParDefi(db *gorm.DB, defiID uuid.UUID) (*MatchEnrichi, error) {
	var m MatchEnrichi
	res := requeteEnrichie(db).Where("m.defi_id = ?", defiID).Limit(1).Scan(&m)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &m, nil
}

// ListerPourJoueur renvoie les matchs d'un joueur (les deux côtés), du plus récent au
// plus ancien, filtrés par statut si demandé. tous=true (admin) renvoie tous les matchs.
func ListerPourJoueur(db *gorm.DB, userID uuid.UUID, statut string, tous bool) ([]MatchEnrichi, error) {
	q := requeteEnrichie(db)
	if !tous {
		q = q.Where("m.joueur_1_id = ? OR m.joueur_2_id = ?", userID, userID)
	}
	if statut != "" {
		q = q.Where("m.statut = ?", statut)
	}
	liste := []MatchEnrichi{}
	err := q.Order("m.date_creation DESC").Limit(200).Scan(&liste).Error
	return liste, err
}

// EstParticipant indique si l'utilisateur joue ce match.
func (m *MatchDefi) EstParticipant(userID uuid.UUID) bool {
	return m.Joueur1ID == userID || m.Joueur2ID == userID
}

// Adversaire renvoie l'autre joueur du match.
func (m *MatchDefi) Adversaire(userID uuid.UUID) uuid.UUID {
	if userID == m.Joueur1ID {
		return m.Joueur2ID
	}
	return m.Joueur1ID
}

// Joueurs renvoie les deux joueurs, dans l'ordre joueur1 puis joueur2.
func (m *MatchDefi) Joueurs() []uuid.UUID { return []uuid.UUID{m.Joueur1ID, m.Joueur2ID} }

// ─── Transitions atomiques ────────────────────────────────────────────────────────────

// transition change l'état d'un match si — et seulement si — il est encore dans l'un des
// statuts attendus ET sur la manche attendue. Renvoie true uniquement pour l'appel qui a
// réellement effectué le changement : c'est la garantie d'idempotence de tout mouvement
// d'argent (même mécanique que defis.ExpirerSiOuvert).
// manche < 0 désactive le contrôle de manche.
func transition(tx *gorm.DB, matchID uuid.UUID, depuis []string, manche int, maj map[string]any) (bool, error) {
	q := tx.Model(&MatchDefi{}).Where("id = ? AND statut IN ?", matchID, depuis)
	if manche >= 0 {
		q = q.Where("manche = ?", manche)
	}
	res := q.Updates(maj)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected == 1, nil
}

// declarations renvoie les déclarations d'une manche, les plus anciennes d'abord.
func declarations(tx *gorm.DB, matchID uuid.UUID, manche int) ([]ResultatDeclare, error) {
	var liste []ResultatDeclare
	err := tx.Where("match_id = ? AND manche = ?", matchID, manche).
		Order("date_declaration ASC, id ASC").Find(&liste).Error
	return liste, err
}

// appliquerScores renseigne score_joueur_1 / score_joueur_2 du point de vue du match.
func appliquerScores(tx *gorm.DB, m *MatchDefi, liste []ResultatDeclare) {
	maj := map[string]any{}
	for _, d := range liste {
		if d.UtilisateurID == m.Joueur1ID {
			maj["score_joueur_1"] = d.ScorePour
			maj["score_joueur_2"] = d.ScoreContre
		} else if d.UtilisateurID == m.Joueur2ID {
			maj["score_joueur_2"] = d.ScorePour
			maj["score_joueur_1"] = d.ScoreContre
		}
	}
	if len(maj) > 0 {
		tx.Model(&MatchDefi{}).Where("id = ?", m.ID).Updates(maj)
	}
}

// ─── Déclaration de score ─────────────────────────────────────────────────────────────

// EnregistrerDeclaration insère la déclaration d'un joueur pour la manche courante puis
// fait avancer la machine à états :
//   - première déclaration  → le match reste `en_cours`, un chrono de confirmation est posé
//     et le score proposé est poussé en direct à l'adversaire ;
//   - déclarations concordantes → règlement IMMÉDIAT (escrow libéré, gagnant payé), sans
//     preuve ni arbitre, quel que soit le montant ;
//   - nul déclaré des deux côtés → `nul_en_attente` (rejouer ou partager) ;
//   - déclarations divergentes → `preuve_requise` (le litige n'est ouvert qu'ensuite).
func EnregistrerDeclaration(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, userID uuid.UUID, scorePour, scoreContre int, commentaire string) error {
	if !m.EstParticipant(userID) {
		return ErrNonParticipant
	}
	if m.Statut != StatutEnCours {
		return ErrPasEnCours
	}

	var gagnantDeclare *uuid.UUID
	adversaire := m.Adversaire(userID)
	if scorePour > scoreContre {
		g := userID
		gagnantDeclare = &g
	} else if scorePour < scoreContre {
		g := adversaire
		gagnantDeclare = &g
	} // égalité => nil : match nul déclaré

	decl := ResultatDeclare{
		MatchID: m.ID, UtilisateurID: userID, Manche: m.Manche, ScorePour: scorePour,
		ScoreContre: scoreContre, GagnantDeclareID: gagnantDeclare, Commentaire: commentaire,
	}
	if err := tx.Create(&decl).Error; err != nil {
		return ErrDejaDeclare
	}
	return avancerApresDeclaration(tx, tampon, m, userID)
}

// ConfirmerScore inscrit la déclaration MIROIR du second joueur à partir de celle de son
// adversaire : le client n'envoie aucun chiffre, il ne peut donc pas falsifier le score
// qu'il prétend confirmer. Le résultat est un accord (règlement immédiat) ou, si le score
// proposé était une égalité, un match nul à trancher.
func ConfirmerScore(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, userID uuid.UUID) error {
	if !m.EstParticipant(userID) {
		return ErrNonParticipant
	}
	if m.Statut != StatutEnCours {
		return ErrPasEnCours
	}
	liste, err := declarations(tx, m.ID, m.Manche)
	if err != nil {
		return err
	}
	if len(liste) != 1 {
		return ErrRienAConfirmer
	}
	proposee := liste[0]
	if proposee.UtilisateurID == userID {
		return ErrRienAConfirmer // c'est SA propre déclaration : rien à confirmer
	}

	// Miroir exact : le score du confirmant est l'inverse de celui du déclarant.
	var gagnantDeclare *uuid.UUID
	if proposee.GagnantDeclareID != nil {
		g := *proposee.GagnantDeclareID
		gagnantDeclare = &g
	}
	miroir := ResultatDeclare{
		MatchID: m.ID, UtilisateurID: userID, Manche: m.Manche,
		ScorePour: proposee.ScoreContre, ScoreContre: proposee.ScorePour,
		GagnantDeclareID: gagnantDeclare,
		Commentaire:      "Résultat confirmé par l'adversaire",
	}
	if err := tx.Create(&miroir).Error; err != nil {
		return ErrDejaDeclare
	}
	return avancerApresDeclaration(tx, tampon, m, userID)
}

// avancerApresDeclaration applique la machine à états une fois la déclaration insérée.
func avancerApresDeclaration(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, userID uuid.UUID) error {
	liste, err := declarations(tx, m.ID, m.Manche)
	if err != nil {
		return err
	}
	if len(liste) < 2 {
		return attendreConfirmation(tx, tampon, m, liste[0])
	}

	appliquerScores(tx, m, liste)
	d1, d2 := liste[0], liste[1]

	switch {
	case d1.EstNul() && d2.EstNul():
		return passerEnNulEnAttente(tx, tampon, m)
	case d1.GagnantDeclareID != nil && d2.GagnantDeclareID != nil && *d1.GagnantDeclareID == *d2.GagnantDeclareID:
		gagnant := *d1.GagnantDeclareID
		return reglerAccord(tx, tampon, m, gagnant, m.Adversaire(gagnant))
	default:
		return passerEnPreuveRequise(tx, tampon, m)
	}
}

// attendreConfirmation pose le chrono de confirmation et pousse le score proposé.
func attendreConfirmation(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, proposee ResultatDeclare) error {
	echeance, err := PoserEcheance(tx, m, EcheanceConfirmation, administration.DelaiConfirmation(tx))
	if err != nil {
		return err
	}
	tampon.Ajouter(tempsreel.EvtMatchScorePropose, ChargeScorePropose{
		MatchID: m.ID, Manche: m.Manche, Declarant: proposee.UtilisateurID,
		ScorePour: proposee.ScorePour, ScoreContre: proposee.ScoreContre,
		EcheanceConfirmation: echeance,
	}, tempsreel.SalonMatch(m.ID))
	AnnoncerChrono(tampon, m, EcheanceConfirmation, echeance)

	if NotifierJoueurs != nil {
		adversaire := m.Adversaire(proposee.UtilisateurID)
		// Le 1-0 rangé en base est une convention interne : on nomme l'issue déclarée, jamais
		// les nombres — personne n'a saisi de chiffre.
		issue := "se déclare vainqueur"
		switch {
		case proposee.ScorePour == proposee.ScoreContre:
			issue = "annonce un match nul"
		case proposee.ScorePour < proposee.ScoreContre:
			issue = "vous déclare vainqueur"
		}
		NotifierJoueurs(tx, tampon, []uuid.UUID{adversaire}, "Résultat à confirmer",
			fmt.Sprintf("Votre adversaire %s. Confirmez ou annoncez l'inverse avant %s, sans quoi sa déclaration fera foi.",
				issue, echeance.Format("15:04")),
			"match_score")
	}
	return nil
}

// reglerAccord solde le match immédiatement : escrow libéré, gagnant payé, aucune preuve,
// aucun arbitre — quel que soit le montant. Transition atomique en_cours -> termine.
func reglerAccord(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, gagnant, perdant uuid.UUID) error {
	fin := time.Now().UTC()
	fait, err := transition(tx, m.ID, []string{StatutEnCours}, m.Manche, map[string]any{
		"statut": StatutTermine, "gagnant_id": gagnant, "perdant_id": perdant,
		"date_fin": fin, "echeance": nil, "echeance_type": "",
	})
	if err != nil {
		return err
	}
	if !fait {
		return ErrEtatIncoherent
	}

	taux := administration.CommissionActuelle(tx)
	gain, commission, err := portefeuilles.ReglerEscrow(tx, m.DefiID, m.ID, gagnant, perdant, m.MontantMise, taux)
	if err != nil {
		return err
	}

	administration.Journaliser(tx, administration.ParamsAudit{
		Action: "match:reglement_direct", TableCible: "matchs", IdentifiantCible: &m.ID,
		Nouvelle: map[string]any{
			"statut": StatutTermine, "manche": m.Manche, "gagnantId": gagnant,
			"gain": gain, "commission": commission, "taux": taux,
		},
	})

	m.Statut, m.DateFin, m.GagnantID, m.PerdantID = StatutTermine, &fin, &gagnant, &perdant
	enrichi, _ := ChargerEnrichi(tx, m.ID)
	if enrichi != nil {
		tampon.Ajouter(tempsreel.EvtMatchScoreConfirme, ChargeScoreConfirme{
			MatchID: m.ID, Manche: m.Manche, GagnantID: &gagnant, PerdantID: &perdant,
			ScoreJoueur1: enrichi.ScoreJoueur1, ScoreJoueur2: enrichi.ScoreJoueur2,
		}, tempsreel.SalonMatch(m.ID))
	}
	publierFin(tx, tampon, m, gain, commission)
	notifierFin(tx, tampon, gagnant, perdant, gain)
	return nil
}

// passerEnPreuveRequise : déclarations divergentes. Les deux joueurs doivent fournir une
// preuve ; le litige n'est ouvert qu'au dépôt des preuves ou à l'expiration de l'échéance.
func passerEnPreuveRequise(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi) error {
	fait, err := transition(tx, m.ID, []string{StatutEnCours}, m.Manche, map[string]any{
		"statut": StatutPreuveRequise, "gagnant_id": nil, "perdant_id": nil,
	})
	if err != nil {
		return err
	}
	if !fait {
		return ErrEtatIncoherent
	}
	m.Statut = StatutPreuveRequise
	echeance, err := PoserEcheance(tx, m, EcheancePreuve, administration.DelaiPreuve(tx))
	if err != nil {
		return err
	}
	tampon.Ajouter(tempsreel.EvtMatchDesaccord, ChargeDesaccord{
		MatchID: m.ID, Manche: m.Manche, EcheancePreuve: echeance,
	}, tempsreel.SalonMatch(m.ID))
	AnnoncerChrono(tampon, m, EcheancePreuve, echeance)

	if NotifierJoueurs != nil {
		NotifierJoueurs(tx, tampon, m.Joueurs(), "Déclarations divergentes",
			"Vos déclarations ne concordent pas. Envoyez chacun une preuve (capture ou vidéo) avant l'échéance : passé ce délai, un arbitre tranchera.",
			"match_desaccord")
	}
	administration.Journaliser(tx, administration.ParamsAudit{
		Action: "match:desaccord", TableCible: "matchs", IdentifiantCible: &m.ID,
		Nouvelle: map[string]any{"statut": StatutPreuveRequise, "manche": m.Manche, "echeancePreuve": echeance},
	})
	return nil
}

// passerEnNulEnAttente : les deux joueurs déclarent une égalité. Chacun choisit ensuite
// rejouer (aucun mouvement d'argent) ou partager (chacun mise × (1 − commission)).
func passerEnNulEnAttente(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi) error {
	fait, err := transition(tx, m.ID, []string{StatutEnCours}, m.Manche, map[string]any{
		"statut": StatutNulEnAttente, "gagnant_id": nil, "perdant_id": nil,
	})
	if err != nil {
		return err
	}
	if !fait {
		return ErrEtatIncoherent
	}
	m.Statut = StatutNulEnAttente
	echeance, err := PoserEcheance(tx, m, EcheanceChoixNul, administration.DelaiChoixNul(tx))
	if err != nil {
		return err
	}
	tampon.Ajouter(tempsreel.EvtMatchNul, ChargeNul{
		MatchID: m.ID, Manche: m.Manche, EcheanceChoix: echeance,
	}, tempsreel.SalonMatch(m.ID))
	AnnoncerChrono(tampon, m, EcheanceChoixNul, echeance)

	if NotifierJoueurs != nil {
		NotifierJoueurs(tx, tampon, m.Joueurs(), "Match nul",
			"Vous avez tous les deux déclaré une égalité. Choisissez de rejouer la manche ou de partager les mises. Sans choix de votre part avant l'échéance, le partage sera appliqué.",
			"match_nul")
	}
	return nil
}

// ─── Choix après un match nul ─────────────────────────────────────────────────────────

// EnregistrerChoixNul enregistre le choix d'un joueur (rejouer ou partager) puis tranche
// dès que les deux se sont exprimés : rejouer seulement si les DEUX l'acceptent, partage
// dans tous les autres cas.
func EnregistrerChoixNul(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, userID uuid.UUID, choix string) error {
	if !m.EstParticipant(userID) {
		return ErrNonParticipant
	}
	if m.Statut != StatutNulEnAttente {
		return ErrPasEnNul
	}
	if choix != ChoixRejouer && choix != ChoixPartager {
		return errors.New("choix invalide (rejouer ou partager)")
	}
	ligne := ChoixNul{MatchID: m.ID, UtilisateurID: userID, Manche: m.Manche, Choix: choix}
	if err := tx.Create(&ligne).Error; err != nil {
		return ErrDejaChoisi
	}
	tampon.Ajouter(tempsreel.EvtMatchNulChoix, ChargeNulChoix{
		MatchID: m.ID, Manche: m.Manche, UtilisateurID: userID, Choix: choix,
	}, tempsreel.SalonMatch(m.ID))

	var faits []ChoixNul
	if err := tx.Where("match_id = ? AND manche = ?", m.ID, m.Manche).Find(&faits).Error; err != nil {
		return err
	}
	if len(faits) < 2 {
		return nil // on attend l'autre joueur (l'échéance tranchera sinon)
	}
	if faits[0].Choix == ChoixRejouer && faits[1].Choix == ChoixRejouer {
		return RejouerManche(tx, tampon, m)
	}
	// Le motif part au journal d'audit : il doit décrire ce qui s'est réellement passé.
	// Deux « partager » ne sont pas des choix opposés, même si l'issue est la même.
	motif := "choix opposés"
	if faits[0].Choix == ChoixPartager && faits[1].Choix == ChoixPartager {
		motif = "partage demandé par les deux joueurs"
	}
	return PartagerNul(tx, tampon, m, motif)
}

// RejouerManche remet le match en jeu : AUCUN mouvement d'argent, l'escrow reste bloqué.
// Scores et gagnant remis à NULL, chrono effacé, manche incrémentée. Les déclarations de
// la manche précédente sont conservées (clé unique portant la manche) : elles restent
// consultables et le client filtre sur la manche courante.
func RejouerManche(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi) error {
	nouvelle := m.Manche + 1
	fait, err := transition(tx, m.ID, []string{StatutNulEnAttente}, m.Manche, map[string]any{
		"statut": StatutEnCours, "manche": nouvelle,
		"score_joueur_1": nil, "score_joueur_2": nil,
		"gagnant_id": nil, "perdant_id": nil,
		"echeance": nil, "echeance_type": "",
	})
	if err != nil {
		return err
	}
	if !fait {
		return ErrEtatIncoherent
	}
	m.Manche, m.Statut = nouvelle, StatutEnCours
	m.ScoreJoueur1, m.ScoreJoueur2, m.GagnantID, m.PerdantID = nil, nil, nil, nil
	m.Echeance, m.EcheanceType = nil, ""

	tampon.Ajouter(tempsreel.EvtMatchRejoue, ChargeRejoue{MatchID: m.ID, Manche: nouvelle},
		tempsreel.SalonMatch(m.ID))
	if NotifierJoueurs != nil {
		NotifierJoueurs(tx, tampon, m.Joueurs(), "Nouvelle manche",
			fmt.Sprintf("Vous avez tous les deux choisi de rejouer : la manche %d commence. Vos mises restent bloquées, aucun mouvement d'argent n'a eu lieu.", nouvelle),
			"match_rejoue")
	}
	administration.Journaliser(tx, administration.ParamsAudit{
		Action: "match:rejoue", TableCible: "matchs", IdentifiantCible: &m.ID,
		Nouvelle: map[string]any{"statut": StatutEnCours, "manche": nouvelle},
	})
	return nil
}

// PartagerNul solde le match nul par un partage : chacun récupère mise × (1 − commission),
// la plateforme garde 2 × mise × commission. Transition atomique nul_en_attente -> termine.
func PartagerNul(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, motif string) error {
	fin := time.Now().UTC()
	fait, err := transition(tx, m.ID, []string{StatutNulEnAttente}, m.Manche, map[string]any{
		"statut": StatutTermine, "gagnant_id": nil, "perdant_id": nil,
		"date_fin": fin, "echeance": nil, "echeance_type": "",
	})
	if err != nil {
		return err
	}
	if !fait {
		return ErrEtatIncoherent
	}

	taux := administration.CommissionActuelle(tx)
	rendu, commission, err := portefeuilles.PartagerEscrow(tx, m.DefiID, m.ID, m.Joueur1ID, m.Joueur2ID, taux)
	if err != nil {
		return err
	}

	administration.Journaliser(tx, administration.ParamsAudit{
		Action: "match:partage", TableCible: "matchs", IdentifiantCible: &m.ID,
		Nouvelle: map[string]any{
			"statut": StatutTermine, "manche": m.Manche, "motif": motif,
			"rendu": rendu, "commission": commission, "taux": taux,
		},
	})

	m.Statut, m.DateFin = StatutTermine, &fin
	tampon.Ajouter(tempsreel.EvtMatchPartage, ChargePartage{
		MatchID: m.ID, Rendu: rendu, Commission: commission,
	}, tempsreel.SalonMatch(m.ID))
	publierFin(tx, tampon, m, decimal.Zero, commission)

	if NotifierJoueurs != nil {
		NotifierJoueurs(tx, tampon, m.Joueurs(), "Match nul — mises partagées",
			fmt.Sprintf("Le match se solde par un partage : %s %s vous ont été rendus (mise moins la commission de la plateforme).",
				rendu.StringFixed(2), m.Devise),
			"match_termine")
	}
	return nil
}

// ─── Abandon (échéance de confirmation dépassée) ──────────────────────────────────────

// TerminerParAbandon règle le match quand l'adversaire n'a ni confirmé ni contredit le score
// dans le délai : la déclaration unique fait alors foi et l'escrow est réglé en faveur du
// joueur qu'elle désigne — c'est le déclarant lui-même dans tous les cas normaux (on ne
// déclare pas sa propre défaite puis on attend). Transition atomique conditionnée au statut,
// à la manche ET au type d'échéance : rejouer la tâche est sans effet.
func TerminerParAbandon(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi) error {
	liste, err := declarations(tx, m.ID, m.Manche)
	if err != nil {
		return err
	}
	if len(liste) != 1 {
		return nil // les deux ont déclaré (ou aucun) : l'échéance ne s'applique plus
	}
	// Le gagnant est celui que la déclaration désigne ; à défaut (nul déclaré, aucun
	// gagnant nommé) c'est le déclarant. Suivre la déclaration ferme l'abus qui
	// consisterait à déclarer sa propre défaite puis à laisser le chrono s'écouler pour
	// encaisser quand même les deux mises.
	gagnant := liste[0].UtilisateurID
	if liste[0].GagnantDeclareID != nil {
		gagnant = *liste[0].GagnantDeclareID
	}
	perdant := m.Adversaire(gagnant)

	fin := time.Now().UTC()
	res := tx.Model(&MatchDefi{}).
		Where("id = ? AND statut = ? AND manche = ? AND echeance_type = ?",
			m.ID, StatutEnCours, m.Manche, EcheanceConfirmation).
		Updates(map[string]any{
			"statut": StatutTermine, "gagnant_id": gagnant, "perdant_id": perdant,
			"date_fin": fin, "echeance": nil, "echeance_type": "",
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return nil // déjà tranché autrement
	}
	appliquerScores(tx, m, liste)

	taux := administration.CommissionActuelle(tx)
	gain, commission, err := portefeuilles.ReglerEscrow(tx, m.DefiID, m.ID, gagnant, perdant, m.MontantMise, taux)
	if err != nil {
		return err
	}
	administration.Journaliser(tx, administration.ParamsAudit{
		Action: "match:abandon", TableCible: "matchs", IdentifiantCible: &m.ID,
		Nouvelle: map[string]any{
			"statut": StatutTermine, "manche": m.Manche, "gagnantId": gagnant,
			"motif": "échéance de confirmation dépassée", "gain": gain, "commission": commission,
		},
	})

	m.Statut, m.DateFin, m.GagnantID, m.PerdantID = StatutTermine, &fin, &gagnant, &perdant
	tampon.Ajouter(tempsreel.EvtMatchAbandon, ChargeAbandon{
		MatchID: m.ID, GagnantID: gagnant, Motif: "échéance de confirmation dépassée",
	}, tempsreel.SalonMatch(m.ID))
	publierFin(tx, tampon, m, gain, commission)

	if NotifierJoueurs != nil {
		NotifierJoueurs(tx, tampon, []uuid.UUID{gagnant}, "Match gagné — délai écoulé",
			"Le délai de confirmation est écoulé sans réponse : votre déclaration fait foi, la victoire vous est accordée et votre gain a été crédité.",
			"match_abandon")
		NotifierJoueurs(tx, tampon, []uuid.UUID{perdant}, "Match perdu — délai écoulé",
			"Le délai de confirmation est écoulé : la déclaration de votre adversaire fait foi et la victoire lui a été accordée.",
			"match_abandon")
	}
	return nil
}

// ─── Passage en litige (après preuves ou échéance) ────────────────────────────────────

// PasserEnLitige fait basculer un match de `preuve_requise` vers `litige` et déclenche le
// hook d'ouverture de litige. Transition atomique : deux appels concurrents (dépôt de la
// dernière preuve + expiration de l'échéance) n'ouvrent qu'un seul litige.
// Renvoie true si CET appel a ouvert le litige.
func PasserEnLitige(tx *gorm.DB, tampon *tempsreel.Tampon, matchID uuid.UUID, motif string) (bool, error) {
	fait, err := transition(tx, matchID, []string{StatutPreuveRequise}, -1, map[string]any{
		"statut": StatutLitige, "echeance": nil, "echeance_type": "",
	})
	if err != nil || !fait {
		return false, err
	}
	if OuvrirLitigeAuto != nil {
		OuvrirLitigeAuto(tx, tampon, matchID, motif)
	}
	return true, nil
}

// ─── Publication de la fin de match ───────────────────────────────────────────────────

// PublierFinDeMatch met en tampon match.termine (match enrichi + gain et commission) sur le
// salon du match, puis les mouvements de portefeuille sur le salon privé de chaque joueur.
// Exporté pour le package litiges, qui règle lui-même l'escrow après une décision arbitrale.
func PublierFinDeMatch(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, gain, commission decimal.Decimal) {
	publierFin(tx, tampon, m, gain, commission)
}

func publierFin(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi, gain, commission decimal.Decimal) {
	if enrichi, err := ChargerEnrichi(tx, m.ID); err == nil {
		tampon.Ajouter(tempsreel.EvtMatchTermine, ChargeTermine{
			MatchEnrichi: *enrichi, Gain: gain, Commission: commission,
		}, tempsreel.SalonMatch(m.ID))
	}
	portefeuilles.AjouterTransactionsMatch(tx, tampon, m.ID)
	portefeuilles.AjouterEtat(tx, tampon, m.Joueur1ID, m.Joueur2ID)
}

// notifierFin prévient les deux joueurs de la fin du match (hook tampon si branché,
// sinon l'ancien hook posé par main.go).
func notifierFin(tx *gorm.DB, tampon *tempsreel.Tampon, gagnant, perdant uuid.UUID, gain decimal.Decimal) {
	if NotifierFinMatch != nil {
		NotifierFinMatch(tx, tampon, gagnant, perdant, gain)
		return
	}
	if NotifierReglement != nil {
		NotifierReglement(tx, gagnant, perdant, gain)
	}
}

// ─── Validation administrative (conservée) ────────────────────────────────────────────

// ValiderMatch règle le match de façon atomique et idempotente : transition
// `verification` OU `litige` -> `termine` sous verrou, puis application de l'escrow dans la
// même transaction. Le parcours joueur n'y passe plus (deux déclarations concordantes
// règlent immédiatement) : la route reste le filet de sécurité de l'administration pour les
// lignes historiques en `verification` et pour un match issu d'un litige dont le gagnant a
// déjà été désigné. arbitreID est renseigné si la validation vient d'un administrateur.
// Ne rejoue jamais un paiement déjà effectué.
func ValiderMatch(matchID uuid.UUID, arbitreID *uuid.UUID) (*MatchDefi, error) {
	var resultat *MatchDefi
	tampon := tempsreel.NouveauTampon()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		fin := time.Now().UTC()
		fait, err := transition(tx, matchID, []string{StatutVerification, StatutLitige}, -1, map[string]any{
			"statut": StatutTermine, "date_fin": fin, "echeance": nil, "echeance_type": "",
		})
		if err != nil {
			return err
		}
		var m MatchDefi
		if err := tx.First(&m, "id = ?", matchID).Error; err != nil {
			return err
		}
		if !fait {
			// Déjà réglé (ou pas validable) : on renvoie l'état actuel sans rejouer.
			resultat = &m
			return nil
		}
		if m.GagnantID == nil || m.PerdantID == nil {
			return errors.New("gagnant/perdant non déterminés")
		}

		taux := administration.CommissionActuelle(tx)
		gain, commission, err := portefeuilles.ReglerEscrow(tx, m.DefiID, m.ID, *m.GagnantID, *m.PerdantID, m.MontantMise, taux)
		if err != nil {
			return err
		}

		administration.Journaliser(tx, administration.ParamsAudit{
			AdministrateurID: arbitreID,
			Action:           "match:validation",
			TableCible:       "matchs",
			IdentifiantCible: &m.ID,
			Nouvelle: map[string]any{
				"statut": StatutTermine, "gagnantId": m.GagnantID,
				"gain": gain, "commission": commission,
			},
		})
		if CloturerLitigeAuto != nil {
			CloturerLitigeAuto(tx, tampon, m.ID, arbitreID, "gagnant")
		}
		publierFin(tx, tampon, &m, gain, commission)
		notifierFin(tx, tampon, *m.GagnantID, *m.PerdantID, gain)
		resultat = &m
		return nil
	})
	if err != nil {
		return nil, err
	}
	tampon.Diffuser()
	return resultat, nil
}
