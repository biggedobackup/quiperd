package paiements

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"quiperd/backend/administration"
	"quiperd/backend/config"
	"quiperd/backend/jobs"
	"quiperd/backend/notifications"
	"quiperd/backend/portefeuilles"
	"quiperd/backend/utils"
	"go.uber.org/zap"
)

func reference() string { return "PAY-" + uuid.NewString() }

// Deposer crée un dépôt et initie le paiement chez le prestataire.
// Renvoie le paiement et, si le prestataire est configuré, l'URL de paiement hébergée.
func Deposer(userID uuid.UUID, montant decimal.Decimal, prestataire, nomClient, email, numero string) (*Paiement, string, error) {
	if montant.LessThanOrEqual(decimal.Zero) {
		return nil, "", errors.New("montant invalide")
	}
	p := &Paiement{
		UtilisateurID: userID, Type: TypeDepot, Prestataire: prestataire,
		Montant: montant, Devise: "XOF", Reference: reference(), Statut: StatutEnAttente,
	}
	if err := config.DB.Create(p).Error; err != nil {
		return nil, "", err
	}

	var urlPaiement, token string
	var err error
	switch prestataire {
	case PrestataireLigdicash:
		urlPaiement, token, err = CreerFactureLigdicash(p, nomClient, email)
	case PrestataireFusionMoney:
		urlPaiement, token, err = CreerPaiementFusion(p, nomClient, numero)
	default:
		err = errors.New("prestataire inconnu")
	}
	if err != nil {
		// On conserve le paiement en_attente (validable manuellement) et on journalise.
		if utils.Log != nil {
			utils.Log.Warn("création paiement prestataire échouée", zap.Error(err), zap.String("ref", p.Reference))
		}
		return p, "", err
	}
	config.DB.Model(p).Update("reference_prestataire", token)
	p.ReferencePrestataire = token

	// Polling de secours : 1er contrôle à +2 min si aucun callback (skill).
	jobs.EnfilerPaiementReverif(p.ID.String(), 1, 2*time.Minute)
	return p, urlPaiement, nil
}

// Retirer réserve immédiatement montant + frais de retrait sur le solde disponible
// (jamais sur le solde bloqué) et crée une demande de retrait en attente de
// traitement/validation. Les frais (configurations_financieres.frais_retrait) ne
// sont acquis à la plateforme que si le retrait réussit ; un retrait échoué
// rembourse montant + frais.
func Retirer(userID uuid.UUID, montant decimal.Decimal, prestataire, numero string) (*Paiement, error) {
	if montant.LessThanOrEqual(decimal.Zero) {
		return nil, errors.New("montant invalide")
	}
	var p *Paiement
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		frais := montant.Mul(administration.FraisRetrait(tx)).Round(2)
		pai := &Paiement{
			UtilisateurID: userID, Type: TypeRetrait, Prestataire: prestataire,
			Montant: montant, Frais: frais, Devise: "XOF", Reference: reference(), Statut: StatutEnAttente,
		}
		if err := tx.Create(pai).Error; err != nil {
			return err
		}
		if err := portefeuilles.DebiterRetrait(tx, userID, montant, frais, pai.Reference, "Retrait "+prestataire+" vers "+numero); err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &userID, Action: "paiement:retrait_demande", TableCible: "paiements",
			IdentifiantCible: &pai.ID, Nouvelle: map[string]any{"montant": montant, "frais": frais, "numero": numero},
		})
		p = pai
		return nil
	})
	if errors.Is(err, portefeuilles.ErrSoldeInsuffisant) {
		return nil, portefeuilles.ErrSoldeInsuffisant
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

// AppliquerReussiteDepot crédite le portefeuille une seule fois (idempotent).
// paidEffectif = montant réellement payé (ligdicash: amount ; fusion: Montant+frais ;
// validation admin: montant attendu). Refuse le crédit en cas d'écart de montant.
func AppliquerReussiteDepot(paiementID uuid.UUID, paidEffectif decimal.Decimal, operateur string) error {
	return config.DB.Transaction(func(tx *gorm.DB) error {
		// Idempotence : transition atomique en_attente -> reussi.
		res := tx.Model(&Paiement{}).
			Where("id = ? AND type = ? AND statut = ? AND traite = false", paiementID, TypeDepot, StatutEnAttente).
			Updates(map[string]any{"traite": true, "statut": StatutReussi, "operateur": operateur})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil // déjà traité
		}
		var p Paiement
		if err := tx.First(&p, "id = ?", paiementID).Error; err != nil {
			return err
		}
		// Contrôle de cohérence du montant (tolérance 1 unité).
		if paidEffectif.LessThan(p.Montant.Sub(decimal.NewFromInt(1))) {
			if utils.Log != nil {
				utils.Log.Warn("écart de montant sur dépôt — crédit refusé",
					zap.String("ref", p.Reference), zap.String("attendu", p.Montant.String()),
					zap.String("recu", paidEffectif.String()))
			}
			return errors.New("écart de montant détecté")
		}
		if err := portefeuilles.Crediter(tx, p.UtilisateurID, p.Montant, p.Reference, "Dépôt confirmé ("+p.Prestataire+")"); err != nil {
			return err
		}
		_ = notifications.Creer(tx, p.UtilisateurID, "Dépôt confirmé",
			"Votre dépôt a été crédité sur votre portefeuille.", notifications.TypePaiementConfirme)
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &p.UtilisateurID, Action: "paiement:depot_reussi", TableCible: "paiements",
			IdentifiantCible: &p.ID,
		})
		return nil
	})
}

