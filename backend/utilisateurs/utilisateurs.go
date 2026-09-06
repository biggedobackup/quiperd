// Package utilisateurs — gestion administrateur des comptes (liste paginée, création,
// détail avec portefeuille, modification, suppression logique, statut) et mise à jour
// du profil par son propriétaire.
package utilisateurs

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"quiperd/backend/administration"
	"quiperd/backend/auth"
	"quiperd/backend/config"
	"quiperd/backend/utils"
)

// Lister godoc
// @Summary Liste des comptes (admin) — paginée, 10 par page, plus récents d'abord
// @Tags utilisateurs
// @Security BearerAuth
// @Param page query int false "Page (défaut 1)"
// @Param taille query int false "Éléments par page (1..100, défaut 10)"
// @Param recherche query string false "Pseudo ou e-mail (recherche partielle)"
// @Param statut query string false "actif | suspendu | en_attente | supprime"
// @Success 200 {object} utils.Page[auth.Utilisateur]
// @Router /utilisateurs [get]
func Lister(c fiber.Ctx) error {
	page, taille, offset := utils.Pagination(c)
	q := config.DB.Model(&auth.Utilisateur{})
	if s := c.Query("statut"); s != "" {
		q = q.Where("statut = ?", s)
	}
	if rech := c.Query("recherche"); rech != "" {
		like := "%" + rech + "%"
		q = q.Where("nom_utilisateur ILIKE ? OR email ILIKE ?", like, like)
	}
	q = q.Session(&gorm.Session{}) // base réutilisable : un COUNT puis un SELECT paginé
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	liste := []auth.Utilisateur{}
	if err := q.Order("date_creation DESC").Limit(taille).Offset(offset).Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	return utils.OK(c, utils.NouvellePage(liste, total, page, taille))
}

// EntreeModification est le corps de PATCH /utilisateurs/:id. Un joueur ne modifie que
// nomUtilisateur, telephone, photoProfil et pays de son propre profil ; email, statut et
// motDePasse sont réservés à l'administrateur (403 sinon).
type EntreeModification struct {
	NomUtilisateur string `json:"nomUtilisateur" validate:"omitempty,min=3,max=50"`
	Email          string `json:"email" validate:"omitempty,email"`
	Telephone      string `json:"telephone"`
	PhotoProfil    string `json:"photoProfil"`
	Pays           string `json:"pays"`
	Statut         string `json:"statut" validate:"omitempty,oneof=actif suspendu en_attente"`
	MotDePasse     string `json:"motDePasse" validate:"omitempty,min=6"`
}

