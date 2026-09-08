package tempsreel

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"defisenligne/backend/utils"
)

// ─── Rôles portés par une connexion ────────────────────────────────────────────
//
// Ces valeurs recopient volontairement `auth.RoleJoueur` / `auth.RoleAdmin` :
// tempsreel n'importe pas auth (règle d'import du paquet, cf. evenements.go).
// Toute évolution des rôles côté auth doit être répercutée ici.
const (
	RoleVisiteur = "visiteur"
	RoleJoueur   = "joueur"
	RoleAdmin    = "admin"
)

// Réglages du socle. Volontairement constants : ce sont des garde-fous de
// robustesse, pas des options d'exploitation.
const (
	// tailleTamponEnvoi borne le retard qu'un client peut accumuler. Au-delà, la
	// connexion est fermée : un client lent ne doit jamais ralentir les autres.
	tailleTamponEnvoi = 64
	// maxSalonsParConnexion empêche un client d'épuiser la mémoire du hub.
	maxSalonsParConnexion = 32
	// maxSalonsParAction borne la taille d'un message `abonner` / `desabonner`.
	maxSalonsParAction = 20
)

// Connexion est un client WebSocket enregistré dans le hub.
//
// Le canal `envoi` n'est JAMAIS fermé : la fermeture est signalée par le canal
// `ferme`. C'est ce qui garantit qu'une diffusion concurrente ne peut pas
// paniquer en écrivant sur un canal fermé.
type Connexion struct {
	ID            string
	UtilisateurID uuid.UUID // uuid.Nil pour un visiteur non authentifié
	Role          string
	AdresseIP     string

	envoi  chan []byte
	ferme  chan struct{}
	unique sync.Once

	mu     sync.RWMutex
	salons map[string]struct{}
}

func nouvelleConnexion(utilisateurID uuid.UUID, role, ip string) *Connexion {
	return &Connexion{
		ID:            uuid.NewString(),
		UtilisateurID: utilisateurID,
		Role:          role,
		AdresseIP:     ip,
		envoi:         make(chan []byte, tailleTamponEnvoi),
		ferme:         make(chan struct{}),
		salons:        make(map[string]struct{}, 4),
	}
}

// envoyer dépose un message déjà sérialisé dans le tampon de la connexion.
// Renvoie false si le tampon est plein (client trop lent) ou si la connexion
// est déjà en cours de fermeture. N'est jamais bloquant.
func (c *Connexion) envoyer(message []byte) bool {
	select {
	case <-c.ferme:
		return false
	default:
	}
	select {
	case c.envoi <- message:
		return true
	default:
		return false
	}
}

// envoyerEvenement sérialise puis dépose une enveloppe destinée à cette seule
// connexion (accusés du protocole : connexion.prete, abonnement.confirme…).
func (c *Connexion) envoyerEvenement(evenement, salon string, charge any) {
	message, err := json.Marshal(Enveloppe{
		Evenement:  evenement,
		Salon:      salon,
		Horodatage: horodatage(),
		Charge:     charge,
	})
	if err != nil {
		journaliser("temps réel: sérialisation impossible", zap.String("evenement", evenement), zap.Error(err))
		return
	}
	if !c.envoyer(message) {
		c.fermer()
	}
}

// fermer signale la fin de la connexion (idempotent).
func (c *Connexion) fermer() {
	c.unique.Do(func() { close(c.ferme) })
}

// Salons renvoie une copie triable de l'ensemble des salons de la connexion.
func (c *Connexion) Salons() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]string, 0, len(c.salons))
	for s := range c.salons {
		out = append(out, s)
	}
	return out
}

func (c *Connexion) estAbonne(salon string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.salons[salon]
	return ok
}

// ─── Registre (le hub) ─────────────────────────────────────────────────────────

// registre tient les connexions et l'index inverse salon → connexions.
// Un unique RWMutex protège les deux tables : les sections critiques sont très
// courtes (pas d'entrée/sortie réseau à l'intérieur), la diffusion réelle se
// faisant toujours APRÈS libération du verrou.
type registre struct {
	mu         sync.RWMutex
	connexions map[string]*Connexion
	salons     map[string]map[string]*Connexion
}

var hub = &registre{
	connexions: make(map[string]*Connexion),
	salons:     make(map[string]map[string]*Connexion),
}

func (r *registre) enregistrer(c *Connexion) {
	r.mu.Lock()
	r.connexions[c.ID] = c
	r.mu.Unlock()
	signalerChangementCompteur()
}

// retirer sort la connexion du registre et de tous ses salons, puis annonce son
// départ aux salons de match auxquels elle participait.
func (r *registre) retirer(c *Connexion) {
	r.mu.Lock()
	delete(r.connexions, c.ID)
	c.mu.Lock()
	quittes := make([]string, 0, len(c.salons))
	for salon := range c.salons {
		quittes = append(quittes, salon)
		r.retirerDuSalonVerrouille(salon, c.ID)
	}
	c.salons = make(map[string]struct{})
	c.mu.Unlock()
	r.mu.Unlock()

	for _, salon := range quittes {
		annoncerDepart(c, salon)
	}
	signalerChangementCompteur()
}

