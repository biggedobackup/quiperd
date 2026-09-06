package matchs

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"quiperd/backend/administration"
	"quiperd/backend/config"
	"quiperd/backend/portefeuilles"
)

// OuvrirLitigeAuto est un point d'extension branché au démarrage par le package
// litiges (évite le cycle matchs <-> litiges). Appelé quand les déclarations
// divergent : crée un litige et bascule le match en statut "litige".
var OuvrirLitigeAuto func(tx *gorm.DB, matchID uuid.UUID, motif string)

// NotifierReglement est branché au démarrage (worker/main) pour prévenir les
// joueurs à la fin du match, sans que matchs importe notifications.
var NotifierReglement func(tx *gorm.DB, gagnantID, perdantID uuid.UUID, gain decimal.Decimal)

// CreerMatch insère un match quand un second joueur rejoint un défi.
// Appelé depuis defis.Rejoindre, dans la même transaction que le blocage des mises.
func CreerMatch(tx *gorm.DB, defiID, joueur1ID, joueur2ID uuid.UUID, montant decimal.Decimal, devise string) (*MatchDefi, error) {
	maintenant := time.Now().UTC()
	m := MatchDefi{
		DefiID: defiID, Joueur1ID: joueur1ID, Joueur2ID: joueur2ID,
		MontantMise: montant, Devise: devise, Statut: StatutEnCours, DateDebut: &maintenant,
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

// MatchEnrichi est un match complété des libellés utiles aux clients (mobile, web) :
// noms des joueurs, jeu et plateforme du défi. Lecture seule — jamais utilisé pour écrire.
type MatchEnrichi struct {
	MatchDefi
	Joueur1Nom    string `gorm:"column:joueur_1_nom" json:"joueur1Nom"`
	Joueur2Nom    string `gorm:"column:joueur_2_nom" json:"joueur2Nom"`
	JeuNom        string `gorm:"column:jeu_nom" json:"jeuNom"`
	PlateformeNom string `gorm:"column:plateforme_nom" json:"plateformeNom"`
}

func requeteEnrichie(db *gorm.DB) *gorm.DB {
	return db.Table("matchs m").
		Select(`m.*, u1.nom_utilisateur AS joueur_1_nom, u2.nom_utilisateur AS joueur_2_nom,
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

// EnregistrerDeclaration insère la déclaration d'un joueur puis, si les deux
// joueurs ont déclaré, fait avancer le match (verification si accord, litige sinon).
func EnregistrerDeclaration(tx *gorm.DB, m *MatchDefi, userID uuid.UUID, scorePour, scoreContre int, commentaire string) error {
	if m.Statut != StatutEnCours {
		return errors.New("le match n'est plus en cours de déclaration")
	}

	// Déterminer le gagnant déclaré du point de vue du déclarant.
	var gagnantDeclare *uuid.UUID
	adversaire := m.Joueur1ID
	if userID == m.Joueur1ID {
		adversaire = m.Joueur2ID
	}
	if scorePour > scoreContre {
		g := userID
		gagnantDeclare = &g
	} else if scorePour < scoreContre {
		g := adversaire
		gagnantDeclare = &g
	} // égalité => nil (match nul déclaré → litige)

	decl := ResultatDeclare{
		MatchID: m.ID, UtilisateurID: userID, ScorePour: scorePour,
		ScoreContre: scoreContre, GagnantDeclareID: gagnantDeclare, Commentaire: commentaire,
	}
	if err := tx.Create(&decl).Error; err != nil {
		return errors.New("vous avez déjà déclaré ce match")
	}

	var declarations []ResultatDeclare
	if err := tx.Where("match_id = ?", m.ID).Find(&declarations).Error; err != nil {
		return err
	}
	if len(declarations) < 2 {
		return nil // on attend la seconde déclaration
	}

	d1 := declarations[0]
	d2 := declarations[1]
	accord := d1.GagnantDeclareID != nil && d2.GagnantDeclareID != nil &&
		*d1.GagnantDeclareID == *d2.GagnantDeclareID

	// Renseigner les scores du match du point de vue joueur1/joueur2.
	appliquerScores(tx, m, declarations)

	if accord {
		gagnant := *d1.GagnantDeclareID
		perdant := m.Joueur1ID
		if gagnant == m.Joueur1ID {
			perdant = m.Joueur2ID
		}
		return tx.Model(&MatchDefi{}).Where("id = ?", m.ID).Updates(map[string]any{
			"statut":     StatutVerification,
			"gagnant_id": gagnant,
			"perdant_id": perdant,
		}).Error
	}

	// Désaccord (ou nul) → litige.
	if err := tx.Model(&MatchDefi{}).Where("id = ?", m.ID).
		Update("statut", StatutLitige).Error; err != nil {
		return err
	}
	if OuvrirLitigeAuto != nil {
		OuvrirLitigeAuto(tx, m.ID, "Déclarations de score divergentes")
	}
	return nil
}

func appliquerScores(tx *gorm.DB, m *MatchDefi, declarations []ResultatDeclare) {
	maj := map[string]any{}
	for _, d := range declarations {
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

// ValiderMatch règle le match de façon atomique et idempotente : transition
// verification -> termine sous verrou, puis application de l'escrow dans la même
// transaction. arbitreID est renseigné si la validation vient d'un administrateur.
// Renvoie le match à jour. Ne rejoue jamais un paiement déjà effectué.
func ValiderMatch(matchID uuid.UUID, arbitreID *uuid.UUID) (*MatchDefi, error) {
	var resultat *MatchDefi
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// Transition atomique : seul le passage verification -> termine règle l'escrow.
		res := tx.Model(&MatchDefi{}).
			Where("id = ? AND statut = ?", matchID, StatutVerification).
			Update("statut", StatutTermine)
		if res.Error != nil {
			return res.Error
		}
		var m MatchDefi
		if err := tx.First(&m, "id = ?", matchID).Error; err != nil {
			return err
		}
		if res.RowsAffected == 0 {
			// Déjà réglé (ou pas en vérification) : on renvoie l'état actuel sans rejouer.
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
		fin := time.Now().UTC()
		if err := tx.Model(&MatchDefi{}).Where("id = ?", m.ID).
			Update("date_fin", fin).Error; err != nil {
			return err
		}
		m.DateFin = &fin

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
		if NotifierReglement != nil {
			NotifierReglement(tx, *m.GagnantID, *m.PerdantID, gain)
		}
		resultat = &m
		return nil
	})
	if err != nil {
		return nil, err
	}
	return resultat, nil
}
