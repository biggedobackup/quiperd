// Package contact — messages envoyés depuis le formulaire de contact du site public
// (table 19 `messages_contact`). Envoi public avec anti-spam par adresse IP, consultation
// et traitement réservés aux administrateurs.
package contact

import (
	"time"

	"defisenligne/backend/utils"
	"github.com/google/uuid"
)

// Statuts de traitement d'un message (valeurs françaises en snake_case, charte API).
const (
	StatutNouveau = "nouveau"
	StatutLu      = "lu"
	StatutTraite  = "traite"
)

// Statuts liste les valeurs admises (filtre `?statut=` et PATCH admin).
var Statuts = []string{StatutNouveau, StatutLu, StatutTraite}

// StatutValide indique si la valeur fait partie des statuts admis.
func StatutValide(s string) bool {
	for _, v := range Statuts {
		if v == s {
			return true
		}
	}
	return false
}

// MessageContact — message reçu via le formulaire de contact (table 19).
// `UtilisateurID` est renseigné uniquement si un jeton joueur valide accompagnait l'envoi.
type MessageContact struct {
	utils.ModeleBase
	Nom              string     `gorm:"type:varchar(100)" json:"nom"`
	Email            string     `gorm:"type:varchar(255)" json:"email"`
	Sujet            string     `gorm:"type:varchar(150)" json:"sujet"`
	Message          string     `gorm:"type:text" json:"message"`
	Statut           string     `gorm:"type:varchar(20);default:'nouveau';index" json:"statut"`
	UtilisateurID    *uuid.UUID `gorm:"type:uuid;index" json:"utilisateurId,omitempty"`
	NoteAdmin        string     `gorm:"type:text;default:''" json:"noteAdmin"`
	DateModification time.Time  `gorm:"autoUpdateTime" json:"dateModification"`
}

func (MessageContact) TableName() string { return "messages_contact" }
