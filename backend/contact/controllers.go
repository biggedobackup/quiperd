package contact

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"quiperd/backend/auth"
	"quiperd/backend/utils"
)

// MessageTropFrequent : message de la réponse 429 de l'anti-spam (contrat avec le frontend).
const MessageTropFrequent = "Trop de messages envoyés, réessayez dans une heure."

// entreeMessage — corps de POST /contact.
type entreeMessage struct {
	Nom     string `json:"nom" validate:"required,min=2,max=100"`
	Email   string `json:"email" validate:"required,email,max=255"`
	Sujet   string `json:"sujet" validate:"required,min=3,max=150"`
	Message string `json:"message" validate:"required,min=10,max=2000"`
}

// normaliser retire les espaces superflus avant validation (un nom fait d'espaces est vide).
func (e *entreeMessage) normaliser() {
	e.Nom = strings.TrimSpace(e.Nom)
	e.Email = strings.TrimSpace(e.Email)
	e.Sujet = strings.TrimSpace(e.Sujet)
	e.Message = strings.TrimSpace(e.Message)
}

// entreeTraitement — corps de PATCH /contact/:id (les deux champs sont facultatifs ;
// `noteAdmin` en pointeur pour distinguer « absent » de « vidé »).
type entreeTraitement struct {
	Statut    string  `json:"statut" validate:"omitempty,oneof=nouveau lu traite"`
	NoteAdmin *string `json:"noteAdmin" validate:"omitempty,max=2000"`
}

// Envoyer godoc
// @Summary Envoyer un message de contact (public ; jeton joueur facultatif → utilisateurId ; anti-spam 5 messages/heure/IP)
// @Tags contact
// @Param corps body entreeMessage true "nom (≥ 2), email, sujet (≥ 3), message (10 à 2000 caractères)"
// @Success 201 {object} MessageContact
// @Failure 400 {object} map[string]any "validation échouée (details par champ)"
// @Failure 429 {object} map[string]any "Trop de messages envoyés, réessayez dans une heure."
// @Router /contact [post]
func Envoyer(c fiber.Ctx) error {
	var in entreeMessage
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	in.normaliser()
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	if !AutoriserEnvoi(c.IP()) {
		return utils.Erreur(c, fiber.StatusTooManyRequests, MessageTropFrequent)
	}
	m := MessageContact{Nom: in.Nom, Email: in.Email, Sujet: in.Sujet, Message: in.Message, Statut: StatutNouveau}
	// Jeton joueur valide (auth.Optionnel) → le message est rattaché au compte. Un jeton
	// administrateur n'est pas rattaché : la colonne référence la table `utilisateurs`.
	if auth.RoleDe(c) == auth.RoleJoueur {
		if id := auth.UtilisateurIDDe(c); id != uuid.Nil {
			m.UtilisateurID = &id
		}
	}
	if err := creer(&m); err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "enregistrement du message impossible")
	}
	return utils.OK(c, m, fiber.StatusCreated)
}

// Lister godoc
// @Summary Messages de contact paginés (admin) — ?page=1&taille=10&statut=nouveau|lu|traite, plus récents d'abord
// @Tags contact
// @Security BearerAuth
// @Success 200 {object} utils.Page[MessageContact]
// @Failure 400 {object} map[string]any "statut inconnu"
// @Router /contact [get]
func Lister(c fiber.Ctx) error {
	page, taille, offset := utils.Pagination(c)
	statut := c.Query("statut")
	if statut != "" && !StatutValide(statut) {
		return utils.Erreur(c, fiber.StatusBadRequest, "statut inconnu (nouveau, lu ou traite)")
	}
	liste, total, err := lister(statut, taille, offset)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des messages impossible")
	}
	return utils.OK(c, utils.NouvellePage(liste, total, page, taille))
}

// Detail godoc
// @Summary Détail d'un message de contact (admin)
// @Tags contact
// @Security BearerAuth
// @Success 200 {object} MessageContact
// @Failure 404 {object} map[string]any "message introuvable"
// @Router /contact/{id} [get]
func Detail(c fiber.Ctx) error {
	m, err := trouver(c)
	if m == nil {
		return err
	}
	return utils.OK(c, m)
}

// Traiter godoc
// @Summary Traiter un message de contact (admin) : statut et/ou note interne — changement de statut journalisé (contact:statut_<statut>)
// @Tags contact
// @Security BearerAuth
// @Param corps body entreeTraitement true "statut (nouveau|lu|traite) et/ou noteAdmin (≤ 2000 caractères)"
// @Success 200 {object} MessageContact
// @Failure 400 {object} map[string]any "validation échouée"
// @Failure 404 {object} map[string]any "message introuvable"
// @Router /contact/{id} [patch]
func Traiter(c fiber.Ctx) error {
	m, err := trouver(c)
	if m == nil {
		return err
	}
	var in entreeTraitement
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	if in.Statut == "" && in.NoteAdmin == nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "aucune modification fournie (statut ou noteAdmin)")
	}
	if err := traiter(m, in.Statut, in.NoteAdmin, auth.UtilisateurIDDe(c), c.IP()); err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "mise à jour impossible")
	}
	return utils.OK(c, m)
}

// Supprimer godoc
// @Summary Supprimer un message de contact (admin) — journalisé (contact:suppression)
// @Tags contact
// @Security BearerAuth
// @Success 204
// @Failure 404 {object} map[string]any "message introuvable"
// @Router /contact/{id} [delete]
func Supprimer(c fiber.Ctx) error {
	m, err := trouver(c)
	if m == nil {
		return err
	}
	if err := supprimer(m, auth.UtilisateurIDDe(c), c.IP()); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return utils.Erreur(c, fiber.StatusNotFound, "message introuvable")
		}
		return utils.Erreur(c, fiber.StatusInternalServerError, "suppression impossible")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// trouver lit `:id` et charge le message. Quand il renvoie un message nul, la réponse
// d'erreur (400 identifiant mal formé, 404 introuvable, 500) est déjà écrite et le
// handler doit retourner l'erreur reçue telle quelle.
func trouver(c fiber.Ctx) (*MessageContact, error) {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return nil, utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	m, err := charger(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, utils.Erreur(c, fiber.StatusNotFound, "message introuvable")
		}
		return nil, utils.Erreur(c, fiber.StatusInternalServerError, "lecture du message impossible")
	}
	return m, nil
}
