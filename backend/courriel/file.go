package courriel

import (
	"strings"

	"quiperd/backend/jobs"
)

// Enfiler programme l'envoi d'un message : le contrôleur rend la main immédiatement,
// le worker Asynq (`courriel:envoi`) parle au serveur SMTP. C'est le SEUL point d'entrée
// des modules métier — appeler Envoyer depuis une requête HTTP ferait attendre le client
// le temps de la poignée de main TLS et de l'authentification Office 365.
//
// Ne renvoie rien : un e-mail non parti ne doit jamais faire échouer l'action métier ni
// annuler une transaction. L'échec est journalisé côté worker.
func Enfiler(destinataire string, m Message) {
	if strings.TrimSpace(destinataire) == "" || m.Sujet == "" {
		return
	}
	jobs.EnfilerCourriel(destinataire, m.Sujet, m.Texte, m.HTML)
}
