package defis

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"quiperd/backend/utils"
)

// Statuts de défi.
const (
	StatutOuvert  = "ouvert"
	StatutComplet = "complet"
	StatutAnnule  = "annule"
	StatutExpire  = "expire"
)

// Defi — défi de match créé par un joueur (table 5).
type Defi struct {
	utils.ModeleBase
	CreateurID       uuid.UUID       `gorm:"type:uuid;index" json:"createurId"`
	JeuID            uuid.UUID       `gorm:"type:uuid;index" json:"jeuId"`
	PlateformeID     uuid.UUID       `gorm:"type:uuid;index" json:"plateformeId"`
	MontantMise      decimal.Decimal `gorm:"type:numeric(15,2)" json:"montantMise"`
	Devise           string          `gorm:"type:varchar(10);default:'XOF'" json:"devise"`
	Regles           string          `gorm:"type:text" json:"regles"`
	Statut           string          `gorm:"type:varchar(30);default:'ouvert';index" json:"statut"`
	DateExpiration   *time.Time      `json:"dateExpiration,omitempty"`
	DateModification time.Time       `gorm:"autoUpdateTime" json:"dateModification"`
}

func (Defi) TableName() string { return "defis" }