// Modifier godoc
// @Summary Mettre à jour un compte (propriétaire : profil ; admin : tout, dont email, statut, motDePasse)
// @Tags utilisateurs
// @Security BearerAuth
// @Param corps body EntreeModification true "Champs à modifier (tous facultatifs)"
// @Success 200 {object} auth.Utilisateur
// @Failure 403 {object} map[string]any
// @Failure 409 {object} map[string]any
// @Router /utilisateurs/{id} [patch]
func Modifier(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	moi := auth.UtilisateurIDDe(c)
	admin := auth.EstAdmin(c)
	if !admin && moi != id {
		return utils.Erreur(c, fiber.StatusForbidden, "vous ne pouvez modifier que votre propre profil")
	}
	var u auth.Utilisateur
	if err := config.DB.First(&u, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "utilisateur introuvable")
	}
	var in EntreeModification
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	if !admin && (in.Email != "" || in.Statut != "" || in.MotDePasse != "") {
		return utils.Erreur(c, fiber.StatusForbidden, "email, statut et motDePasse sont réservés à l'administrateur")
	}
	if u.Statut == auth.StatutSupprime {
		return utils.Erreur(c, fiber.StatusConflict, "compte supprimé : modification impossible")
	}
	nomPris, emailPris := identifiantsPris(config.DB, id, in.NomUtilisateur, in.Email)
	if nomPris {
		return utils.Erreur(c, fiber.StatusConflict, "nom d'utilisateur déjà utilisé")
	}
	if emailPris {
		return utils.Erreur(c, fiber.StatusConflict, "email déjà utilisé")
	}

	maj := map[string]any{}
	journal := map[string]any{} // jamais le hash du mot de passe
	if in.NomUtilisateur != "" {
		maj["nom_utilisateur"] = in.NomUtilisateur
		journal["nomUtilisateur"] = in.NomUtilisateur
	}
	if in.Email != "" {
		maj["email"] = strings.ToLower(in.Email)
		journal["email"] = maj["email"]
	}
	if in.Telephone != "" {
		maj["telephone"] = in.Telephone
		journal["telephone"] = in.Telephone
	}
	if in.PhotoProfil != "" {
		maj["photo_profil"] = in.PhotoProfil
		journal["photoProfil"] = in.PhotoProfil
	}
	if in.Pays != "" {
		maj["pays"] = in.Pays
		journal["pays"] = in.Pays
	}
	if in.Statut != "" {
		maj["statut"] = in.Statut
		journal["statut"] = in.Statut
	}
	if in.MotDePasse != "" {
		hash, err := auth.HacherMotDePasse(in.MotDePasse)
		if err != nil {
			return utils.Erreur(c, fiber.StatusInternalServerError, "mise à jour impossible")
		}
		maj["mot_de_passe"] = hash
		journal["motDePasse"] = "modifié"
	}
	if len(maj) == 0 {
		return utils.OK(c, u)
	}

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&auth.Utilisateur{}).Where("id = ?", id).Updates(maj).Error; err != nil {
			return err
		}
		p := administration.ParamsAudit{
			Action: "utilisateur:modification", TableCible: "utilisateurs",
			IdentifiantCible: &id, Nouvelle: journal, AdresseIP: c.IP(),
		}
		if admin {
			p.AdministrateurID = &moi
		} else {
			p.UtilisateurID = &moi
		}
		administration.Journaliser(tx, p)
		return nil
	})
	if err != nil {
		// Course avec une autre création/modification : l'index unique tranche.
		return utils.Erreur(c, fiber.StatusConflict, "mise à jour impossible (nom ou email déjà pris ?)")
	}
	// Suspension ou nouveau mot de passe → toutes les sessions du joueur sont révoquées
	// (liste blanche Redis + sessions_utilisateurs), comme pour la route /statut.
	if in.Statut == auth.StatutSuspendu || in.MotDePasse != "" {
		_ = auth.InvaliderToutesSessions(id)
	}
	config.DB.First(&u, "id = ?", id)
	return utils.OK(c, u)
}

type entreeStatut struct {
	Statut string `json:"statut" validate:"required,oneof=actif suspendu"`
}

// ChangerStatut godoc
// @Summary Activer / suspendre un compte (admin)
// @Tags utilisateurs
// @Security BearerAuth
// @Router /utilisateurs/{id}/statut [patch]
func ChangerStatut(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	adminID := auth.UtilisateurIDDe(c)
	var in entreeStatut
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	var u auth.Utilisateur
	if err := config.DB.First(&u, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "utilisateur introuvable")
	}
	if u.Statut == auth.StatutSupprime {
		return utils.Erreur(c, fiber.StatusConflict, "compte supprimé : statut non modifiable")
	}
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&auth.Utilisateur{}).Where("id = ?", id).
			Update("statut", in.Statut).Error; err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			AdministrateurID: &adminID, Action: "utilisateur:statut_" + in.Statut,
			TableCible: "utilisateurs", IdentifiantCible: &id, AdresseIP: c.IP(),
		})
		return nil
	})
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "mise à jour impossible")
	}
	// Suspension → invalider toutes les sessions actives du joueur.
	if in.Statut == auth.StatutSuspendu {
		_ = auth.InvaliderToutesSessions(id)
	}
	return utils.OK(c, fiber.Map{"statut": in.Statut})
}

// Enregistrer monte les routes des utilisateurs.
func Enregistrer(api fiber.Router) {
	grp := api.Group("/utilisateurs", auth.Connecte())
	grp.Get("/", auth.AdminSeul(), Lister)
	grp.Post("/", auth.AdminSeul(), Creer)
	grp.Get("/:id", auth.AdminSeul(), Detail)
	grp.Patch("/:id", Modifier)
	grp.Delete("/:id", auth.AdminSeul(), Supprimer)
	grp.Patch("/:id/statut", auth.AdminSeul(), ChangerStatut)
}
