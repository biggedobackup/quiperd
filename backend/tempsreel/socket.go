package tempsreel

import (
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"go.uber.org/zap"

	"quiperd/backend/config"
	"quiperd/backend/utils"
)

// Réglages du transport. Le battement de cœur suit le cahier des charges :
// ping serveur toutes les 30 s, fermeture si aucun pong (ni aucun message) en 60 s.
const (
	intervallePing      = 30 * time.Second
	delaiPong           = 60 * time.Second
	delaiEcriture       = 10 * time.Second
	limiteLectureOctets = 8 * 1024
	// Anti-abus : un client qui dépasse ce débit d'actions est fermé. Chaque
	// abonnement à un salon `match:<id>` coûte une requête SQL, il ne faut pas
	// qu'un socket puisse la déclencher en boucle.
	maxActionsParFenetre = 60
	fenetreActions       = 10 * time.Second
)

var upgradeur = websocket.FastHTTPUpgrader{
	HandshakeTimeout: 10 * time.Second,
	ReadBufferSize:   1024,
	WriteBufferSize:  4096,
	CheckOrigin:      origineAutorisee,
}

// origineAutorisee applique la liste blanche d'origines (CORS_ORIGIN +
// WS_ORIGINES_AUTORISEES). Un `CheckOrigin` permissif serait une faille CSWSH :
// n'importe quel site visité par un joueur connecté pourrait ouvrir un socket
// en son nom. Une requête sans en-tête `Origin` (application mobile, outil en
// ligne de commande) est acceptée : seuls les navigateurs envoient `Origin`, et
// c'est d'eux seuls que vient le risque inter-site.
func origineAutorisee(ctx *fasthttp.RequestCtx) bool {
	origine := strings.TrimSpace(string(ctx.Request.Header.Peek("Origin")))
	if origine == "" {
		return true
	}
	normalisee := strings.TrimRight(strings.ToLower(origine), "/")

	// Même origine que la requête : jamais un cas inter-site.
	if u, err := url.Parse(origine); err == nil && strings.EqualFold(u.Host, string(ctx.Host())) {
		return true
	}

	if config.Cfg == nil {
		return false
	}
	for _, autorisee := range config.Cfg.OriginesWebSocket() {
		if autorisee == "*" {
			return true
		}
		if autorisee == normalisee {
			return true
		}
	}
	journaliser("temps réel: origine refusée à l'ouverture du socket", zap.String("origine", origine))
	return false
}

// Websocket godoc
// @Summary Socket temps réel (multiplexé par salons)
// @Description Ouvre le socket unique de la plateforme : `GET /api/temps-reel?ticket=<ticket>` (schéma `ws://` ou `wss://`). Le ticket vient de `POST /api/temps-reel/ticket` ; sans ticket — ou avec un ticket expiré, déjà consommé ou invalide, auquel cas un événement `connexion.refusee` est envoyé d'abord — la connexion est acceptée en **visiteur** et limitée aux salons publics. Le serveur envoie ensuite `connexion.prete`. Actions client (JSON) : `{"action":"abonner","salons":[…]}`, `{"action":"desabonner","salons":[…]}`, `{"action":"presence","salon":"match:<id>","surLaPage":true}`, `{"action":"ping"}`. Battement de cœur : ping serveur toutes les 30 s, fermeture après 60 s sans signe de vie.
// @Tags temps-reel
// @Param ticket query string false "Ticket à usage unique obtenu via POST /api/temps-reel/ticket"
// @Success 101 {string} string "Switching Protocols"
// @Failure 403 {object} map[string]string "origine non autorisée"
// @Failure 426 {object} map[string]string "connexion WebSocket requise"
// @Router /temps-reel [get]
func Websocket(c fiber.Ctx) error {
	// ATTENTION : le handler ci-dessous s'exécute dans une goroutine APRÈS
	// l'upgrade, quand le fiber.Ctx et le RequestCtx sont déjà recyclés. Tout ce
	// dont la connexion a besoin est donc extrait MAINTENANT, par valeur.
	ticket := strings.TrimSpace(c.Query("ticket"))
	adresseIP := c.IP()
	requete := c.RequestCtx()

	if !websocket.FastHTTPIsWebSocketUpgrade(requete) {
		return utils.Erreur(c, fiber.StatusUpgradeRequired, "connexion WebSocket requise")
	}

	if err := upgradeur.Upgrade(requete, func(conn *websocket.Conn) {
		servir(conn, ticket, adresseIP)
	}); err != nil {
		// Upgrade a déjà écrit la réponse d'erreur (403 origine, 400 poignée de main).
		return nil
	}
	return nil
}

// servir est la vie complète d'un socket : identification, enregistrement dans
// le hub, pompe d'écriture dédiée, puis boucle de lecture jusqu'à la fermeture.
func servir(conn *websocket.Conn, ticket, adresseIP string) {
	utilisateurID, role := uuid.Nil, RoleVisiteur
	raisonRefus := ""
	if ticket != "" {
		id, r, err := consommerTicket(ticket)
		if err != nil {
			raisonRefus = err.Error()
		} else {
			utilisateurID, role = id, r
		}
	}

	c := nouvelleConnexion(utilisateurID, role, adresseIP)
	hub.enregistrer(c)

	// Ordre de démontage : signal de fermeture → sortie du hub → socket réseau.
	defer conn.Close()
	defer hub.retirer(c)
	defer c.fermer()

	go c.pompeEcriture(conn)

	if raisonRefus != "" {
		// Le client sait ainsi qu'il doit redemander un ticket : il n'est pas
		// authentifié, mais sa connexion reste ouverte en visiteur.
		c.envoyerEvenement(EvtConnexionRefusee, "", map[string]any{"raison": raisonRefus})
	}
	c.envoyerEvenement(EvtConnexionPrete, "", chargeConnexionPrete(c))

	c.pompeLecture(conn)
}

