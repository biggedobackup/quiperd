// Package comptes_gamers relie le compte Défis en Ligne à l'identifiant du joueur
// dans chaque jeu/plateforme.
package comptes_gamers

import (
	"time"

	"defisenligne/backend/auth"
	"defisenligne/backend/config"
	"defisenligne/backend/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// CompteGamer (table 4).
type CompteGamer struct {
	utils.ModeleBase
	UtilisateurID     uuid.UUID `gorm:"type:uuid;index" json:"utilisateurId"`
	JeuID             uuid.UUID `gorm:"type:uuid" json:"jeuId"`
	PlateformeID      uuid.UUID `gorm:"type:uuid" json:"plateformeId"`
	IdentifiantJoueur string    `gorm:"type:varchar(150)" json:"identifiantJoueur"`
	NomAffichage      string    `gorm:"type:varchar(150)" json:"nomAffichage"`
	DateModification  time.Time `gorm:"autoUpdateTime" json:"dateModification"`
}

func (CompteGamer) TableName() string { return "comptes_gamers" }

type entree struct {
	JeuID             string `json:"jeuId" validate:"required,uuid"`
	PlateformeID      string `json:"plateformeId" validate:"required,uuid"`
	IdentifiantJoueur string `json:"identifiantJoueur" validate:"required,min=1"`
	NomAffichage      string `json:"nomAffichage"`
}

// existeActif vérifie qu'une entrée du catalogue (jeux / plateformes) existe et est active.
func existeActif(table string, id uuid.UUID) bool {
	var n int64
	config.DB.Table(table).Where("id = ? AND statut = ?", id, "actif").Count(&n)
	return n > 0
}

// Lister godoc
// @Summary Mes identifiants de joueur par jeu/plateforme
// @Tags comptes-gamers
// @Security BearerAuth
// @Success 200 {array} CompteGamer
// @Router /comptes-gamers [get]
func Lister(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	var liste []CompteGamer
	if err := config.DB.Where("utilisateur_id = ?", userID).Order("date_creation DESC").Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	return utils.OK(c, liste)
}

// Creer godoc
// @Summary Ajouter un identifiant de joueur (jeu + plateforme)
// @Tags comptes-gamers
// @Security BearerAuth
// @Success 201 {object} CompteGamer
// @Router /comptes-gamers [post]
func Creer(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	var in entree
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	jeuID, _ := uuid.Parse(in.JeuID)
	platID, _ := uuid.Parse(in.PlateformeID)
	if !existeActif("jeux", jeuID) {
		return utils.Erreur(c, fiber.StatusBadRequest, "jeu invalide ou inactif")
	}
	if !existeActif("plateformes", platID) {
		return utils.Erreur(c, fiber.StatusBadRequest, "plateforme invalide ou inactive")
	}
	cg := CompteGamer{
		UtilisateurID: userID, JeuID: jeuID, PlateformeID: platID,
		IdentifiantJoueur: in.IdentifiantJoueur, NomAffichage: in.NomAffichage,
	}
	if err := config.DB.Create(&cg).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "création impossible")
	}
	return utils.OK(c, cg, fiber.StatusCreated)
}

// Modifier godoc
// @Summary Modifier un identifiant de joueur (propriétaire)
// @Tags comptes-gamers
// @Security BearerAuth
// @Success 200 {object} CompteGamer
// @Router /comptes-gamers/{id} [patch]
func Modifier(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	var cg CompteGamer
	if err := config.DB.First(&cg, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "compte gamer introuvable")
	}
	if cg.UtilisateurID != userID {
		return utils.Erreur(c, fiber.StatusForbidden, "ce compte ne vous appartient pas")
	}
	var in entree
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if in.IdentifiantJoueur != "" {
		cg.IdentifiantJoueur = in.IdentifiantJoueur
	}
	if in.NomAffichage != "" {
		cg.NomAffichage = in.NomAffichage
	}
	if in.JeuID != "" {
		v, err := uuid.Parse(in.JeuID)
		if err != nil || !existeActif("jeux", v) {
			return utils.Erreur(c, fiber.StatusBadRequest, "jeu invalide ou inactif")
		}
		cg.JeuID = v
	}
	if in.PlateformeID != "" {
		v, err := uuid.Parse(in.PlateformeID)
		if err != nil || !existeActif("plateformes", v) {
			return utils.Erreur(c, fiber.StatusBadRequest, "plateforme invalide ou inactive")
		}
		cg.PlateformeID = v
	}
	if err := config.DB.Save(&cg).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "mise à jour impossible")
	}
	return utils.OK(c, cg)
}

// Supprimer godoc
// @Summary Supprimer un identifiant de joueur (propriétaire)
// @Tags comptes-gamers
// @Security BearerAuth
// @Success 204
// @Router /comptes-gamers/{id} [delete]
func Supprimer(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	var cg CompteGamer
	if err := config.DB.First(&cg, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "compte gamer introuvable")
	}
	if cg.UtilisateurID != userID {
		return utils.Erreur(c, fiber.StatusForbidden, "ce compte ne vous appartient pas")
	}
	if err := config.DB.Delete(&CompteGamer{}, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "suppression impossible")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// Enregistrer monte les routes des comptes gamers (toutes protégées, propriétaire uniquement).
func Enregistrer(api fiber.Router) {
	grp := api.Group("/comptes-gamers", auth.Connecte())
	grp.Get("/", Lister)
	grp.Post("/", Creer)
	grp.Patch("/:id", Modifier)
	grp.Delete("/:id", Supprimer)
}
