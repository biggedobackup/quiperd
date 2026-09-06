// Package jobs définit le client Asynq (mise en file) : noms de tâches,
// charges utiles et fonctions d'enfilage. Il ne dépend que de config + asynq —
// les gestionnaires (handlers) vivent dans le package `worker` pour éviter les
// cycles d'import (un module métier enfile une tâche sans importer son handler).
package jobs

import (
	"encoding/json"
	"time"

	"github.com/hibiken/asynq"
	"quiperd/backend/config"
)

// Noms des tâches asynchrones.
const (
	TypeDefiExpiration        = "defi:expiration"
	TypePaiementReverif       = "paiement:reverification"
	TypeNotificationPush      = "notification:push"
	TypeLitigeRelance         = "litige:relance"
)

// Client est le client Asynq global (nil si Redis indisponible → enfilage ignoré).
var Client *asynq.Client

// InitClient initialise le client d'enfilage.
func InitClient(c *config.Config) {
	addr, password, db := config.OptionsAsynq(c)
	Client = asynq.NewClient(asynq.RedisClientOpt{Addr: addr, Password: password, DB: db})
}

// Fermer libère le client.
func Fermer() {
	if Client != nil {
		_ = Client.Close()
	}
}

// --- Charges utiles ---

type ChargeDefiExpiration struct {
	DefiID string `json:"defiId"`
}

type ChargePaiementReverif struct {
	PaiementID string `json:"paiementId"`
	Tentative  int    `json:"tentative"`
}

type ChargeNotificationPush struct {
	UtilisateurID string `json:"utilisateurId"`
	Titre         string `json:"titre"`
	Message       string `json:"message"`
	Type          string `json:"type"`
}

type ChargeLitigeRelance struct {
	LitigeID string `json:"litigeId"`
}

// --- Enfilage ---

// EnfilerDefiExpiration programme l'expiration d'un défi non rejoint.
func EnfilerDefiExpiration(defiID string, dans time.Duration) {
	enfiler(TypeDefiExpiration, ChargeDefiExpiration{DefiID: defiID},
		asynq.ProcessIn(dans), asynq.TaskID("defi-exp:"+defiID), asynq.MaxRetry(3))
}

// EnfilerPaiementReverif programme le polling de secours d'un paiement.
func EnfilerPaiementReverif(paiementID string, tentative int, dans time.Duration) {
	enfiler(TypePaiementReverif, ChargePaiementReverif{PaiementID: paiementID, Tentative: tentative},
		asynq.ProcessIn(dans), asynq.MaxRetry(2))
}

// EnfilerPush programme l'envoi d'une notification push FCM.
func EnfilerPush(utilisateurID, titre, message, typ string) {
	enfiler(TypeNotificationPush, ChargeNotificationPush{
		UtilisateurID: utilisateurID, Titre: titre, Message: message, Type: typ,
	}, asynq.MaxRetry(3), asynq.Queue("push"))
}

// EnfilerLitigeRelance programme un rappel à l'arbitre.
func EnfilerLitigeRelance(litigeID string, dans time.Duration) {
	enfiler(TypeLitigeRelance, ChargeLitigeRelance{LitigeID: litigeID},
		asynq.ProcessIn(dans), asynq.TaskID("litige-relance:"+litigeID), asynq.MaxRetry(2))
}

func enfiler(typ string, charge any, opts ...asynq.Option) {
	if Client == nil {
		return
	}
	data, err := json.Marshal(charge)
	if err != nil {
		return
	}
	_, _ = Client.Enqueue(asynq.NewTask(typ, data), opts...)
}
