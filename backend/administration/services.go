package administration

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// ParamsAudit décrit une entrée du journal d'audit à écrire.
type ParamsAudit struct {
	UtilisateurID    *uuid.UUID
	AdministrateurID *uuid.UUID
	Action           string
	TableCible       string
	IdentifiantCible *uuid.UUID
	Ancienne         any
	Nouvelle         any
	AdresseIP        string
}

// Journaliser écrit une entrée d'audit dans la transaction fournie.
// Ne renvoie pas d'erreur : un échec d'audit ne doit pas casser l'action métier,
// mais il est journalisé côté logs par l'appelant si nécessaire.
func Journaliser(tx *gorm.DB, p ParamsAudit) {
	entree := JournalAudit{
		UtilisateurID:    p.UtilisateurID,
		AdministrateurID: p.AdministrateurID,
		Action:           p.Action,
		TableCible:       p.TableCible,
		IdentifiantCible: p.IdentifiantCible,
	}
	if p.Ancienne != nil {
		if b, err := json.Marshal(p.Ancienne); err == nil {
			s := string(b)
			entree.AncienneValeur = &s
		}
	}
	if p.Nouvelle != nil {
		if b, err := json.Marshal(p.Nouvelle); err == nil {
			s := string(b)
			entree.NouvelleValeur = &s
		}
	}
	if p.AdresseIP != "" {
		entree.AdresseIP = &p.AdresseIP
	}
	_ = tx.Create(&entree).Error
}

// ConfigValeur lit la valeur active d'un type de configuration financière.
func ConfigValeur(tx *gorm.DB, typ string) (decimal.Decimal, bool) {
	var cfg ConfigurationFinanciere
	err := tx.Where("type = ? AND statut = ?", typ, "actif").
		Where("date_fin IS NULL OR date_fin > ?", time.Now().UTC()).
		Order("date_debut DESC").
		First(&cfg).Error
	if err != nil {
		return decimal.Zero, false
	}
	return cfg.Valeur, true
}

// CommissionActuelle renvoie le taux de commission (ex. 0.10 pour 10 %).
// Défaut prudent à 0 si non configuré (aucune commission plutôt qu'un taux inventé).
func CommissionActuelle(tx *gorm.DB) decimal.Decimal {
	if v, ok := ConfigValeur(tx, TypeCommissionDefi); ok {
		return v
	}
	return decimal.Zero
}

// MiseMinimale / MiseMaximale / FraisRetrait exposent les bornes financières.
func MiseMinimale(tx *gorm.DB) (decimal.Decimal, bool) { return ConfigValeur(tx, TypeMiseMinimale) }
func MiseMaximale(tx *gorm.DB) (decimal.Decimal, bool) { return ConfigValeur(tx, TypeMiseMaximale) }
func FraisRetrait(tx *gorm.DB) decimal.Decimal {
	if v, ok := ConfigValeur(tx, TypeFraisRetrait); ok {
		return v
	}
	return decimal.Zero
}
