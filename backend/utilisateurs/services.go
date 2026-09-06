package utilisateurs

import (
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"quiperd/backend/administration"
	"quiperd/backend/auth"
	"quiperd/backend/defis"
	"quiperd/backend/matchs"
	"quiperd/backend/portefeuilles"
)

// Erreurs métier de la suppression logique, mappées par le contrôleur (404 / 409).
var (
	ErrIntrouvable  = errors.New("utilisateur introuvable")
	ErrDejaSupprime = errors.New("ce compte est déjà supprimé")
	ErrSoldeBloque  = errors.New("suppression impossible : des mises sont encore bloquées sur le portefeuille")
	ErrDefiOuvert   = errors.New("suppression impossible : le joueur a un défi encore ouvert")
	ErrMatchEnCours = errors.New("suppression impossible : le joueur a un match en cours, en vérification ou en litige")
)

// PortefeuilleResume est la vue du portefeuille jointe au détail d'un compte (admin).
type PortefeuilleResume struct {
	SoldeDisponible decimal.Decimal `json:"soldeDisponible"`
	SoldeBloque     decimal.Decimal `json:"soldeBloque"`
}

// UtilisateurDetail est la réponse de GET /utilisateurs/:id : le compte (champs à plat)
// et son portefeuille.
type UtilisateurDetail struct {
	auth.Utilisateur
	Portefeuille PortefeuilleResume `json:"portefeuille"`
}

// resumePortefeuille lit les soldes sans créer de portefeuille (zéros s'il n'existe pas
// encore : il est créé au premier mouvement d'argent).
func resumePortefeuille(db *gorm.DB, id uuid.UUID) PortefeuilleResume {
	var p portefeuilles.Portefeuille
	if err := db.Where("utilisateur_id = ?", id).First(&p).Error; err != nil {
		return PortefeuilleResume{SoldeDisponible: decimal.Zero, SoldeBloque: decimal.Zero}
	}
	return PortefeuilleResume{SoldeDisponible: p.SoldeDisponible, SoldeBloque: p.SoldeBloque}
}

// identifiantsPris indique si le nom d'utilisateur ou l'e-mail (comparé en minuscules)
// est déjà porté par un AUTRE compte que `sauf`. Chaîne vide = non vérifié.
func identifiantsPris(db *gorm.DB, sauf uuid.UUID, nom, email string) (nomPris, emailPris bool) {
	var n int64
	if nom != "" {
		db.Model(&auth.Utilisateur{}).Where("nom_utilisateur = ? AND id <> ?", nom, sauf).Count(&n)
		nomPris = n > 0
	}
	if email != "" {
		db.Model(&auth.Utilisateur{}).Where("email = ? AND id <> ?", strings.ToLower(email), sauf).Count(&n)
		emailPris = n > 0
	}
	return nomPris, emailPris
}

// CreerParAdmin crée un joueur avec le service de l'inscription publique (mêmes règles
// de validation, hash bcrypt) ET son portefeuille, sans jeton ni session, puis
// journalise `utilisateur:creation`. Renvoie auth.ErrIdentifiantsPris (→ 409) si le
// pseudo ou l'e-mail est déjà utilisé.
func CreerParAdmin(db *gorm.DB, adminID uuid.UUID, in auth.EntreeInscription, statut, ip string) (*auth.Utilisateur, error) {
	var u *auth.Utilisateur
	err := db.Transaction(func(tx *gorm.DB) error {
		cree, err := auth.CreerUtilisateur(tx, in, statut)
		if err != nil {
			return err
		}
		if _, err := portefeuilles.ObtenirOuCreerPortefeuille(tx, cree.ID); err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			AdministrateurID: &adminID, Action: "utilisateur:creation", TableCible: "utilisateurs",
			IdentifiantCible: &cree.ID,
			Nouvelle:         map[string]any{"nomUtilisateur": cree.NomUtilisateur, "email": cree.Email, "statut": cree.Statut},
			AdresseIP:        ip,
		})
		u = cree
		return nil
	})
	return u, err
}

// SupprimerLogiquement anonymise un compte — statut `supprime`, e-mail
// `supprime-<id>@quiperd.invalid`, pseudo `supprime_<8 premiers caractères de l'id>`,
// téléphone et photo vidés — après avoir vérifié, sous verrou, qu'aucun argent ni aucun
// match n'est en jeu : solde bloqué nul, aucun défi `ouvert`, aucun match `en_cours`,
// `verification` ou `litige`. La ligne reste en base (historique des matchs, audit).
// La révocation des sessions est faite par l'appelant, hors transaction.
func SupprimerLogiquement(db *gorm.DB, adminID, id uuid.UUID, ip string) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var u auth.Utilisateur
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrIntrouvable
			}
			return err
		}
		if u.Statut == auth.StatutSupprime {
			return ErrDejaSupprime
		}
		// Verrou du portefeuille : aucune mise ne peut être bloquée pendant la vérification
		// (BloquerMise verrouille la même ligne).
		var p portefeuilles.Portefeuille
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("utilisateur_id = ?", id).First(&p).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err == nil && p.SoldeBloque.GreaterThan(decimal.Zero) {
			return ErrSoldeBloque
		}
		var n int64
		if err := tx.Model(&defis.Defi{}).
			Where("createur_id = ? AND statut = ?", id, defis.StatutOuvert).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return ErrDefiOuvert
		}
		if err := tx.Model(&matchs.MatchDefi{}).
			Where("(joueur_1_id = ? OR joueur_2_id = ?) AND statut IN ?", id, id,
				[]string{matchs.StatutEnCours, matchs.StatutVerification, matchs.StatutLitige}).
			Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return ErrMatchEnCours
		}

		maj := map[string]any{
			"statut":          auth.StatutSupprime,
			"email":           "supprime-" + id.String() + "@quiperd.invalid",
			"nom_utilisateur": "supprime_" + id.String()[:8],
			"telephone":       "",
			"photo_profil":    "",
		}
		if err := tx.Model(&auth.Utilisateur{}).Where("id = ?", id).Updates(maj).Error; err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			AdministrateurID: &adminID, Action: "utilisateur:suppression", TableCible: "utilisateurs",
			IdentifiantCible: &id,
			Ancienne:         map[string]any{"nomUtilisateur": u.NomUtilisateur, "email": u.Email, "statut": u.Statut},
			Nouvelle:         map[string]any{"statut": auth.StatutSupprime},
			AdresseIP:        ip,
		})
		return nil
	})
}
