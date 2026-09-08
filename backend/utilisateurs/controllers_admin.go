package utilisateurs

import (
	"errors"

	"defisenligne/backend/auth"
	"defisenligne/backend/config"
	"defisenligne/backend/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// EntreeCreation est le corps de POST /utilisateurs : les champs de l'inscription
// publique (mêmes règles de validation) et un statut initial facultatif.
type EntreeCreation struct {
	auth.EntreeInscription
	Statut string `json:"statut" validate:"omitempty,oneof=actif suspendu en_attente"`
}

// Creer godoc
// @Summary Créer un compte joueur (admin) — mêmes règles que l'inscription, portefeuille créé, aucune session
// @Tags utilisateurs
// @Security BearerAuth
// @Param corps body EntreeCreation true "Compte à créer"
// @Success 201 {object} auth.Utilisateur
// @Failure 400 {object} map[string]any
// @Failure 409 {object} map[string]any
// @Router /utilisateurs [post]
func Creer(c fiber.Ctx) error {
	var in EntreeCreation
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	u, err := CreerParAdmin(config.DB, auth.UtilisateurIDDe(c), in.EntreeInscription, in.Statut, c.IP())
	if errors.Is(err, auth.ErrIdentifiantsPris) {
		return utils.Erreur(c, fiber.StatusConflict, "nom d'utilisateur ou email déjà utilisé")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "création impossible")
	}
	// Un compte ouvert par l'administrateur reste soumis à la confirmation d'adresse :
	// c'est le titulaire de la boîte, pas l'administrateur, qui prouve qu'elle existe.
	_ = auth.EnvoyerCodeVerification(u)
	return utils.OK(c, u, fiber.StatusCreated)
}

// Detail godoc
// @Summary Détail d'un compte (admin) : utilisateur + portefeuille { soldeDisponible, soldeBloque }
// @Tags utilisateurs
// @Security BearerAuth
// @Success 200 {object} UtilisateurDetail
// @Failure 404 {object} map[string]any
// @Router /utilisateurs/{id} [get]
func Detail(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	var u auth.Utilisateur
	if err := config.DB.First(&u, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "utilisateur introuvable")
	}
	// Un compte supprimé (logiquement) reste consultable : statut `supprime`, données anonymisées.
	return utils.OK(c, UtilisateurDetail{Utilisateur: u, Portefeuille: resumePortefeuille(config.DB, id)})
}

// Supprimer godoc
// @Summary Suppression logique d'un compte (admin) — refusée (409) si de l'argent ou un match est en jeu
// @Tags utilisateurs
// @Security BearerAuth
// @Success 204
// @Failure 404 {object} map[string]any
// @Failure 409 {object} map[string]any
// @Router /utilisateurs/{id} [delete]
func Supprimer(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	err = SupprimerLogiquement(config.DB, auth.UtilisateurIDDe(c), id, c.IP())
	switch {
	case errors.Is(err, ErrIntrouvable):
		return utils.Erreur(c, fiber.StatusNotFound, "utilisateur introuvable")
	case errors.Is(err, ErrDejaSupprime), errors.Is(err, ErrSoldeBloque),
		errors.Is(err, ErrDefiOuvert), errors.Is(err, ErrMatchEnCours):
		return utils.Erreur(c, fiber.StatusConflict, err.Error())
	case err != nil:
		return utils.Erreur(c, fiber.StatusInternalServerError, "suppression impossible")
	}
	// Sessions révoquées (liste blanche Redis + sessions_utilisateurs) : le jeton devient 401.
	_ = auth.InvaliderToutesSessions(id)
	return c.SendStatus(fiber.StatusNoContent)
}
