package paiements

import (
	"defisenligne/backend/tempsreel"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ChargeStatut — paiement.statut : dépôt ou retrait ayant changé d'état (webhook Mobile
// Money, validation manuelle). Diffusé UNIQUEMENT sur le salon privé du joueur concerné.
type ChargeStatut struct {
	PaiementID uuid.UUID       `json:"paiementId"`
	Type       string          `json:"type"`
	Statut     string          `json:"statut"`
	Montant    decimal.Decimal `json:"montant"`
	Devise     string          `json:"devise"`
}

// ChargeATraiter — admin.paiement_a_traiter : un retrait attend un traitement humain.
type ChargeATraiter struct {
	PaiementID    uuid.UUID       `json:"paiementId"`
	Type          string          `json:"type"`
	Montant       decimal.Decimal `json:"montant"`
	UtilisateurID uuid.UUID       `json:"utilisateurId"`
}

func chargeStatut(p *Paiement, statut string) ChargeStatut {
	return ChargeStatut{
		PaiementID: p.ID, Type: p.Type, Statut: statut,
		Montant: p.Montant, Devise: p.Devise,
	}
}

// AjouterStatut met en tampon paiement.statut (salon privé du joueur). À utiliser DANS une
// transaction : la diffusion n'a lieu qu'après le commit.
func AjouterStatut(tampon *tempsreel.Tampon, p *Paiement, statut string) {
	if tampon == nil || p == nil {
		return
	}
	tampon.Ajouter(tempsreel.EvtPaiementStatut, chargeStatut(p, statut),
		tempsreel.SalonUtilisateur(p.UtilisateurID))
}

// PublierStatut diffuse immédiatement paiement.statut. Réservé aux appels HORS transaction
// (création d'un dépôt : la ligne est déjà écrite et committée).
func PublierStatut(p *Paiement, statut string) {
	if p == nil {
		return
	}
	tempsreel.Publier(tempsreel.EvtPaiementStatut, chargeStatut(p, statut),
		tempsreel.SalonUtilisateur(p.UtilisateurID))
}

// AjouterATraiter met en tampon admin.paiement_a_traiter (salon admin).
func AjouterATraiter(tampon *tempsreel.Tampon, p *Paiement) {
	if tampon == nil || p == nil {
		return
	}
	tampon.Ajouter(tempsreel.EvtAdminPaiementATraiter, ChargeATraiter{
		PaiementID: p.ID, Type: p.Type, Montant: p.Montant, UtilisateurID: p.UtilisateurID,
	}, tempsreel.SalonAdmin)
}
