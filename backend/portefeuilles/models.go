package portefeuilles

import (
	"encoding/json"
	"time"

	"defisenligne/backend/utils"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
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
	UtilisateurID   uuid.UUID       `gorm:"type:uuid;uniqueIndex" json:"utilisateurId"`
	Devise          string          `gorm:"type:varchar(10);default:'XOF'" json:"devise"`
	SoldeDisponible decimal.Decimal `gorm:"type:numeric(15,2);default:0" json:"soldeDisponible"`
	SoldeBloque     decimal.Decimal `gorm:"type:numeric(15,2);default:0" json:"soldeBloque"`

	// SoldeNonJoue — part du solde disponible qui vient d'un dépôt et n'a pas encore été
	// misée sur un défi. Elle N'EST PAS retirable : on ne dépose pas de l'argent pour le
	// reprendre aussitôt, il faut l'avoir engagé dans l'arène. Le solde vraiment retirable
	// est donc `SoldeDisponible − SoldeNonJoue`, exposé tel quel sous `soldeRetirable`
	// pour que les clients n'aient pas à refaire la soustraction.
	//
	// Alimenté par un dépôt confirmé, consommé par une mise bloquée, et remis en place si
	// la mise revient SANS avoir été jouée (défi annulé ou expiré). Une mise qui a donné
	// lieu à un match, elle, a joué : ce qui en revient est librement retirable.
	SoldeNonJoue decimal.Decimal `gorm:"type:numeric(15,2);default:0" json:"soldeNonJoue"`

	DateModification time.Time `gorm:"autoUpdateTime" json:"dateModification"`
}

// SoldeRetirable — ce que le joueur peut réellement demander en retrait, frais compris.
// Jamais négatif : un arrondi ou une correction manuelle ne doit pas produire un montant
// négatif à l'écran.
func (p Portefeuille) SoldeRetirable() decimal.Decimal {
	r := p.SoldeDisponible.Sub(p.SoldeNonJoue)
	if r.LessThan(decimal.Zero) {
		return decimal.Zero
	}
	return r
}

// MarshalJSON ajoute `soldeRetirable` au portefeuille sérialisé : c'est un champ calculé,
// pas une colonne, mais tous les clients en ont besoin pour plafonner le champ « montant »
// d'un retrait et pour l'expliquer au joueur.
func (p Portefeuille) MarshalJSON() ([]byte, error) {
	type alias Portefeuille
	return json.Marshal(struct {
		alias
		SoldeRetirable decimal.Decimal `json:"soldeRetirable"`
	}{alias(p), p.SoldeRetirable()})
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

	// PartNonJouee — combien, dans cette mise, provenait d'un dépôt encore jamais joué.
	// Sans ce détail, un défi annulé rendrait « non retirable » de l'argent qui venait en
	// réalité d'un gain : on ne saurait pas quelle part restituer au compteur. On mémorise
	// donc, au moment du blocage, ce que la mise a effectivement consommé.
	PartNonJouee decimal.Decimal `gorm:"type:numeric(15,2);default:0" json:"partNonJouee"`
}

func (Mise) TableName() string { return "mises" }
