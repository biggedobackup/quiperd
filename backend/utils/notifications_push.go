package utils

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
)

// PushActif indique si l'envoi FCM réel est configuré (renseigné au démarrage).
var PushActif bool

// EnvoyerPush envoie une notification push via Firebase Cloud Messaging.
//
// Tant que `PushActif` est faux (FCM_ACTIF=false, ou compte de service absent), l'appel est
// journalisé sans échouer : toute la chaîne — création de la notification, enfilage Asynq,
// worker — continue de fonctionner et reste testable de bout en bout sans compte Firebase.
// C'est ce qui permet à la recette de tourner en local.
//
// Le `cible` est l'identifiant de l'objet concerné (match, défi, paiement) : l'application s'en
// sert pour ouvrir directement le bon écran quand le joueur appuie sur la bannière, plutôt que
// de le déposer sur l'accueil.
func EnvoyerPush(jetonFCM, titre, message, typ, cible string) error {
	if !PushActif || jetonFCM == "" || fcm == nil {
		if Log != nil {
			Log.Info("push FCM (simulé — inactif ou sans jeton)",
				zap.String("titre", titre), zap.String("type", typ))
		}
		return nil
	}

	// Le worker a déjà sa propre reprise sur erreur : on borne seulement l'appel réseau pour
	// ne pas immobiliser un ouvrier sur un FCM qui ne répond pas.
	ctx, annuler := context.WithTimeout(context.Background(), 15*time.Second)
	defer annuler()

	err := fcm.envoyer(ctx, jetonFCM, titre, message, typ, cible)
	if err != nil && Log != nil {
		// Un jeton devenu invalide n'est pas une panne : l'application a été désinstallée ou
		// ses données effacées. On le signale sans bruit, l'appelant décide de l'oublier.
		Log.Info("push FCM non délivré", zap.String("type", typ), zap.Error(err))
	}
	if err == nil && Log != nil {
		Log.Info("push FCM envoyé", zap.String("titre", titre), zap.String("type", typ))
	}
	return err
}

// --- Diffusion à plusieurs joueurs ---

// TopicDefisOuverts regroupe les appareils qui veulent être prévenus qu'un défi vient d'être
// ouvert. C'est un abonnement fait par l'application au démarrage, pas une liste tenue en base :
// annoncer un défi coûte alors UN appel à FCM, quel que soit le nombre de joueurs.
const TopicDefisOuverts = "defis-ouverts"

// TopicUtilisateur nomme le topic propre à un joueur. Il ne sert pas à lui parler — pour ça on a
// son jeton d'appareil — mais à l'EXCLURE d'une diffusion : annoncer à quelqu'un le défi qu'il
// vient lui-même de créer serait absurde.
func TopicUtilisateur(utilisateurID string) string {
	return "utilisateur-" + utilisateurID
}

// EnvoyerPushDefiCree annonce un nouveau défi à tous les appareils abonnés, sauf ceux de son auteur.
func EnvoyerPushDefiCree(auteurID, titre, message, cible string) error {
	condition := fmt.Sprintf("'%s' in topics", TopicDefisOuverts)
	if auteurID != "" {
		condition += fmt.Sprintf(" && !('%s' in topics)", TopicUtilisateur(auteurID))
	}
	return envoyerDiffusion(condition, titre, message, "defi_cree", cible)
}

func envoyerDiffusion(condition, titre, message, typ, cible string) error {
	if !PushActif || fcm == nil {
		if Log != nil {
			Log.Info("diffusion push FCM (simulée — inactive)",
				zap.String("titre", titre), zap.String("condition", condition))
		}
		return nil
	}

	ctx, annuler := context.WithTimeout(context.Background(), 15*time.Second)
	defer annuler()

	err := fcm.envoyerCondition(ctx, condition, titre, message, typ, cible)
	if err != nil && Log != nil {
		Log.Info("diffusion push FCM non délivrée", zap.String("type", typ), zap.Error(err))
	}
	if err == nil && Log != nil {
		Log.Info("diffusion push FCM envoyée", zap.String("titre", titre), zap.String("type", typ))
	}
	return err
}
