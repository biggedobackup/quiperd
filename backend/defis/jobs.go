package defis

import (
	"fmt"

	"defisenligne/backend/administration"
	"defisenligne/backend/config"
	"defisenligne/backend/notifications"
	"defisenligne/backend/portefeuilles"
	"defisenligne/backend/tempsreel"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ExpirerSiOuvert expire un défi encore ouvert et rend sa mise au créateur, MOINS la
// commission de la plateforme (règle produit : toute mise rendue = mise × (1 − commission)).
// Appelé par le worker Asynq (tâche defi:expiration). Idempotent : seule la transition
// atomique ouvert -> expire déclenche le mouvement d'argent.
//
// C'est le worker — et non l'API — qui publie ici defi.expire : la diffusion doit donc
// traverser le Pub/Sub Redis pour atteindre les sockets des instances API (cf. cahier §1).
func ExpirerSiOuvert(defiID uuid.UUID) error {
	tampon := tempsreel.NouveauTampon()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Defi{}).Where("id = ? AND statut = ?", defiID, StatutOuvert).
			Update("statut", StatutExpire)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil // déjà rejoint, annulé ou expiré
		}
		var defi Defi
		if err := tx.First(&defi, "id = ?", defiID).Error; err != nil {
			return err
		}
		// Personne n'a rejoint ce défi : la mise revient intégralement, sans commission.
		rendu, commission, err := portefeuilles.RembourserMise(tx, defiID, defi.CreateurID, "défi expiré")
		if err != nil {
			return err
		}
		_ = notifications.Creer(tx, defi.CreateurID, "Défi expiré",
			fmt.Sprintf("Votre défi a expiré sans adversaire. Votre mise de %s %s vous a été rendue en totalité, sans commission : elle est de nouveau sur votre solde disponible.",
				defi.MontantMise.String(), defi.Devise),
			notifications.TypeDefiExpire, tampon)
		administration.Journaliser(tx, administration.ParamsAudit{
			Action: "defi:expiration", TableCible: "defis", IdentifiantCible: &defiID,
			Nouvelle: map[string]any{"statut": StatutExpire, "rendu": rendu, "commission": commission},
		})
		tampon.Ajouter(tempsreel.EvtDefiExpire, ChargeDefiID{DefiID: defiID}, tempsreel.SalonDefisPublics)
		if mise, e := portefeuilles.MiseDuDefi(tx, defiID, defi.CreateurID); e == nil {
			portefeuilles.AjouterTransactionsMise(tx, tampon, mise.ID)
		}
		portefeuilles.AjouterEtat(tx, tampon, defi.CreateurID)
		return nil
	})
	if err != nil {
		return err
	}
	tampon.Diffuser()
	return nil
}
