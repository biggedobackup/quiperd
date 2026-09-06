// Package plateformes — catalogue des plateformes (PC, consoles, mobile), classées par famille.
// Lecture publique, gestion réservée aux administrateurs.
package plateformes

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"quiperd/backend/auth"
	"quiperd/backend/config"
	"quiperd/backend/utils"
)

// Familles de plateforme.
const (
	FamillePC      = "pc"
	FamilleConsole = "console"
	FamilleMobile  = "mobile"
)

// Familles liste les valeurs admises.
var Familles = []string{FamillePC, FamilleConsole, FamilleMobile}

// Plateforme — catalogue des plateformes (table 3).
type Plateforme struct {
	utils.ModeleBase
	Nom     string `gorm:"type:varchar(50);uniqueIndex" json:"nom"`
	Famille string `gorm:"type:varchar(20);index;default:'console'" json:"famille"`
	Statut  string `gorm:"type:varchar(20);default:'actif'" json:"statut"`
}

func (Plateforme) TableName() string { return "plateformes" }

type entree struct {
	Nom     string `json:"nom" validate:"required,min=1"`
	Famille string `json:"famille" validate:"required,oneof=pc console mobile"`
	Statut  string `json:"statut" validate:"omitempty,oneof=actif inactif"`
}

type entreeModification struct {
	Nom     string `json:"nom"`
	Famille string `json:"famille" validate:"omitempty,oneof=pc console mobile"`
	Statut  string `json:"statut" validate:"omitempty,oneof=actif inactif"`
}

// Lister godoc
// @Summary Catalogue des plateformes (public : actives ; admin : toutes) — ?famille= pour filtrer
// @Tags plateformes
// @Success 200 {array} Plateforme
// @Router /plateformes [get]
func Lister(c fiber.Ctx) error {
	var liste []Plateforme
	q := config.DB.Order("famille ASC, nom ASC")
	if !auth.EstAdmin(c) {
		q = q.Where("statut = ?", "actif")
	}
	if f := c.Query("famille"); f != "" {
		q = q.Where("famille = ?", f)
	}
	if err := q.Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture du catalogue impossible")
	}
	return utils.OK(c, liste)
}

// Creer godoc
// @Summary Ajouter une plateforme (admin) — famille obligatoire (pc, console, mobile)
// @Tags plateformes
// @Security BearerAuth
// @Success 201 {object} Plateforme
// @Router /plateformes [post]
func Creer(c fiber.Ctx) error {
	var in entree
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	statut := in.Statut
	if statut == "" {
		statut = "actif"
	}
	p := Plateforme{Nom: in.Nom, Famille: in.Famille, Statut: statut}
	if err := config.DB.Create(&p).Error; err != nil {
		return utils.Erreur(c, fiber.StatusConflict, "cette plateforme existe déjà")
	}
	return utils.OK(c, p, fiber.StatusCreated)
}

// Modifier godoc
// @Summary Modifier une plateforme (admin) : nom, famille, statut
// @Tags plateformes
// @Security BearerAuth
// @Success 200 {object} Plateforme
// @Router /plateformes/{id} [patch]
func Modifier(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	var p Plateforme
	if err := config.DB.First(&p, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "plateforme introuvable")
	}
	var in entreeModification
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	if in.Nom != "" {
		p.Nom = in.Nom
	}
	if in.Famille != "" {
		p.Famille = in.Famille
	}
	if in.Statut != "" {
		p.Statut = in.Statut
	}
	if err := config.DB.Save(&p).Error; err != nil {
		return utils.Erreur(c, fiber.StatusConflict, "mise à jour impossible (nom déjà pris ?)")
	}
	return utils.OK(c, p)
}

// Supprimer godoc
// @Summary Supprimer une plateforme (admin)
// @Tags plateformes
// @Security BearerAuth
// @Success 204
// @Router /plateformes/{id} [delete]
func Supprimer(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	if err := config.DB.Delete(&Plateforme{}, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "suppression impossible")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// Enregistrer monte les routes du catalogue plateformes.
func Enregistrer(api fiber.Router) {
	api.Get("/plateformes", auth.Optionnel(), Lister)
	grp := api.Group("/plateformes", auth.Connecte(), auth.AdminSeul())
	grp.Post("/", Creer)
	grp.Patch("/:id", Modifier)
	grp.Delete("/:id", Supprimer)
}