func chargeConnexionPrete(c *Connexion) map[string]any {
	charge := map[string]any{
		"role":   c.Role,
		"salons": c.Salons(),
	}
	if c.UtilisateurID != uuid.Nil {
		charge["utilisateurId"] = c.UtilisateurID.String()
	}
	return charge
}

// pompeEcriture est la SEULE goroutine qui écrit sur le socket : c'est ce qui
// rend les écritures sûres sans verrou sur la connexion réseau.
func (c *Connexion) pompeEcriture(conn *websocket.Conn) {
	minuteur := time.NewTicker(intervallePing)
	defer func() {
		minuteur.Stop()
		_ = conn.Close()
	}()

	for {
		select {
		case message := <-c.envoi:
			_ = conn.SetWriteDeadline(time.Now().Add(delaiEcriture))
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-minuteur.C:
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(delaiEcriture)); err != nil {
				return
			}
		case <-c.ferme:
			_ = conn.WriteControl(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
				time.Now().Add(time.Second),
			)
			return
		}
	}
}

// pompeLecture lit les actions du client jusqu'à l'erreur ou l'expiration du
// délai de vie (60 s sans pong ni message).
func (c *Connexion) pompeLecture(conn *websocket.Conn) {
	conn.SetReadLimit(limiteLectureOctets)
	_ = conn.SetReadDeadline(time.Now().Add(delaiPong))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(delaiPong))
	})

	debutFenetre := time.Now()
	actions := 0

	for {
		_, donnees, err := conn.ReadMessage()
		if err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(delaiPong))

		if time.Since(debutFenetre) > fenetreActions {
			debutFenetre = time.Now()
			actions = 0
		}
		actions++
		if actions > maxActionsParFenetre {
			journaliser("temps réel: débit d'actions excessif, fermeture",
				zap.String("connexion", c.ID), zap.String("ip", c.AdresseIP))
			return
		}

		c.traiterAction(donnees)
	}
}

// actionClient est le message JSON envoyé par le navigateur (miroir du type
// `ActionClient` de frontend/src/temps-reel/evenements.ts).
type actionClient struct {
	Action    string   `json:"action"`
	Salons    []string `json:"salons"`
	Salon     string   `json:"salon"`
	SurLaPage bool     `json:"surLaPage"`
}

func (c *Connexion) traiterAction(donnees []byte) {
	var a actionClient
	if err := json.Unmarshal(donnees, &a); err != nil {
		return // message illisible : ignoré, jamais fatal
	}

	switch a.Action {
	case "abonner":
		c.abonner(a.Salons)
	case "desabonner":
		c.desabonner(a.Salons)
	case "presence":
		c.presence(a.Salon, a.SurLaPage)
	case "ping":
		// Signe de vie applicatif : le délai de lecture vient d'être repoussé,
		// il n'y a rien à répondre (le contrat d'événements n'a pas de `pong`).
	default:
		// Action inconnue : ignorée en silence, elle compte dans le quota.
	}
}

// abonner traite `{"action":"abonner","salons":[…]}`. L'autorisation est
// revérifiée pour CHAQUE salon, à chaque demande. Les salons refusés partent
// dans `abonnement.confirme.refuses` — jamais ignorés en silence.
func (c *Connexion) abonner(demandes []string) {
	refuses := make([]string, 0, len(demandes))
	nouveaux := make([]string, 0, len(demandes))

	for i, salon := range nettoyerSalons(demandes) {
		if i >= maxSalonsParAction {
			refuses = append(refuses, salon)
			continue
		}
		if !autoriserSalon(c.UtilisateurID, c.Role, salon) {
			refuses = append(refuses, salon)
			continue
		}
		if c.estAbonne(salon) {
			continue
		}
		if !hub.abonner(c, salon) {
			refuses = append(refuses, salon) // plafond de salons atteint
			continue
		}
		nouveaux = append(nouveaux, salon)
	}

	c.envoyerEvenement(EvtAbonnementConfirme, "", map[string]any{
		"salons":  c.Salons(),
		"refuses": refuses,
	})

	// Le compteur est envoyé tout de suite au nouvel abonné du salon public :
	// il n'attend pas le prochain changement de valeur pour afficher un nombre.
	for _, salon := range nouveaux {
		if salon == SalonDefisPublics {
			c.envoyerEvenement(EvtCompteurEnLigne, SalonDefisPublics,
				map[string]any{"joueursEnLigne": compteurCourant()})
			break
		}
	}
}

// desabonner traite `{"action":"desabonner","salons":[…]}` et répond avec la
// liste des salons restants.
func (c *Connexion) desabonner(demandes []string) {
	for _, salon := range nettoyerSalons(demandes) {
		hub.desabonner(c, salon)
	}
	c.envoyerEvenement(EvtAbonnementConfirme, "", map[string]any{
		"salons":  c.Salons(),
		"refuses": []string{},
	})
}

// presence traite `{"action":"presence","salon":"match:<id>","surLaPage":true}` :
// le hub rediffuse la présence aux AUTRES membres du salon de match. C'est le
// seul événement fabriqué à partir d'une action client, et il ne porte rien
// d'autre que `{utilisateurId, present, surLaPage}`.
func (c *Connexion) presence(salon string, surLaPage bool) {
	if c.UtilisateurID == uuid.Nil || !estSalonMatch(salon) || !c.estAbonne(salon) {
		return
	}
	publierPresence(c.UtilisateurID, true, surLaPage, salon, c.ID)
}
