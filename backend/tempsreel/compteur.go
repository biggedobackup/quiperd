package tempsreel

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"defisenligne/backend/config"
)

// Compteur de joueurs en ligne, partagé entre les instances de l'API.
//
// Chaque instance écrit son propre total dans le hachage Redis `ws:enligne`
// (champ = identifiant d'instance, valeur = « <nombre>:<horodatage unix> »).
// Le total global est la somme des champs récents ; un champ plus vieux que
// `fraicheurInstance` est ignoré puis supprimé — c'est le garde-fou contre la
// dérive si un processus meurt sans se désinscrire. Le hachage lui-même porte
// une expiration de sécurité, il ne survit donc pas à l'arrêt de la plateforme.
const (
	cleHachageEnLigne = "ws:enligne"
	fraicheurInstance = 30 * time.Second
	expirationHachage = 5 * time.Minute
	// intervalleCompteur : cadence de rafraîchissement ET de débattement de
	// l'événement compteur.en_ligne (au plus une diffusion toutes les 5 s).
	intervalleCompteur = 5 * time.Second
)

var (
	identifiantInstance = uuid.NewString()

	compteurMu       sync.Mutex
	dernierTotal     = -1 // dernière valeur diffusée (-1 = jamais diffusée)
	totalConnu       int
	totalConnuValide bool

	// signalCompteur réveille la boucle dès qu'une connexion s'ouvre ou se ferme,
	// sans jamais bloquer l'appelant (canal de capacité 1).
	signalCompteur = make(chan struct{}, 1)
)

// signalerChangementCompteur demande un recalcul anticipé du compteur.
func signalerChangementCompteur() {
	select {
	case signalCompteur <- struct{}{}:
	default:
	}
}

// boucleCompteur tient l'empreinte Redis de l'instance à jour et diffuse
// `compteur.en_ligne` sur le salon public — au plus une fois toutes les 5 s, et
// seulement quand la valeur a changé.
func boucleCompteur(ctx context.Context) {
	defer groupeHub.Done()
	minuteur := time.NewTicker(intervalleCompteur)
	defer minuteur.Stop()

	rafraichir(ctx)
	dernier := time.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case <-minuteur.C:
			rafraichir(ctx)
			dernier = time.Now()
		case <-signalCompteur:
			// Débattement en front montant : une connexion qui s'ouvre ou se ferme
			// est prise en compte tout de suite si le dernier calcul date de plus de
			// 5 s, sinon elle attend simplement le tic suivant.
			if time.Since(dernier) < intervalleCompteur {
				continue
			}
			rafraichir(ctx)
			dernier = time.Now()
		}
	}
}

func rafraichir(ctx context.Context) {
	local := hub.nombreConnexions()
	total := publierEmpreinte(ctx, local)

	compteurMu.Lock()
	totalConnu = total
	totalConnuValide = true
	changement := total != dernierTotal
	if changement {
		dernierTotal = total
	}
	compteurMu.Unlock()

	if !changement {
		return
	}
	// Diffusion LOCALE uniquement : chaque instance calcule le même total global
	// et le pousse à ses propres sockets. Passer par Redis ferait recevoir au
	// client autant de copies qu'il y a d'instances.
	hub.diffuserLocal(Enveloppe{
		Evenement:  EvtCompteurEnLigne,
		Horodatage: horodatage(),
		Charge:     map[string]any{"joueursEnLigne": total},
	}, []string{SalonDefisPublics}, "")
}

// publierEmpreinte écrit le total local dans Redis et renvoie le total global.
// Redis absent ou en panne : on retombe sur le total local, sans erreur.
func publierEmpreinte(ctx context.Context, local int) int {
	if config.Redis == nil {
		return local
	}
	ctxRedis, annuler := context.WithTimeout(ctx, 3*time.Second)
	defer annuler()

	valeur := strconv.Itoa(local) + ":" + strconv.FormatInt(time.Now().Unix(), 10)
	if err := config.Redis.HSet(ctxRedis, cleHachageEnLigne, identifiantInstance, valeur).Err(); err != nil {
		journaliser("temps réel: compteur en ligne non publié", zap.Error(err))
		return local
	}
	_ = config.Redis.Expire(ctxRedis, cleHachageEnLigne, expirationHachage).Err()

	champs, err := config.Redis.HGetAll(ctxRedis, cleHachageEnLigne).Result()
	if err != nil {
		journaliser("temps réel: lecture du compteur en ligne impossible", zap.Error(err))
		return local
	}

	total := 0
	limite := time.Now().Add(-fraicheurInstance).Unix()
	var perimes []string
	for instance, brut := range champs {
		nombre, vu, ok := decouperEmpreinte(brut)
		if !ok || vu < limite {
			if instance != identifiantInstance {
				perimes = append(perimes, instance)
			}
			continue
		}
		total += nombre
	}
	if len(perimes) > 0 {
		_ = config.Redis.HDel(ctxRedis, cleHachageEnLigne, perimes...).Err()
	}
	if total < local {
		// Filet de sécurité : le total ne peut pas être inférieur à ce que cette
		// instance sert réellement (horloges décalées, champ tout juste expiré).
		total = local
	}
	return total
}

func decouperEmpreinte(brut string) (nombre int, vu int64, ok bool) {
	parties := strings.SplitN(brut, ":", 2)
	if len(parties) != 2 {
		return 0, 0, false
	}
	n, err := strconv.Atoi(parties[0])
	if err != nil || n < 0 {
		return 0, 0, false
	}
	h, err := strconv.ParseInt(parties[1], 10, 64)
	if err != nil {
		return 0, 0, false
	}
	return n, h, true
}

// oublierInstance retire l'empreinte de cette instance à l'arrêt : le compteur
// des autres instances redescend immédiatement, sans attendre l'expiration.
func oublierInstance() {
	if config.Redis == nil {
		return
	}
	ctx, annuler := context.WithTimeout(context.Background(), 2*time.Second)
	defer annuler()
	_ = config.Redis.HDel(ctx, cleHachageEnLigne, identifiantInstance).Err()
}

// totalPartage renvoie le dernier total global calculé (voir JoueursEnLigne).
func totalPartage() (int, bool) {
	compteurMu.Lock()
	defer compteurMu.Unlock()
	return totalConnu, totalConnuValide
}

// compteurCourant sert à envoyer la valeur au client qui vient de s'abonner au
// salon public, sans attendre le prochain changement.
func compteurCourant() int { return JoueursEnLigne() }
