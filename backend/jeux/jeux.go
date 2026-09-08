// Package jeux — catalogue des jeux (ouvert à tous les jeux compétitifs, classés par catégorie).
// Lecture publique, gestion réservée aux administrateurs.
package jeux

import (
	"defisenligne/backend/auth"
	"defisenligne/backend/config"
	"defisenligne/backend/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// Catégories de jeu (valeurs françaises en snake_case, charte API).
const (
	CategorieSport     = "sport"
	CategorieCombat    = "combat"
	CategorieCourse    = "course"
	CategorieTir       = "tir"
	CategorieStrategie = "strategie"
	CategorieCartes    = "cartes"
	CategorieArcade    = "arcade"
)

// Categories liste les valeurs admises (validation des entrées admin).
var Categories = []string{CategorieSport, CategorieCombat, CategorieCourse, CategorieTir, CategorieStrategie, CategorieCartes, CategorieArcade}

// Jeu — catalogue des jeux (table 2).
type Jeu struct {
	utils.ModeleBase
	Nom       string `gorm:"type:varchar(100);uniqueIndex" json:"nom"`
	Categorie string `gorm:"type:varchar(50);index;default:'sport'" json:"categorie"`

	Statut string `gorm:"type:varchar(20);default:'actif'" json:"statut"`
}

func (Jeu) TableName() string { return "jeux" }

type entreeJeu struct {
	Nom       string `json:"nom" validate:"required,min=2"`
	Categorie string `json:"categorie" validate:"required,oneof=sport combat course tir strategie cartes arcade"`
	Statut    string `json:"statut" validate:"omitempty,oneof=actif inactif"`
}

type entreeJeuModification struct {
	Nom       string `json:"nom"`
	Categorie string `json:"categorie" validate:"omitempty,oneof=sport combat course tir strategie cartes arcade"`
	Statut    string `json:"statut" validate:"omitempty,oneof=actif inactif"`
}

// Lister godoc
// @Summary Catalogue des jeux (public : actifs ; admin : tous) — ?categorie= pour filtrer
// @Tags jeux
// @Success 200 {array} Jeu
// @Router /jeux [get]
func Lister(c fiber.Ctx) error {
	var jeux []Jeu
	q := config.DB.Order("categorie ASC, nom ASC")
	if !auth.EstAdmin(c) {
		q = q.Where("statut = ?", "actif")
	}
	if cat := c.Query("categorie"); cat != "" {
		q = q.Where("categorie = ?", cat)
	}
	if err := q.Find(&jeux).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture du catalogue impossible")
	}
	return utils.OK(c, jeux)
}

// Creer godoc
// @Summary Ajouter un jeu (admin) — catégorie obligatoire
// @Tags jeux
// @Security BearerAuth
// @Success 201 {object} Jeu
// @Router /jeux [post]
func Creer(c fiber.Ctx) error {
	var in entreeJeu
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
	j := Jeu{Nom: in.Nom, Categorie: in.Categorie, Statut: statut}
	if err := config.DB.Create(&j).Error; err != nil {
		return utils.Erreur(c, fiber.StatusConflict, "ce jeu existe déjà")
	}
	return utils.OK(c, j, fiber.StatusCreated)
}

// Modifier godoc
// @Summary Modifier un jeu (admin) : nom, catégorie, statut
// @Tags jeux
// @Security BearerAuth
// @Success 200 {object} Jeu
// @Router /jeux/{id} [patch]
func Modifier(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	var j Jeu
	if err := config.DB.First(&j, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "jeu introuvable")
	}
	var in entreeJeuModification
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	if in.Nom != "" {
		j.Nom = in.Nom
	}
	if in.Categorie != "" {
		j.Categorie = in.Categorie
	}
	if in.Statut != "" {
		j.Statut = in.Statut
	}
	if err := config.DB.Save(&j).Error; err != nil {
		return utils.Erreur(c, fiber.StatusConflict, "mise à jour impossible (nom déjà pris ?)")
	}
	return utils.OK(c, j)
}

// Supprimer godoc
// @Summary Supprimer un jeu (admin)
// @Tags jeux
// @Security BearerAuth
// @Success 204
// @Router /jeux/{id} [delete]
func Supprimer(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	if err := config.DB.Delete(&Jeu{}, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "suppression impossible")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// Enregistrer monte les routes du catalogue jeux.
func Enregistrer(api fiber.Router) {
	// Lecture publique ; l'admin (jeton présent) voit aussi les entrées inactives.
	api.Get("/jeux", auth.Optionnel(), Lister)
	grp := api.Group("/jeux", auth.Connecte(), auth.AdminSeul())
	grp.Post("/", Creer)
	grp.Patch("/:id", Modifier)
	grp.Delete("/:id", Supprimer)
}
