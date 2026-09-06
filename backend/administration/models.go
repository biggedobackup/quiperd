package administration

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"quiperd/backend/utils"
)

// Types de configuration financière (clé du champ `type`).
const (
	TypeCommissionDefi = "commission_defi"
	TypeMiseMinimale   = "mise_minimale"
	TypeMiseMaximale   = "mise_maximale"
	TypeFraisRetrait   = "frais_retrait"
)

// ConfigurationFinanciere centralise les règles financières — jamais de valeur en dur.
// (table 17 du modèle de données)
type ConfigurationFinanciere struct {
	utils.ModeleBase
	Type      string          `gorm:"type:varchar(50);index" json:"type"`
	Valeur    decimal.Decimal `gorm:"type:numeric(18,6)" json:"valeur"`
	Devise    string          `gorm:"type:varchar(10);default:'XOF'" json:"devise"`
	Statut    string          `gorm:"type:varchar(20);default:'actif'" json:"statut"`
	DateDebut time.Time       `json:"dateDebut"`
	DateFin   *time.Time      `json:"dateFin,omitempty"`
}

func (ConfigurationFinanciere) TableName() string { return "configurations_financieres" }

// JournalAudit historise toute action importante (table 16). Essentiel pour une
// application financière.
type JournalAudit struct {
	utils.ModeleBase
	UtilisateurID    *uuid.UUID `gorm:"type:uuid;index" json:"utilisateurId,omitempty"`
	AdministrateurID *uuid.UUID `gorm:"type:uuid;index" json:"administrateurId,omitempty"`
	Action           string     `gorm:"type:varchar(100);index" json:"action"`
	TableCible       string     `gorm:"type:varchar(100)" json:"tableCible"`
	IdentifiantCible *uuid.UUID `gorm:"type:uuid" json:"identifiantCible,omitempty"`
	AncienneValeur   *string    `gorm:"type:jsonb" json:"ancienneValeur,omitempty"`
	NouvelleValeur   *string    `gorm:"type:jsonb" json:"nouvelleValeur,omitempty"`
	AdresseIP        *string    `gorm:"type:inet" json:"adresseIp,omitempty"`
}

func (JournalAudit) TableName() string { return "journaux_audit" }
