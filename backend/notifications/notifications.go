// Package notifications gère les notifications utilisateur (in-app + push FCM).
package notifications

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"quiperd/backend/auth"
	"quiperd/backend/config"
	"quiperd/backend/jobs"
	"quiperd/backend/utils"
)

// Types de notification.
const (
	TypeDefiRejoint       = "defi_rejoint"
	TypeDefiExpire        = "defi_expire"
	TypeMatchAValider     = "match_a_valider"
	TypeMatchTermine      = "match_termine"
	TypeLitigeOuvert      = "litige_ouvert"
	TypeLitigeResolu      = "litige_resolu"
	TypePaiementConfirme  = "paiement_confirme"
	TypePaiementEchoue    = "paiement_echoue"
)

// Notification (table 14).
type Notification struct {
	utils.ModeleBase
	UtilisateurID uuid.UUID `gorm:"type:uuid;index" json:"utilisateurId"`
	Titre         string    `gorm:"type:varchar(255)" json:"titre"`
	Message       string    `gorm:"type:text" json:"message"`
	Type          string    `gorm:"type:varchar(50)" json:"type"`
	Lu            bool      `gorm:"default:false;index" json:"lu"`
}

func (Notification) TableName() string { return "notifications" }

// Creer enregistre une notification et enfile un push FCM (jamais bloquant).
// Peut être appelée dans une transaction métier (tx) ou avec config.DB.
func Creer(tx *gorm.DB, utilisateurID uuid.UUID, titre, message, typ string) error {
	n := Notification{UtilisateurID: utilisateurID, Titre: titre, Message: message, Type: typ}
	if err := tx.Create(&n).Error; err != nil {
		return err
	}
	jobs.EnfilerPush(utilisateurID.String(), titre, message, typ)
	return nil
}

// Lister godoc
// @Summary Mes notifications
// @Tags notifications
// @Security BearerAuth
// @Success 200 {array} Notification
// @Router /notifications [get]
func Lister(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	var liste []Notification
	if err := config.DB.Where("utilisateur_id = ?", userID).
		Order("date_creation DESC").Limit(100).Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	return utils.OK(c, liste)
}

// MarquerLue godoc
// @Summary Marquer une notification comme lue
// @Tags notifications
// @Security BearerAuth
// @Router /notifications/{id}/lue [post]
func MarquerLue(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	res := config.DB.Model(&Notification{}).
		Where("id = ? AND utilisateur_id = ?", id, userID).Update("lu", true)
	if res.Error != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "mise à jour impossible")
	}
	if res.RowsAffected == 0 {
		return utils.Erreur(c, fiber.StatusNotFound, "notification introuvable")
	}
	return utils.OK(c, fiber.Map{"lu": true})
}

type entreeFCM struct {
	JetonFCM string `json:"jetonFcm" validate:"required"`
	Appareil string `json:"appareil"`
}

// EnregistrerFCM godoc
// @Summary Enregistrer le jeton FCM de l'appareil courant (push)
// @Tags notifications
// @Security BearerAuth
// @Router /notifications/jeton-fcm [post]
func EnregistrerFCM(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	var in entreeFCM
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	var sess auth.SessionUtilisateur
	err := config.DB.Where("utilisateur_id = ?", userID).
		Order("derniere_utilisation DESC").First(&sess).Error
	if err != nil {
		sess = auth.SessionUtilisateur{
			UtilisateurID:  userID,
			JetonFCM:       in.JetonFCM,
			Appareil:       in.Appareil,
			DateExpiration: time.Now().UTC().Add(90 * 24 * time.Hour),
		}
		if err := config.DB.Create(&sess).Error; err != nil {
			return utils.Erreur(c, fiber.StatusInternalServerError, "enregistrement impossible")
		}
	} else {
		sess.JetonFCM = in.JetonFCM
		if in.Appareil != "" {
			sess.Appareil = in.Appareil
		}
		config.DB.Save(&sess)
	}
	return utils.OK(c, fiber.Map{"enregistre": true})
}

// JetonFCMUtilisateur renvoie le dernier jeton FCM connu d'un utilisateur (pour le worker push).
func JetonFCMUtilisateur(db *gorm.DB, userID uuid.UUID) string {
	var sess auth.SessionUtilisateur
	if err := db.Where("utilisateur_id = ? AND jeton_fcm <> ''", userID).
		Order("derniere_utilisation DESC").First(&sess).Error; err != nil {
		return ""
	}
	return sess.JetonFCM
}

// Enregistrer monte les routes des notifications (toutes protégées).
func Enregistrer(api fiber.Router) {
	grp := api.Group("/notifications", auth.Connecte())
	grp.Get("/", Lister)
	grp.Post("/jeton-fcm", EnregistrerFCM)
	grp.Post("/:id/lue", MarquerLue)
}
