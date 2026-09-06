package paiements

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"quiperd/backend/utils"
)

// Types, prestataires et statuts.
const (
	TypeDepot   = "depot"
	TypeRetrait = "retrait"

	PrestataireLigdicash   = "ligdicash"
	PrestataireFusionMoney = "fusionmoney"

	StatutEnAttente = "en_attente"
	StatutReussi    = "reussi"
	StatutEchoue    = "echoue"
	StatutRembourse = "rembourse"
)

// Paiement — dépôt ou retrait via un prestataire (table 13).
type Paiement struct {
	utils.ModeleBase
	UtilisateurID        uuid.UUID       `gorm:"type:uuid;index" json:"utilisateurId"`
	Type                 string          `gorm:"type:varchar(20)" json:"type"`
	Prestataire          string          `gorm:"type:varchar(50)" json:"prestataire"`
	Montant              decimal.Decimal `gorm:"type:numeric(15,2)" json:"montant"`
	Frais                decimal.Decimal `gorm:"type:numeric(15,2);default:0" json:"frais"` // frais de retrait (configurations_financieres.frais_retrait)
	Devise               string          `gorm:"type:varchar(10);default:'XOF'" json:"devise"`
	Reference            string          `gorm:"type:varchar(100);uniqueIndex" json:"reference"`
	ReferencePrestataire string          `gorm:"type:varchar(1024)" json:"referencePrestataire"`
	Operateur            string          `gorm:"type:varchar(50)" json:"operateur"`
	Statut               string          `gorm:"type:varchar(20);default:'en_attente';index" json:"statut"`
	Traite               bool            `gorm:"default:false" json:"traite"`
	DateModification     time.Time       `gorm:"autoUpdateTime" json:"dateModification"`
}

func (Paiement) TableName() string { return "paiements" }

// PaiementEvenement journalise chaque callback/webhook brut (traçabilité litiges).
type PaiementEvenement struct {
	utils.ModeleBase
	PaiementID  *uuid.UUID `gorm:"type:uuid;index" json:"paiementId,omitempty"`
	Prestataire string     `gorm:"type:varchar(50)" json:"prestataire"`
	Source      string     `gorm:"type:varchar(30)" json:"source"`
	Corps       string     `gorm:"type:text" json:"corps"`
}

func (PaiementEvenement) TableName() string { return "paiements_evenements" }
