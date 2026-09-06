package utils

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ModeleBase fournit un identifiant UUID et une date de création à tous les modèles.
// La génération d'UUID côté application (BeforeCreate) évite de dépendre d'une
// extension PostgreSQL et fonctionne de façon identique sur base vide.
type ModeleBase struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	DateCreation time.Time `gorm:"autoCreateTime" json:"dateCreation"`
}

// BeforeCreate génère l'UUID si absent. La méthode est promue aux structs
// qui embarquent ModeleBase, donc GORM l'appelle pour chacune.
func (m *ModeleBase) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}
