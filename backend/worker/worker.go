// Package worker exécute les tâches Asynq (handlers). Il importe les modules
// métier ; les modules, eux, n'importent que le package jobs (enfilage) — pas de cycle.
package worker

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"go.uber.org/zap"
	"quiperd/backend/config"
	"quiperd/backend/courriel"
	"quiperd/backend/defis"
	"quiperd/backend/jobs"
	"quiperd/backend/litiges"
	"quiperd/backend/matchs"
	"quiperd/backend/notifications"
	"quiperd/backend/paiements"
	"quiperd/backend/utils"
)

// Demarrer lance le serveur Asynq (worker) dans une goroutine.
// Renvoie le serveur pour permettre un arrêt propre.
func Demarrer(cfg *config.Config) *asynq.Server {
	addr, password, db := config.OptionsAsynq(cfg)
	srv := asynq.NewServer(
		asynq.RedisClientOpt{Addr: addr, Password: password, DB: db},
		asynq.Config{
			Concurrency: 10,
			// La file `courriel` est distincte : une session SMTP lente ne doit jamais
			// occuper les ouvriers qui tranchent les échéances de match.
			Queues:         map[string]int{"default": 5, "push": 3, jobs.FileCourriel: 2},
			RetryDelayFunc: asynq.RetryDelayFunc(delaiRetentative),
		},
	)

	mux := asynq.NewServeMux()
	mux.HandleFunc(jobs.TypeDefiExpiration, gererDefiExpiration)
	mux.HandleFunc(jobs.TypePaiementReverif, gererPaiementReverif)
	mux.HandleFunc(jobs.TypeNotificationPush, gererPush)
	mux.HandleFunc(jobs.TypeLitigeRelance, gererLitigeRelance)
	mux.HandleFunc(jobs.TypeMatchEcheance, gererMatchEcheance)
	mux.HandleFunc(jobs.TypeCourrielEnvoi, gererCourriel)

	go func() {
		if err := srv.Run(mux); err != nil && utils.Log != nil {
			utils.Log.Error("worker Asynq arrêté", zap.Error(err))
		}
	}()
	return srv
}

// delaiRetentative espace explicitement les tentatives d'envoi d'e-mail (30 s, 2 min,
// 10 min, 30 min) et laisse la politique par défaut d'Asynq pour toutes les autres tâches.
func delaiRetentative(n int, err error, t *asynq.Task) time.Duration {
	if t != nil && t.Type() == jobs.TypeCourrielEnvoi {
		delais := jobs.DelaisRetentativeCourriel
		if n >= 0 && n < len(delais) {
			return delais[n]
		}
		return delais[len(delais)-1]
	}
	return asynq.DefaultRetryDelayFunc(n, err, t)
}

// gererCourriel envoie un e-mail transactionnel. Une adresse illisible ne se répare pas
// en réessayant : la tâche est archivée immédiatement (SkipRetry). Toute autre panne
// (SMTP injoignable, authentification momentanément refusée) est retentée.
func gererCourriel(ctx context.Context, t *asynq.Task) error {
	var p jobs.ChargeCourriel
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return nil // charge illisible : rejouer n'y changerait rien
	}
	err := courriel.Envoyer(p.Destinataire, courriel.Message{Sujet: p.Sujet, Texte: p.Texte, HTML: p.HTML})
	if errors.Is(err, courriel.ErrAdresseInvalide) {
		if utils.Log != nil {
			utils.Log.Warn("courriel abandonné : adresse invalide", zap.String("sujet", p.Sujet))
		}
		return asynq.SkipRetry
	}
	return err
}

func gererDefiExpiration(ctx context.Context, t *asynq.Task) error {
	var p jobs.ChargeDefiExpiration
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	id, err := uuid.Parse(p.DefiID)
	if err != nil {
		return nil
	}
	return defis.ExpirerSiOuvert(id)
}

func gererPaiementReverif(ctx context.Context, t *asynq.Task) error {
	var p jobs.ChargePaiementReverif
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	id, err := uuid.Parse(p.PaiementID)
	if err != nil {
		return nil
	}
	paiements.Reverifier(id, p.Tentative)
	return nil
}

func gererPush(ctx context.Context, t *asynq.Task) error {
	var p jobs.ChargeNotificationPush
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	id, err := uuid.Parse(p.UtilisateurID)
	if err != nil {
		return nil
	}
	jeton := notifications.JetonFCMUtilisateur(config.DB, id)
	return utils.EnvoyerPush(jeton, p.Titre, p.Message, p.Type)
}

func gererLitigeRelance(ctx context.Context, t *asynq.Task) error {
	var p jobs.ChargeLitigeRelance
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	id, err := uuid.Parse(p.LitigeID)
	if err != nil {
		return nil
	}
	return litiges.RelancerSiEnCours(id)
}

// gererMatchEcheance applique l'expiration d'un chrono de match : victoire au déclarant
// (confirmation), ouverture du litige (preuve) ou partage automatique (choix après un nul).
// matchs.TraiterEcheance est idempotent : rejouer la tâche est sans effet.
func gererMatchEcheance(ctx context.Context, t *asynq.Task) error {
	var p jobs.ChargeMatchEcheance
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	id, err := uuid.Parse(p.MatchID)
	if err != nil {
		return nil
	}
	return matchs.TraiterEcheance(id, p.Type, p.Manche)
}
