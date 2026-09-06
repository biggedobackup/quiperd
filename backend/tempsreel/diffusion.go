package tempsreel

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"quiperd/backend/config"
	"quiperd/backend/utils"
)

// CanalRedis est le canal Pub/Sub par lequel transitent TOUTES les diffusions.
// Chaque instance de l'API s'y abonne — y compris celle qui publie — et
// redistribue à ses propres sockets. C'est ce qui permet au worker Asynq
// (processus distinct : expiration de défi, échéances de match) de pousser un
// événement aux clients sans connaître les sockets.
const CanalRedis = "qp:temps-reel"

// tailleFilePublication borne la mémoire consommée si Redis ralentit. Au-delà,
// l'événement est retenté en diffusion locale puis abandonné avec un
// avertissement : une diffusion perdue ne doit JAMAIS faire échouer l'action
// métier qui l'a déclenchée.
const tailleFilePublication = 512

// messageDiffusion est le format transporté sur le canal Redis : l'enveloppe
// destinée au client, la liste des salons visés, et l'éventuelle connexion à
// exclure (l'émetteur d'une présence).
type messageDiffusion struct {
	Enveloppe Enveloppe `json:"enveloppe"`
	Salons    []string  `json:"salons"`
	Exclure   string    `json:"exclure,omitempty"`
}

var (
	filePublication = make(chan messageDiffusion, tailleFilePublication)

	demarrageUnique sync.Once
	arretUnique     sync.Once
	contexteHub     context.Context
	arreterHub      context.CancelFunc
	groupeHub       sync.WaitGroup
)

// ─── API publique du paquet (contrat du cahier des charges) ────────────────────

// Publier diffuse immédiatement un événement sur un ou plusieurs salons.
// À n'appeler qu'EN DEHORS d'une transaction : pour publier après un commit,
// utiliser Tampon. Ne bloque jamais l'appelant et ne panique jamais.
func Publier(evenement string, charge any, salons ...string) {
	if evenement == "" || len(salons) == 0 {
		return
	}
	enfiler(messageDiffusion{
		Enveloppe: Enveloppe{Evenement: evenement, Horodatage: horodatage(), Charge: charge},
		Salons:    nettoyerSalons(salons),
	})
}

// Tampon accumule des événements pendant une transaction et ne les diffuse
// qu'après un commit réussi :
//
//	tampon := tempsreel.NouveauTampon()
//	err := config.DB.Transaction(func(tx *gorm.DB) error { … tampon.Ajouter(…) … })
//	if err == nil { tampon.Diffuser() }
//
// Si la transaction échoue, il suffit de ne pas appeler Diffuser : rien n'est
// parti sur le réseau, les clients ne voient jamais un état annulé.
type Tampon struct {
	mu        sync.Mutex
	messages  []messageDiffusion
	diffusees bool
}

// NouveauTampon crée un tampon transactionnel vide.
func NouveauTampon() *Tampon { return &Tampon{} }

