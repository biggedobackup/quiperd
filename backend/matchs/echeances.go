package matchs

import (
	"errors"
	"time"

	"defisenligne/backend/config"
	"defisenligne/backend/jobs"
	"defisenligne/backend/tempsreel"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PoserEcheance inscrit un chrono sur le match et programme la tâche Asynq `match:echeance`
// qui tranchera à l'expiration. Elle ne publie RIEN : l'appelant annonce d'abord son
// événement métier (match.score_propose, match.desaccord, match.nul) puis appelle
// AnnoncerChrono, pour que le client reçoive toujours la cause avant le compte à rebours.
//
// La durée vient TOUJOURS de la configuration administrative (aucune constante en dur) et
// est fournie par l'appelant via administration.DelaiConfirmation / DelaiPreuve / DelaiChoixNul.
// L'identifiant de la tâche (match, type, manche) rend l'enfilage idempotent ; le handler
// revérifie l'état avant d'agir, donc une tâche enfilée pour une transaction finalement
// annulée est sans effet.
func PoserEcheance(tx *gorm.DB, m *MatchDefi, typ string, duree time.Duration) (time.Time, error) {
	echeance := time.Now().UTC().Add(duree)
	if err := tx.Model(&MatchDefi{}).Where("id = ?", m.ID).Updates(map[string]any{
		"echeance": echeance, "echeance_type": typ,
	}).Error; err != nil {
		return echeance, err
	}
	m.Echeance, m.EcheanceType = &echeance, typ
	jobs.EnfilerMatchEcheance(m.ID.String(), typ, m.Manche, duree)
	return echeance, nil
}

// AnnoncerChrono met match.chrono en tampon : le client égrène le compte à rebours depuis
// cette date, sans aucun appel réseau.
func AnnoncerChrono(tampon *tempsreel.Tampon, m *MatchDefi, typ string, echeance time.Time) {
	if tampon == nil {
		return
	}
	tampon.Ajouter(tempsreel.EvtMatchChrono, ChargeChrono{
		MatchID: m.ID, Type: typ, Manche: m.Manche, Echeance: echeance,
	}, tempsreel.SalonMatch(m.ID))
}

// TraiterEcheance est appelé par le worker Asynq (tâche match:echeance) à l'expiration d'un
// chrono. Entièrement idempotent : chaque branche est conditionnée au statut, à la manche et
// au type d'échéance encore inscrits en base, et tout mouvement d'argent passe par une
// transition atomique (même mécanique que defis.ExpirerSiOuvert et ValiderMatch).
//
//	confirmation → victoire au joueur qui a déclaré, escrow réglé en sa faveur ;
//	preuve       → ouverture du litige (arbitrage humain) ;
//	choix_nul    → partage automatique des mises.
func TraiterEcheance(matchID uuid.UUID, typ string, manche int) error {
	tampon := tempsreel.NouveauTampon()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// Verrou de la ligne match AVANT toute lecture d'état : une déclaration ou un choix
		// concurrent doit être sérialisé avec l'expiration du chrono (même ordre de verrous
		// que les contrôleurs : match, puis portefeuilles — anti-interblocage).
		m, err := ChargerVerrouille(tx, matchID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil // match supprimé : rien à faire
			}
			return err
		}
		if m.Manche != manche || m.EcheanceType != typ {
			return nil // le chrono a été remplacé (nouvelle manche, autre étape)
		}
		// Échéance déplacée après l'enfilage : on laisse la tâche suivante trancher.
		if m.Echeance != nil && m.Echeance.After(time.Now().UTC()) {
			return nil
		}

		var e error
		switch typ {
		case EcheanceConfirmation:
			if m.Statut != StatutEnCours {
				return nil
			}
			e = TerminerParAbandon(tx, tampon, m)
		case EcheancePreuve:
			if m.Statut != StatutPreuveRequise {
				return nil
			}
			_, e = PasserEnLitige(tx, tampon, m.ID, "Preuves non déposées dans le délai imparti")
		case EcheanceChoixNul:
			if m.Statut != StatutNulEnAttente {
				return nil
			}
			e = PartagerNul(tx, tampon, m, "échéance de choix dépassée")
		default:
			return nil
		}
		if errors.Is(e, ErrEtatIncoherent) {
			// Un appel concurrent (joueur ou administrateur) a déjà tranché : pas d'erreur.
			return nil
		}
		return e
	})
	if err != nil {
		return err
	}
	tampon.Diffuser()
	return nil
}
