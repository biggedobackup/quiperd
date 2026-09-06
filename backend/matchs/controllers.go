package matchs

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"quiperd/backend/auth"
	"quiperd/backend/config"
	"quiperd/backend/utils"
)

// Lister godoc
// @Summary Mes matchs (tableau, ?statut=en_cours|verification|litige|termine) ; admin ?tous=1 : page utils.Page[MatchEnrichi] (10/page, ?page&taille)
// @Tags matchs
// @Security BearerAuth
// @Param statut query string false "en_cours | verification | litige | termine"
// @Param tous query int false "Admin : 1 = tous les matchs, réponse paginée"
// @Param page query int false "Admin (?tous=1) : page, défaut 1"
// @Param taille query int false "Admin (?tous=1) : éléments par page, 1..100, défaut 10"
// @Success 200 {array} MatchEnrichi
// @Router /matchs [get]
func Lister(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	if auth.EstAdmin(c) && c.Query("tous") == "1" {
		// Administration : tous les matchs, enveloppe paginée (charte API).
		page, taille, offset := utils.Pagination(c)
		liste, total, err := ListerTous(config.DB, c.Query("statut"), taille, offset)
		if err != nil {
			return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des matchs impossible")
		}
		return utils.OK(c, utils.NouvellePage(liste, total, page, taille))
	}
	liste, err := ListerPourJoueur(config.DB, userID, c.Query("statut"), false)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des matchs impossible")
	}
	return utils.OK(c, liste)
}

// Detail godoc
// @Summary Détail d'un match (libellés joueurs/jeu/plateforme + déclarations)
// @Tags matchs
// @Security BearerAuth
// @Router /matchs/{id} [get]
func Detail(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	m, err := ChargerEnrichi(config.DB, id)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	userID := auth.UtilisateurIDDe(c)
	if !auth.EstAdmin(c) && !m.EstParticipant(userID) {
		return utils.Erreur(c, fiber.StatusForbidden, "ce match ne vous concerne pas")
	}
	declarations := []ResultatDeclare{}
	config.DB.Where("match_id = ?", id).Order("date_declaration ASC").Find(&declarations)
	return utils.OK(c, fiber.Map{"match": m, "declarations": declarations})
}

type entreeDeclaration struct {
	ScorePour   int    `json:"scorePour" validate:"gte=0"`
	ScoreContre int    `json:"scoreContre" validate:"gte=0"`
	Commentaire string `json:"commentaire"`
}

// Declarer godoc
// @Summary Déclarer le score d'un match
// @Tags matchs
// @Security BearerAuth
// @Router /matchs/{id}/declaration [post]
func Declarer(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)
	var in entreeDeclaration
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		var m MatchDefi
		if err := tx.First(&m, "id = ?", id).Error; err != nil {
			return err
		}
		if !m.EstParticipant(userID) {
			return errFORBIDDEN
		}
		if e := EnregistrerDeclaration(tx, &m, userID, in.ScorePour, in.ScoreContre, in.Commentaire); e != nil {
			return e
		}
		return nil
	})
	if err == errFORBIDDEN {
		return utils.Erreur(c, fiber.StatusForbidden, "ce match ne vous concerne pas")
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusConflict, err.Error())
	}
	// Relire l'état à jour du match.
	m, _ := Charger(config.DB, id)
	return utils.OK(c, m)
}

// Valider godoc
// @Summary Valider un match (admin) — déclenche le règlement de l'escrow
// @Tags matchs
// @Security BearerAuth
// @Router /matchs/{id}/validation [post]
func Valider(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	arbitre := auth.UtilisateurIDDe(c)
	m, err := ValiderMatch(id, &arbitre)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusConflict, err.Error())
	}
	return utils.OK(c, m)
}

var errFORBIDDEN = fiberError("interdit")

type fiberError string

func (e fiberError) Error() string { return string(e) }

// Enregistrer monte les routes des matchs.
func Enregistrer(api fiber.Router) {
	grp := api.Group("/matchs", auth.Connecte())
	grp.Get("/", Lister)
	grp.Get("/:id", Detail)
	grp.Post("/:id/declaration", Declarer)
	grp.Post("/:id/validation", auth.AdminSeul(), Valider)
}
