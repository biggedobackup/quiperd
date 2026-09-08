// Outil de recette : déclenche, depuis un PROCESSUS SÉPARÉ, les traitements différés que le
// worker Asynq exécuterait normalement des minutes ou des heures plus tard.
//
// Il sert à vérifier deux choses qu'aucun appel d'API ne peut prouver :
//   - le comportement des échéances (expiration d'un défi, abandon faute de confirmation,
//     preuve non déposée, choix de match nul non fait) sans attendre le délai réel ;
//   - que la diffusion temps réel traverse bien Redis Pub/Sub ENTRE PROCESSUS : ce programme
//     n'a aucun socket ouvert, et pourtant les clients connectés à l'API doivent être servis.
//     C'est exactement la situation d'un worker déployé séparément de l'API.
//
// Usage, depuis le dossier backend (l'API doit tourner en parallèle) :
//
//	go run ./tests/outils/declencher defi-expiration <identifiant-du-defi>
//	go run ./tests/outils/declencher match-echeance <identifiant-du-match> <confirmation|preuve|choix_nul> [manche]
//
// Réservé aux recettes : il n'appelle que les vrais chemins de code métier, jamais la base
// directement. Il n'est référencé par aucun binaire de production.
package main

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"

	"defisenligne/backend/config"
	"defisenligne/backend/defis"
	"defisenligne/backend/matchs"
	"defisenligne/backend/tempsreel"
	"defisenligne/backend/utils"
)

func main() {
	if len(os.Args) < 3 {
		usage()
	}
	commande := os.Args[1]

	cfg := config.Charger()
	utils.InitLogger(false)
	defer utils.Sync()
	if err := config.ConnecterDB(cfg); err != nil {
		echouer("connexion PostgreSQL impossible", err)
	}
	if err := config.ConnecterRedis(cfg); err != nil {
		echouer("connexion Redis impossible", err)
	}

	// Le socle temps réel doit tourner ici aussi : c'est lui qui pousse la diffusion sur le canal
	// Redis auquel l'API est abonnée. Sans lui, l'événement n'atteindrait aucun joueur.
	tempsreel.Demarrer()

	switch commande {
	case "defi-expiration":
		id := identifiant(os.Args[2], "défi")
		if err := defis.ExpirerSiOuvert(id); err != nil {
			echouer("expiration du défi impossible", err)
		}
		fmt.Println("défi expiré :", id)

	case "match-echeance":
		if len(os.Args) < 4 {
			usage()
		}
		id := identifiant(os.Args[2], "match")
		typ := os.Args[3]
		manche := 1
		if len(os.Args) > 4 {
			n, err := strconv.Atoi(os.Args[4])
			if err != nil {
				echouer("manche invalide", err)
			}
			manche = n
		}
		if err := matchs.TraiterEcheance(id, typ, manche); err != nil {
			echouer("traitement de l'échéance impossible", err)
		}
		fmt.Printf("échéance « %s » traitée sur le match %s (manche %d)\n", typ, id, manche)

	default:
		usage()
	}

	// La publication est asynchrone (goroutine dédiée) : on lui laisse le temps de partir avant
	// de rendre la main, sinon l'arrêt du processus la ferait disparaître.
	time.Sleep(750 * time.Millisecond)
}

func identifiant(brut, quoi string) uuid.UUID {
	id, err := uuid.Parse(brut)
	if err != nil {
		echouer("identifiant de "+quoi+" invalide", err)
	}
	return id
}

func echouer(message string, err error) {
	fmt.Fprintln(os.Stderr, message+" :", err)
	os.Exit(1)
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage :")
	fmt.Fprintln(os.Stderr, "  go run ./tests/outils/declencher defi-expiration <identifiant-du-defi>")
	fmt.Fprintln(os.Stderr, "  go run ./tests/outils/declencher match-echeance <identifiant-du-match> <confirmation|preuve|choix_nul> [manche]")
	os.Exit(2)
}
