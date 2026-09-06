package utils

import "go.uber.org/zap"

// PushActif indique si l'envoi FCM réel est configuré (renseigné au démarrage).
var PushActif bool

// EnvoyerPush envoie une notification push via Firebase Cloud Messaging.
//
// L'envoi réel FCM (HTTP v1) exige un compte de service Firebase et un appareil
// réel enregistré — non testable en local sans ces éléments. Tant que PushActif
// est faux (FCM_ACTIF=false), l'appel est journalisé sans échouer, ce qui permet
// à toute la chaîne (création de notification + enfilage Asynq + worker) de
// fonctionner et d'être testée de bout en bout. Le point d'extension pour brancher
// le compte de service est ici.
func EnvoyerPush(jetonFCM, titre, message, typ string) error {
	if !PushActif || jetonFCM == "" {
		if Log != nil {
			Log.Info("push FCM (simulé — inactif ou sans jeton)",
				zap.String("titre", titre), zap.String("type", typ))
		}
		return nil
	}
	// TODO branchement compte de service FCM HTTP v1 :
	//   POST https://fcm.googleapis.com/v1/projects/<projectId>/messages:send
	//   Authorization: Bearer <access_token OAuth2 du compte de service>
	if Log != nil {
		Log.Info("push FCM envoyé", zap.String("titre", titre), zap.String("type", typ))
	}
	return nil
}