// retirerDuSalonVerrouille suppose r.mu déjà pris en écriture.
func (r *registre) retirerDuSalonVerrouille(salon, connexionID string) {
	membres, ok := r.salons[salon]
	if !ok {
		return
	}
	delete(membres, connexionID)
	if len(membres) == 0 {
		delete(r.salons, salon)
	}
}

// abonner ajoute la connexion au salon. Renvoie false si la connexion a déjà
// atteint le plafond de salons.
func (r *registre) abonner(c *Connexion, salon string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	c.mu.Lock()
	defer c.mu.Unlock()
	if _, deja := c.salons[salon]; deja {
		return true
	}
	if len(c.salons) >= maxSalonsParConnexion {
		return false
	}
	c.salons[salon] = struct{}{}

	membres, ok := r.salons[salon]
	if !ok {
		membres = make(map[string]*Connexion, 2)
		r.salons[salon] = membres
	}
	membres[c.ID] = c
	return true
}

// desabonner retire la connexion d'un salon. Renvoie true si elle y était.
func (r *registre) desabonner(c *Connexion, salon string) bool {
	r.mu.Lock()
	c.mu.Lock()
	_, etait := c.salons[salon]
	if etait {
		delete(c.salons, salon)
		r.retirerDuSalonVerrouille(salon, c.ID)
	}
	c.mu.Unlock()
	r.mu.Unlock()

	if etait {
		annoncerDepart(c, salon)
	}
	return etait
}

// nombreConnexions renvoie le nombre de sockets ouverts sur CETTE instance.
func (r *registre) nombreConnexions() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.connexions)
}

// utilisateurPresent indique si l'utilisateur a (encore) au moins une connexion
// dans le salon — utilisé pour n'annoncer un départ qu'au dernier onglet fermé.
func (r *registre) utilisateurPresent(salon string, utilisateurID uuid.UUID, saufConnexionID string) bool {
	if utilisateurID == uuid.Nil {
		return false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	for id, c := range r.salons[salon] {
		if id != saufConnexionID && c.UtilisateurID == utilisateurID {
			return true
		}
	}
	return false
}

// diffuserLocal remet une enveloppe aux sockets de CETTE instance abonnés à l'un
// des salons visés. Chaque connexion ne reçoit l'événement qu'une fois, estampillé
// du premier salon correspondant. `exclure` (facultatif) est l'identifiant d'une
// connexion à sauter — l'émetteur d'une présence, par exemple.
func (r *registre) diffuserLocal(env Enveloppe, salons []string, exclure string) {
	if len(salons) == 0 {
		return
	}

	// 1) sous verrou : on ne fait que photographier les destinataires.
	r.mu.RLock()
	destinataires := make(map[*Connexion]string)
	for _, salon := range salons {
		for id, c := range r.salons[salon] {
			if id == exclure {
				continue
			}
			if _, deja := destinataires[c]; !deja {
				destinataires[c] = salon
			}
		}
	}
	r.mu.RUnlock()
	if len(destinataires) == 0 {
		return
	}

	// 2) hors verrou : sérialisation (mutualisée par salon) puis dépôt non bloquant.
	parSalon := make(map[string][]byte, len(salons))
	var lents []*Connexion
	for c, salon := range destinataires {
		message, ok := parSalon[salon]
		if !ok {
			estampillee := env
			estampillee.Salon = salon
			b, err := json.Marshal(estampillee)
			if err != nil {
				journaliser("temps réel: sérialisation impossible",
					zap.String("evenement", env.Evenement), zap.Error(err))
				return
			}
			message = b
			parSalon[salon] = b
		}
		if !c.envoyer(message) {
			lents = append(lents, c)
		}
	}

	// 3) les clients dont le tampon a débordé sont fermés — jamais attendus.
	for _, c := range lents {
		journaliser("temps réel: client trop lent, fermeture",
			zap.String("connexion", c.ID), zap.String("evenement", env.Evenement))
		c.fermer()
	}
}

// annoncerDepart publie `match.presence` (present=false) quand la dernière
// connexion d'un joueur quitte un salon de match. Sans ce signal, la présence
// affichée par l'adversaire resterait allumée après une fermeture d'onglet.
func annoncerDepart(c *Connexion, salon string) {
	if c.UtilisateurID == uuid.Nil || !estSalonMatch(salon) {
		return
	}
	if hub.utilisateurPresent(salon, c.UtilisateurID, c.ID) {
		return
	}
	publierPresence(c.UtilisateurID, false, false, salon, c.ID)
}

// horodatage produit l'estampille RFC 3339 en UTC de la charte API.
func horodatage() string { return time.Now().UTC().Format(time.RFC3339Nano) }

// journaliser écrit un avertissement sans jamais paniquer si le logger global
// n'a pas encore été initialisé (tests, démarrage très précoce).
func journaliser(message string, champs ...zap.Field) {
	if utils.Log != nil {
		utils.Log.Warn(message, champs...)
	}
}
