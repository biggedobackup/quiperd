package portefeuilles

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"quiperd/backend/utils"
)

// Statuts de mise.
const (
	MiseBloquee    = "bloquee"
	MiseGagnee     = "gagnee"
	MisePerdue     = "perdue"
	MiseRemboursee = "remboursee"
)

// Types de transaction (table 12).
const (
	TxDepot         = "depot"
	TxMiseBloquee   = "mise_bloquee"
	TxGain          = "gain"
	TxCommission    = "commission"
	TxRemboursement = "remboursement"
	TxRetrait       = "retrait"
)

// Portefeuille — solde financier d'un joueur (table 11).
type Portefeuille struct {
	utils.ModeleBase
	UtilisateurID    uuid.UUID       `gorm:"type:uuid;uniqueIndex" json:"utilisateurId"`
	Devise           string          `gorm:"type:varchar(10);default:'XOF'" json:"devise"`
	SoldeDisponible  decimal.Decimal `gorm:"type:numeric(15,2);default:0" json:"soldeDisponible"`
	SoldeBloque      decimal.Decimal `gorm:"type:numeric(15,2);default:0" json:"soldeBloque"`
	DateModification time.Time       `gorm:"autoUpdateTime" json:"dateModification"`
}

func (Portefeuille) TableName() string { return "portefeuilles" }

// TransactionPortefeuille — historique de tous les mouvements (table 12).
type TransactionPortefeuille struct {
	utils.ModeleBase
	PortefeuilleID uuid.UUID       `gorm:"type:uuid;index" json:"portefeuilleId"`
	MiseID         *uuid.UUID      `gorm:"type:uuid" json:"miseId,omitempty"`
	MatchID        *uuid.UUID      `gorm:"type:uuid" json:"matchId,omitempty"`
	Type           string          `gorm:"type:varchar(30);index" json:"type"`
	Montant        decimal.Decimal `gorm:"type:numeric(15,2)" json:"montant"`
	Statut         string          `gorm:"type:varchar(20);default:'valide'" json:"statut"`
	Reference      string          `gorm:"type:varchar(100);uniqueIndex" json:"reference"`
	Description    string          `gorm:"type:text" json:"description"`
}

func (TransactionPortefeuille) TableName() string { return "transactions_portefeuilles" }

// Mise — argent engagé par un joueur, cœur de l'escrow (table 7).
type Mise struct {
	utils.ModeleBase
	DefiID        uuid.UUID       `gorm:"type:uuid;index" json:"defiId"`
	UtilisateurID uuid.UUID       `gorm:"type:uuid;index" json:"utilisateurId"`
	Montant       decimal.Decimal `gorm:"type:numeric(15,2)" json:"montant"`
	Devise        string          `gorm:"type:varchar(10);default:'XOF'" json:"devise"`
	Statut        string          `gorm:"type:varchar(20);default:'bloquee'" json:"statut"`
}

func (Mise) TableName() string { return "mises" }
