package utils

import (
	"context"
	"os"
	"testing"
)

// TestFCMJetonAcces vérifie que le compte de service désigné par FCM_CREDENTIALS_FILE est
// réellement accepté par Google : PEM lisible, clé RSA valide, assertion signée, jeton obtenu.
//
// Il touche le réseau, donc il ne s'exécute QUE si le fichier existe — sur une machine sans
// compte de service (intégration continue, poste d'un nouveau développeur), il s'ignore.
//
// Ce qu'il attrape et qu'aucune relecture ne voit : une clé révoquée, un compte de service
// désactivé, une horloge locale décalée (l'assertion est refusée si `iat` est dans le futur).
// Autant de pannes qui, sans lui, ne se manifesteraient que par des notifications qui
// n'arrivent jamais.
func TestFCMJetonAcces(t *testing.T) {
	chemin := os.Getenv("FCM_CREDENTIALS_FILE")
	if chemin == "" {
		chemin = "../secrets/fcm-compte-service.json"
	}
	if _, err := os.Stat(chemin); err != nil {
		t.Skip("pas de compte de service FCM sur cette machine : " + chemin)
	}

	if err := InitialiserFCM(chemin); err != nil {
		t.Fatalf("chargement du compte de service : %v", err)
	}
	if ProjetFCM() == "" {
		t.Fatal("project_id vide après chargement")
	}

	jeton, err := fcm.jetonAcces(context.Background())
	if err != nil {
		t.Fatalf("échange du jeton d'accès refusé par Google : %v", err)
	}
	if jeton == "" {
		t.Fatal("jeton d'accès vide")
	}

	// Deuxième appel : doit revenir du cache, sans repasser par le réseau.
	if encore, err := fcm.jetonAcces(context.Background()); err != nil || encore != jeton {
		t.Fatalf("le jeton devrait être mis en cache (err=%v)", err)
	}
	t.Logf("projet %s : jeton d'accès obtenu (%d caractères), expiration %s",
		ProjetFCM(), len(jeton), fcm.expireLe.Format("15:04:05"))
}