// Reverifier est appelé par le worker (polling de secours). Interroge le
// prestataire ; crédite si payé, se replanifie si toujours en attente.
func Reverifier(paiementID uuid.UUID, tentative int) {
	var p Paiement
	if err := config.DB.First(&p, "id = ?", paiementID).Error; err != nil {
		return
	}
	if p.Statut != StatutEnAttente || p.Traite {
		return
	}
	if p.ReferencePrestataire == "" {
		return
	}

	switch p.Prestataire {
	case PrestataireLigdicash:
		statut, amount, op, err := ConfirmerLigdicash(p.ReferencePrestataire)
		if err == nil && statut == "completed" {
			_ = AppliquerReussiteDepot(p.ID, decimal.NewFromFloat(amount), op)
			return
		}
	case PrestataireFusionMoney:
		statut, montant, frais, op, err := VerifierFusion(p.ReferencePrestataire)
		if err == nil && statut == "paid" {
			_ = AppliquerReussiteDepot(p.ID, decimal.NewFromFloat(montant+frais), op)
			return
		}
	}

	// Toujours en attente → replanifier (max 10 tentatives, intervalle 30 s).
	if tentative < 10 {
		jobs.EnfilerPaiementReverif(p.ID.String(), tentative+1, 30*time.Second)
	}
}

// TraiterCallbackLigdicash traite un callback (déjà journalisé) en arrière-plan.
func TraiterCallbackLigdicash(transactionID string) {
	id, err := uuid.Parse(transactionID)
	if err != nil {
		return
	}
	var p Paiement
	if err := config.DB.First(&p, "id = ?", id).Error; err != nil {
		return
	}
	if p.ReferencePrestataire == "" {
		return
	}
	statut, amount, op, err := ConfirmerLigdicash(p.ReferencePrestataire)
	if err == nil && statut == "completed" {
		_ = AppliquerReussiteDepot(p.ID, decimal.NewFromFloat(amount), op)
	}
}

// TraiterCallbackFusion traite un webhook MoneyFusion (déjà journalisé).
func TraiterCallbackFusion(refInterne string) {
	var p Paiement
	if err := config.DB.First(&p, "reference = ?", refInterne).Error; err != nil {
		return
	}
	if p.ReferencePrestataire == "" {
		return
	}
	statut, montant, frais, op, err := VerifierFusion(p.ReferencePrestataire)
	if err == nil && statut == "paid" {
		_ = AppliquerReussiteDepot(p.ID, decimal.NewFromFloat(montant+frais), op)
	}
}
