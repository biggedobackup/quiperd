// Package worker exécute les tâches Asynq (handlers). Il importe les modules
// métier ; les modules, eux, n'importent que le package jobs (enfilage) — pas de cycle.
package worker

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"quiperd/backend/config"
	"quiperd/backend/defis"
	"quiperd/backend/jobs"
	"quiperd/backend/litiges"
	"quiperd/backend/notifications"
	"quiperd/backend/paiements"
	"quiperd/backend/utils"
	"go.uber.org/zap"
)

// Demarrer lance le serveur Asynq (worker) dans une goroutine.
// Renvoie le serveur pour permettre un arrêt propre.
func Demarrer(cfg *config.Config) *asynq.Server {
	addr, password, db := config.OptionsAsynq(cfg)
	srv := asynq.NewServer(
		asynq.RedisClientOpt{Addr: addr, Password: password, DB: db},
		asynq.Config{
			Concurrency: 10,
			Queues:      map[string]int{"default": 5, "push": 3},
		},
	)

	mux := asynq.NewServeMux()
	mux.HandleFunc(jobs.TypeDefiExpiration, gererDefiExpiration)
	mux.HandleFunc(jobs.TypePaiementReverif, gererPaiementReverif)
	mux.HandleFunc(jobs.TypeNotificationPush, gererPush)
	mux.HandleFunc(jobs.TypeLitigeRelance, gererLitigeRelance)

	go func() {
		if err := srv.Run(mux); err != nil && utils.Log != nil {
			utils.Log.Error("worker Asynq arrêté", zap.Error(err))
		}
	}()
	return srv
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
