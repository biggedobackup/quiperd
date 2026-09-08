package administration

import (
	"time"

	"defisenligne/backend/utils"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Types de configuration financière (clé du champ `type`).
//
// Les trois derniers sont des DÉLAIS EN MINUTES de la machine à états du match : ils sont
// stockés dans la même table pour que l'administrateur puisse les régler à chaud, sans
// aucune constante en dur dans le code (règle du skill backend).
const (
	TypeCommissionDefi = "commission_defi"
	TypeMiseMinimale   = "mise_minimale"
	TypeMiseMaximale   = "mise_maximale"
	TypeFraisRetrait   = "frais_retrait"

	// TypeDelaiConfirmation — minutes laissées au second joueur pour confirmer ou
	// contredire le score proposé. À l'expiration : victoire au joueur qui a déclaré.
	TypeDelaiConfirmation = "delai_confirmation_minutes"
	// TypeDelaiPreuve — minutes laissées aux deux joueurs pour déposer leur preuve après
	// des déclarations divergentes. À l'expiration : ouverture du litige.
	TypeDelaiPreuve = "delai_preuve_minutes"
	// TypeDelaiChoixNul — minutes laissées à chaque joueur pour choisir rejouer ou
	// partager après un nul. À l'expiration : partage automatique.
	TypeDelaiChoixNul = "delai_choix_nul_minutes"
)

// Valeurs par défaut des délais (en minutes) si la configuration est absente en base.
const (
	DefautDelaiConfirmationMinutes = 30
	DefautDelaiPreuveMinutes       = 120
	DefautDelaiChoixNulMinutes     = 30
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