// Ajouter met un événement en attente de commit.
func (t *Tampon) Ajouter(evenement string, charge any, salons ...string) {
	if t == nil || evenement == "" || len(salons) == 0 {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.messages = append(t.messages, messageDiffusion{
		Enveloppe: Enveloppe{Evenement: evenement, Horodatage: horodatage(), Charge: charge},
		Salons:    nettoyerSalons(salons),
	})
}

// Diffuser envoie les événements accumulés, dans l'ordre d'ajout, puis vide le
// tampon (un second appel ne rediffuse rien). Ne bloque ni ne panique jamais.
func (t *Tampon) Diffuser() {
	if t == nil {
		return
	}
	t.mu.Lock()
	if t.diffusees {
		t.mu.Unlock()
		return
	}
	messages := t.messages
	t.messages = nil
	t.diffusees = true
	t.mu.Unlock()

	for _, m := range messages {
		enfiler(m)
	}
}

// Abandonner vide le tampon sans rien diffuser (transaction annulée).
func (t *Tampon) Abandonner() {
	if t == nil {
		return
	}
	t.mu.Lock()
	t.messages = nil
	t.diffusees = true
	t.mu.Unlock()
}

// JoueursEnLigne renvoie le nombre de connexions actives : le total de toutes
// les instances de l'API quand Redis répond, le total local sinon.
//
// Le total partagé n'est recalculé qu'au plus toutes les 5 s ; on ne renvoie
// donc jamais moins que ce que cette instance sert réellement à cet instant.
func JoueursEnLigne() int {
	local := hub.nombreConnexions()
	if total, ok := totalPartage(); ok && total > local {
		return total
	}
	return local
}

// ─── Publication ───────────────────────────────────────────────────────────────

// nettoyerSalons enlève les entrées vides et les doublons.
func nettoyerSalons(salons []string) []string {
	vus := make(map[string]struct{}, len(salons))
	out := make([]string, 0, len(salons))
	for _, s := range salons {
		if s == "" {
			continue
		}
		if _, deja := vus[s]; deja {
			continue
		}
		vus[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

// enfiler dépose le message dans la file de publication (non bloquant). Si la
// file est saturée, on se rabat sur les sockets locaux pour ne pas perdre
// l'information de cette instance, et on journalise.
// SurEvenement est un point d'extension branché au démarrage (main.go) : il reçoit le NOM de
// chaque événement diffusé, et rien d'autre. Il permet à un module métier de réagir au flux
// sans que tempsreel ait à l'importer — c'est ainsi que le tableau de bord administrateur
// recalcule ses compteurs quand un défi, un match ou un paiement bouge, plutôt que de semer
// des appels dans une dizaine de contrôleurs. Doit rendre la main immédiatement : il est
// appelé sur la goroutine de l'appelant métier.
var SurEvenement func(evenement string)

func enfiler(m messageDiffusion) {
	if len(m.Salons) == 0 {
		return
	}
	if SurEvenement != nil {
		SurEvenement(m.Enveloppe.Evenement)
	}
	select {
	case filePublication <- m:
	default:
		journaliser("temps réel: file de publication saturée, diffusion locale seulement",
			zap.String("evenement", m.Enveloppe.Evenement))
		hub.diffuserLocal(m.Enveloppe, m.Salons, m.Exclure)
	}
}

// bouclePublication draine la file dans une goroutine unique : l'ordre des
// événements est ainsi préservé (un `match.score_propose` précède toujours le
// `match.chrono` qui l'accompagne) et aucun appelant métier n'attend Redis.
func bouclePublication(ctx context.Context) {
	defer groupeHub.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case m := <-filePublication:
			publierSurRedis(ctx, m)
		}
	}
}

func publierSurRedis(ctx context.Context, m messageDiffusion) {
	if config.Redis == nil {
		hub.diffuserLocal(m.Enveloppe, m.Salons, m.Exclure)
		return
	}
	charge, err := json.Marshal(m)
	if err != nil {
		journaliser("temps réel: sérialisation de la diffusion impossible",
			zap.String("evenement", m.Enveloppe.Evenement), zap.Error(err))
		return
	}
	ctxPub, annuler := context.WithTimeout(ctx, 3*time.Second)
	defer annuler()
	if err := config.Redis.Publish(ctxPub, CanalRedis, charge).Err(); err != nil {
		// Redis indisponible : dégradation propre. Les clients de CETTE instance
		// sont servis quand même, l'action métier reste réussie.
		journaliser("temps réel: publication Redis impossible, repli local",
			zap.String("evenement", m.Enveloppe.Evenement), zap.Error(err))
		hub.diffuserLocal(m.Enveloppe, m.Salons, m.Exclure)
	}
}

// publierPresence est le seul événement fabriqué par le hub à partir du trafic
// client (action `presence`) ou d'une déconnexion. Il passe par Redis comme les
// autres : les deux joueurs d'un match peuvent être sur deux instances.
func publierPresence(utilisateurID uuid.UUID, present, surLaPage bool, salon, exclureConnexion string) {
	enfiler(messageDiffusion{
		Enveloppe: Enveloppe{
			Evenement:  EvtMatchPresence,
			Horodatage: horodatage(),
			Charge: map[string]any{
				"utilisateurId": utilisateurID.String(),
				"present":       present,
				"surLaPage":     surLaPage,
			},
		},
		Salons:  []string{salon},
		Exclure: exclureConnexion,
	})
}

// ─── Abonnement Redis (réception) ──────────────────────────────────────────────

// boucleAbonnement écoute le canal Pub/Sub et redistribue localement. Elle se
// reconnecte toute seule : une coupure Redis ne doit pas éteindre le temps réel
// définitivement.
func boucleAbonnement(ctx context.Context) {
	defer groupeHub.Done()
	for {
		if ctx.Err() != nil {
			return
		}
		if config.Redis == nil {
			if attendre(ctx, 5*time.Second) {
				return
			}
			continue
		}

		// Ordre imposé par go-redis : attendre la confirmation de l'abonnement
		// AVANT d'ouvrir le canal Go. Ouvrir Channel() d'abord ferait consommer la
		// confirmation par la goroutine interne et Receive resterait bloqué.
		abonnement := config.Redis.Subscribe(ctx, CanalRedis)
		if _, err := abonnement.Receive(ctx); err != nil {
			_ = abonnement.Close()
			if ctx.Err() != nil {
				return
			}
			journaliser("temps réel: abonnement Redis impossible, nouvelle tentative", zap.Error(err))
			if attendre(ctx, 5*time.Second) {
				return
			}
			continue
		}
		canal := abonnement.Channel()

		if utils.Log != nil {
			utils.Log.Info("temps réel: abonné au canal Pub/Sub " + CanalRedis)
		}

	reception:
		for {
			select {
			case <-ctx.Done():
				_ = abonnement.Close()
				return
			case message, ouvert := <-canal:
				if !ouvert {
					break reception
				}
				var m messageDiffusion
				if err := json.Unmarshal([]byte(message.Payload), &m); err != nil {
					journaliser("temps réel: message Pub/Sub illisible", zap.Error(err))
					continue
				}
				hub.diffuserLocal(m.Enveloppe, m.Salons, m.Exclure)
			}
		}

		_ = abonnement.Close()
		if attendre(ctx, 2*time.Second) {
			return
		}
	}
}

// attendre dort la durée demandée ; renvoie true si le contexte a été annulé.
func attendre(ctx context.Context, d time.Duration) bool {
	minuteur := time.NewTimer(d)
	defer minuteur.Stop()
	select {
	case <-ctx.Done():
		return true
	case <-minuteur.C:
		return false
	}
}

// ─── Démarrage / arrêt ─────────────────────────────────────────────────────────

// Demarrer lance les goroutines du socle temps réel : publication vers Redis,
// abonnement au canal Pub/Sub et compteur de joueurs en ligne. Idempotent.
func Demarrer() {
	demarrageUnique.Do(func() {
		contexteHub, arreterHub = context.WithCancel(context.Background())
		groupeHub.Add(3)
		go bouclePublication(contexteHub)
		go boucleAbonnement(contexteHub)
		go boucleCompteur(contexteHub)
	})
}

// Arreter ferme proprement : les goroutines s'arrêtent, chaque socket reçoit une
// trame de fermeture, et l'empreinte de l'instance disparaît du compteur partagé.
func Arreter() {
	arretUnique.Do(func() {
		if arreterHub != nil {
			arreterHub()
		}
		fermerToutesLesConnexions()
		oublierInstance()
		groupeHub.Wait()
	})
}

func fermerToutesLesConnexions() {
	hub.mu.RLock()
	connexions := make([]*Connexion, 0, len(hub.connexions))
	for _, c := range hub.connexions {
		connexions = append(connexions, c)
	}
	hub.mu.RUnlock()
	for _, c := range connexions {
		c.fermer()
	}
}
