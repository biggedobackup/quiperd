// Outil de recette : MONTÉE EN CHARGE du socle temps réel et des défis de QUI PERD.
//
// Ce programme n'est qu'un CLIENT : il n'importe aucun paquet du backend, ne touche jamais la
// base et ne connaît aucun secret. Il peut donc viser indifféremment l'API locale ou le site en
// production — c'est la même chaîne HTTP/WebSocket qu'un navigateur.
//
// Deux questions, deux sous-commandes :
//
//	sockets — combien de joueurs peuvent tenir EN MÊME TEMPS sur le socket de la page /defis,
//	          et à quelle vitesse un événement leur parvient quand ils sont tous là ;
//	defis   — combien de défis peuvent être créés et rejoints EN MÊME TEMPS, et le verrou
//	          « ouvert -> complet » tient-il quand plusieurs joueurs se ruent sur le même défi.
//
// Usage, depuis le dossier backend :
//
//	go run ./tests/outils/charge sockets -ws ws://127.0.0.1:8090/api/temps-reel \
//	     -paliers 100,500,1000,2000,4000 -cadence 400 -maintien 15s
//	go run ./tests/outils/charge defis -api http://127.0.0.1:8090/api -comptes tests/tmp/comptes.json \
//	     -mode paires -concurrence 64 -iterations 512
//
// Réservé aux recettes : jamais référencé par un binaire de production.
package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fasthttp/websocket"
)

// ─── Utilitaires de mesure ─────────────────────────────────────────────────────

// serie accumule des durées et en tire des centiles. Volontairement simple : on
// garde tout en mémoire (quelques dizaines de milliers de valeurs au plus).
type serie struct {
	mu      sync.Mutex
	valeurs []float64
}

func (s *serie) ajouter(d time.Duration) {
	s.mu.Lock()
	s.valeurs = append(s.valeurs, float64(d.Microseconds())/1000.0)
	s.mu.Unlock()
}

func (s *serie) resume() resumeSerie {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := len(s.valeurs)
	if n == 0 {
		return resumeSerie{}
	}
	tri := append([]float64(nil), s.valeurs...)
	sort.Float64s(tri)
	somme := 0.0
	for _, v := range tri {
		somme += v
	}
	return resumeSerie{
		N: n, Moyenne: arrondi(somme / float64(n)),
		P50: arrondi(centile(tri, 50)), P95: arrondi(centile(tri, 95)),
		P99: arrondi(centile(tri, 99)), Max: arrondi(tri[n-1]),
	}
}

type resumeSerie struct {
	N       int     `json:"n"`
	Moyenne float64 `json:"moyenneMs"`
	P50     float64 `json:"p50Ms"`
	P95     float64 `json:"p95Ms"`
	P99     float64 `json:"p99Ms"`
	Max     float64 `json:"maxMs"`
}

func (r resumeSerie) String() string {
	if r.N == 0 {
		return "aucune mesure"
	}
	return fmt.Sprintf("n=%d  p50=%.1f ms  p95=%.1f ms  p99=%.1f ms  max=%.1f ms", r.N, r.P50, r.P95, r.P99, r.Max)
}

func centile(trie []float64, p float64) float64 {
	if len(trie) == 0 {
		return 0
	}
	rang := int(float64(len(trie)-1) * p / 100.0)
	return trie[rang]
}

func arrondi(v float64) float64 { return float64(int64(v*10+0.5)) / 10 }

// compteurErreurs regroupe les échecs par message : un rapport lisible vaut mieux
// que dix mille lignes identiques.
type compteurErreurs struct {
	mu sync.Mutex
	m  map[string]int
}

func nouveauCompteur() *compteurErreurs { return &compteurErreurs{m: map[string]int{}} }

func (c *compteurErreurs) ajouter(cause string) {
	c.mu.Lock()
	c.m[cause]++
	c.mu.Unlock()
}

func (c *compteurErreurs) copie() map[string]int {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make(map[string]int, len(c.m))
	for k, v := range c.m {
		out[k] = v
	}
	return out
}

func (c *compteurErreurs) String() string { return formaterCauses(c.copie()) }

// formaterCauses met les causes en une ligne, de la plus fréquente à la plus rare.
func formaterCauses(m map[string]int) string {
	if len(m) == 0 {
		return "aucune"
	}
	cles := make([]string, 0, len(m))
	for k := range m {
		cles = append(cles, k)
	}
	sort.Slice(cles, func(i, j int) bool { return m[cles[i]] > m[cles[j]] })
	parts := make([]string, 0, len(cles))
	for _, k := range cles {
		parts = append(parts, fmt.Sprintf("%s x%d", k, m[k]))
	}
	return strings.Join(parts, " | ")
}

// causeCourte réduit une erreur réseau à sa famille : « connexion refusée »,
// « délai dépassé »… Sans cela, chaque numéro de port produirait une ligne.
func causeCourte(err error) string {
	if err == nil {
		return "ok"
	}
	msg := err.Error()
	switch {
	case strings.HasPrefix(msg, "poignée de main refusée"):
		return msg // déjà porteur du code HTTP du refus
	case strings.Contains(msg, "bad handshake"):
		return "poignée de main refusée (code HTTP != 101)"
	case strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline exceeded"):
		return "délai dépassé"
	case strings.Contains(msg, "connection refused") || strings.Contains(msg, "refus"):
		return "connexion refusée"
	case strings.Contains(msg, "connection reset") || strings.Contains(msg, "forcibly closed"):
		return "connexion réinitialisée par le serveur"
	case strings.Contains(msg, "no buffer space") || strings.Contains(msg, "lacked sufficient buffer"):
		return "ports éphémères épuisés côté client"
	case strings.Contains(msg, "too many open files"):
		return "descripteurs de fichiers épuisés côté client"
	case strings.Contains(msg, "1006"):
		return "fermeture anormale (1006)"
	case strings.Contains(msg, "EOF"):
		return "fermeture immédiate (EOF)"
	}
	if len(msg) > 90 {
		msg = msg[:90] + "…"
	}
	return msg
}

// ─── Protocole du hub (miroir de backend/tempsreel/evenements.go) ──────────────

type enveloppe struct {
	Evenement  string          `json:"evenement"`
	Salon      string          `json:"salon"`
	Horodatage string          `json:"horodatage"`
	Charge     json.RawMessage `json:"charge"`
}

type compte struct {
	ID    string `json:"id"`
	Nom   string `json:"nom"`
	Jeton string `json:"jeton"`
}

func chargerComptes(chemin string) ([]compte, error) {
	brut, err := os.ReadFile(chemin)
	if err != nil {
		return nil, err
	}
	var c []compte
	if err := json.Unmarshal(brut, &c); err != nil {
		return nil, err
	}
	if len(c) == 0 {
		return nil, fmt.Errorf("fichier de comptes vide : %s", chemin)
	}
	return c, nil
}

// ─── Client HTTP ───────────────────────────────────────────────────────────────

func nouveauClientHTTP(concurrence int) *http.Client {
	transport := &http.Transport{
		Proxy:               nil, // jamais de proxy : on mesure le serveur, pas l'intermédiaire
		MaxIdleConns:        concurrence * 2,
		MaxIdleConnsPerHost: concurrence * 2,
		IdleConnTimeout:     90 * time.Second,
		DialContext:         (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS12},
	}
	return &http.Client{Transport: transport, Timeout: 30 * time.Second}
}

type reponseAPI struct {
	Code   int
	Corps  []byte
	Duree  time.Duration
	Erreur error
}

func appel(cl *http.Client, methode, url, jeton string, corps any) reponseAPI {
	var lecteur io.Reader
	if corps != nil {
		b, _ := json.Marshal(corps)
		lecteur = bytes.NewReader(b)
	}
	req, err := http.NewRequest(methode, url, lecteur)
	if err != nil {
		return reponseAPI{Erreur: err}
	}
	if corps != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if jeton != "" {
		req.Header.Set("Authorization", "Bearer "+jeton)
	}
	debut := time.Now()
	rep, err := cl.Do(req)
	if err != nil {
		return reponseAPI{Duree: time.Since(debut), Erreur: err}
	}
	defer rep.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(rep.Body, 1<<20))
	return reponseAPI{Code: rep.StatusCode, Corps: b, Duree: time.Since(debut)}
}

// ─── Sous-commande « sockets » ─────────────────────────────────────────────────

// connexion est un socket ouvert par l'outil, avec sa boucle de lecture.
type connexion struct {
	index   int
	socket  *websocket.Conn
	vivante atomic.Bool
	recus   atomic.Int64

	// Sonde : nom de l'événement attendu et instant de sa réception. Remis à zéro
	// entre deux mesures.
	sondeMu      sync.Mutex
	sondeNom     string
	sondeVu      bool
	sondeQuand   time.Time
	sondeServeur time.Time
}

type rapportPalier struct {
	Cible              int            `json:"cible"`
	Ouvertes           int            `json:"ouvertesCumul"`
	NouvellesTentees   int            `json:"nouvellesTentees"`
	NouvellesEchouees  int            `json:"nouvellesEchouees"`
	PerduesEnMaintien  int            `json:"perduesPendantMaintien"`
	Causes             map[string]int `json:"causes"`
	PoigneeDeMain      resumeSerie    `json:"poigneeDeMainMs"`
	ConnexionPrete     resumeSerie    `json:"connexionPreteMs"`
	AbonnementConfirme resumeSerie    `json:"abonnementConfirmeMs"`
	AllerRetour        resumeSerie    `json:"allerRetourApplicatifMs"`
	Diffusion          *rapportSonde  `json:"diffusion,omitempty"`
	DureeMontee        float64        `json:"dureeMonteeSecondes"`
}

type rapportSonde struct {
	Evenement       string      `json:"evenement"`
	Destinataires   int         `json:"destinataires"`
	Recus           int         `json:"recus"`
	TauxReception   float64     `json:"tauxReceptionPct"`
	DepuisRequete   resumeSerie `json:"depuisEmissionRequeteMs"`
	DepuisServeur   resumeSerie `json:"depuisEstampilleServeurMs"`
	LatenceCreation float64     `json:"latenceCreationHttpMs"`
}

func commandeSockets(args []string) int {
	fs := flag.NewFlagSet("sockets", flag.ExitOnError)
	adresse := fs.String("ws", "ws://127.0.0.1:8080/api/temps-reel", "URL du socket temps réel")
	paliersBrut := fs.String("paliers", "100,250,500,1000,2000,4000", "paliers CUMULÉS de connexions simultanées")
	cadence := fs.Int("cadence", 200, "ouvertures par seconde pendant la montée")
	maintien := fs.Duration("maintien", 15*time.Second, "durée de maintien à chaque palier")
	salon := fs.String("salon", "public:defis", "salon rejoint après l'ouverture (vide = aucun abonnement)")
	comptesFichier := fs.String("comptes", "", "fichier JSON de comptes : les sockets s'authentifient par ticket")
	api := fs.String("api", "", "base de l'API (obligatoire avec -comptes ou pour la sonde de diffusion)")
	jetonSonde := fs.String("jeton-sonde", "", "jeton du joueur qui crée le défi servant de sonde de diffusion")
	jeu := fs.String("jeu", "", "identifiant de jeu pour la sonde de diffusion")
	plateforme := fs.String("plateforme", "", "identifiant de plateforme pour la sonde de diffusion")
	mise := fs.Int("mise", 500, "mise du défi sonde")
	seuilEchec := fs.Float64("seuil-echec", 5, "pourcentage d'échecs d'ouverture qui interrompt la montée")
	delaiPoignee := fs.Duration("delai-poignee", 15*time.Second, "délai maximal de la poignée de main")
	sortieJSON := fs.String("json", "", "chemin d'un rapport JSON à écrire")
	_ = fs.Parse(args)

	paliers, err := listeEntiers(*paliersBrut)
	if err != nil || len(paliers) == 0 {
		fmt.Println("paliers invalides :", *paliersBrut)
		return 2
	}

	var comptes []compte
	if *comptesFichier != "" {
		comptes, err = chargerComptes(*comptesFichier)
		if err != nil {
			fmt.Println("comptes :", err)
			return 2
		}
		if *api == "" {
			fmt.Println("-api est obligatoire avec -comptes (les tickets sont demandés à l'API)")
			return 2
		}
	}

	fmt.Printf("Cible          : %s\n", *adresse)
	if len(comptes) > 0 {
		fmt.Printf("Mode           : sockets AUTHENTIFIÉS (un ticket par connexion, %d comptes en rotation)\n", len(comptes))
	} else {
		fmt.Printf("Mode           : sockets VISITEUR (aucun compte — exactement ce qu'ouvre un visiteur de /defis)\n")
	}
	fmt.Printf("Paliers        : %v  |  cadence %d/s  |  maintien %s  |  salon %q\n\n", paliers, *cadence, *maintien, *salon)

	dialeur := &websocket.Dialer{
		HandshakeTimeout: *delaiPoignee,
		ReadBufferSize:   1024,
		WriteBufferSize:  1024,
		TLSClientConfig:  &tls.Config{MinVersion: tls.VersionTLS12},
	}
	clientHTTP := nouveauClientHTTP(64)

	var (
		vivantes  []*connexion
		rapports  []rapportPalier
		precedent int
	)
	defer func() {
		for _, c := range vivantes {
			_ = c.socket.Close()
		}
	}()

	for _, cible := range paliers {
		aOuvrir := cible - precedent
		if aOuvrir <= 0 {
			continue
		}
		causes := nouveauCompteur()
		poignee, prete, abonnement := &serie{}, &serie{}, &serie{}
		var echecs atomic.Int64
		nouvelles := make([]*connexion, aOuvrir)

		debutMontee := time.Now()
		intervalle := time.Duration(0)
		if *cadence > 0 {
			intervalle = time.Second / time.Duration(*cadence)
		}
		travail := make(chan int, aOuvrir)
		for i := 0; i < aOuvrir; i++ {
			travail <- i
		}
		close(travail)

		ouvreurs := 64
		if aOuvrir < ouvreurs {
			ouvreurs = aOuvrir
		}
		var horloge sync.Mutex
		prochain := time.Now()
		var groupe sync.WaitGroup
		for o := 0; o < ouvreurs; o++ {
			groupe.Add(1)
			go func() {
				defer groupe.Done()
				for i := range travail {
					if intervalle > 0 {
						horloge.Lock()
						attendre := time.Until(prochain)
						prochain = prochain.Add(intervalle)
						horloge.Unlock()
						if attendre > 0 {
							time.Sleep(attendre)
						}
					}
					index := precedent + i
					c, err := ouvrirSocket(dialeur, clientHTTP, *adresse, *api, *salon, comptes, index, poignee, prete, abonnement)
					if err != nil {
						echecs.Add(1)
						causes.ajouter(causeCourte(err))
						continue
					}
					nouvelles[i] = c
				}
			}()
		}
		groupe.Wait()
		dureeMontee := time.Since(debutMontee)

		for _, c := range nouvelles {
			if c != nil {
				vivantes = append(vivantes, c)
			}
		}

		// Maintien : c'est ici qu'on voit si le serveur GARDE les connexions (ping
		// serveur toutes les 30 s) ou s'il en laisse tomber sous la charge.
		time.Sleep(*maintien)

		perdues, ouvertes := 0, 0
		for _, c := range vivantes {
			if c.vivante.Load() {
				ouvertes++
			} else {
				perdues++
			}
		}

		allerRetour := mesurerAllerRetour(vivantes, 25)

		var sonde *rapportSonde
		if *api != "" && *jetonSonde != "" && *jeu != "" && *plateforme != "" && *salon == "public:defis" {
			sonde = mesurerDiffusion(clientHTTP, *api, *jetonSonde, *jeu, *plateforme, *mise, vivantes)
		}

		tentees := aOuvrir
		rap := rapportPalier{
			Cible: cible, Ouvertes: ouvertes, NouvellesTentees: tentees,
			NouvellesEchouees: int(echecs.Load()), PerduesEnMaintien: perdues,
			Causes: causes.copie(), PoigneeDeMain: poignee.resume(), ConnexionPrete: prete.resume(),
			AbonnementConfirme: abonnement.resume(), AllerRetour: allerRetour, Diffusion: sonde,
			DureeMontee: arrondi(dureeMontee.Seconds()),
		}
		rapports = append(rapports, rap)
		afficherPalier(rap)

		tauxEchec := 0.0
		if tentees > 0 {
			tauxEchec = float64(rap.NouvellesEchouees) / float64(tentees) * 100
		}
		if tauxEchec > *seuilEchec || perdues > 0 {
			fmt.Printf(">>> Palier %d : plafond atteint (%.1f %% d'échecs à l'ouverture, %d connexion(s) perdue(s) au repos). Montée interrompue.\n\n", cible, tauxEchec, perdues)
			break
		}
		precedent = cible
	}

	fmt.Println("──────────────────────────────────────────────────────────────")
	dernier := rapports[len(rapports)-1]
	fmt.Printf("Sockets simultanés tenus sans aucune perte : %d\n", plusHautPalierSain(rapports))
	fmt.Printf("Dernier palier mesuré                     : cible %d, ouvertes %d\n", dernier.Cible, dernier.Ouvertes)

	if *sortieJSON != "" {
		b, _ := json.MarshalIndent(map[string]any{
			"cible": *adresse, "salon": *salon, "authentifie": len(comptes) > 0,
			"cadenceParSeconde": *cadence, "maintienSecondes": maintien.Seconds(),
			"paliers": rapports, "date": time.Now().Format(time.RFC3339),
		}, "", "  ")
		if err := os.WriteFile(*sortieJSON, b, 0o644); err != nil {
			fmt.Println("écriture du rapport JSON impossible :", err)
		} else {
			fmt.Println("Rapport JSON :", *sortieJSON)
		}
	}
	return 0
}

func plusHautPalierSain(rapports []rapportPalier) int {
	haut := 0
	for _, r := range rapports {
		if r.NouvellesEchouees == 0 && r.PerduesEnMaintien == 0 {
			haut = r.Ouvertes
		}
	}
	return haut
}

func afficherPalier(r rapportPalier) {
	fmt.Printf("── Palier %d ─ ouvertes %d (montée en %.1f s)\n", r.Cible, r.Ouvertes, r.DureeMontee)
	fmt.Printf("   ouvertures        : %d tentées, %d échouées (%s)\n", r.NouvellesTentees, r.NouvellesEchouees, formaterCauses(r.Causes))
	fmt.Printf("   perdues au repos  : %d\n", r.PerduesEnMaintien)
	fmt.Printf("   poignée de main   : %s\n", r.PoigneeDeMain)
	fmt.Printf("   connexion.prete   : %s\n", r.ConnexionPrete)
	fmt.Printf("   abonnement        : %s\n", r.AbonnementConfirme)
	fmt.Printf("   aller-retour      : %s\n", r.AllerRetour)
	if r.Diffusion != nil {
		d := r.Diffusion
		fmt.Printf("   diffusion %s   : %d/%d reçus (%.1f %%), depuis la requête %s\n",
			d.Evenement, d.Recus, d.Destinataires, d.TauxReception, d.DepuisRequete)
		fmt.Printf("                       depuis l'estampille serveur %s (création HTTP %.1f ms)\n",
			d.DepuisServeur, d.LatenceCreation)
	}
	fmt.Println()
}

// ouvrirSocket ouvre une connexion, attend `connexion.prete`, s'abonne au salon
// puis laisse tourner une boucle de lecture jusqu'à la fermeture.
func ouvrirSocket(d *websocket.Dialer, cl *http.Client, adresse, api, salon string, comptes []compte, index int,
	poignee, prete, abonnement *serie) (*connexion, error) {

	url := adresse
	if len(comptes) > 0 {
		cpt := comptes[index%len(comptes)]
		r := appel(cl, http.MethodPost, strings.TrimRight(api, "/")+"/temps-reel/ticket", cpt.Jeton, nil)
		if r.Erreur != nil {
			return nil, fmt.Errorf("ticket : %w", r.Erreur)
		}
		if r.Code != 200 {
			return nil, fmt.Errorf("ticket refusé (HTTP %d)", r.Code)
		}
		var rep struct {
			Ticket string `json:"ticket"`
		}
		if err := json.Unmarshal(r.Corps, &rep); err != nil || rep.Ticket == "" {
			return nil, fmt.Errorf("ticket illisible")
		}
		separateur := "?"
		if strings.Contains(url, "?") {
			separateur = "&"
		}
		url = url + separateur + "ticket=" + rep.Ticket
	}

	debut := time.Now()
	socket, reponse, err := d.Dial(url, nil)
	if err != nil {
		// Le code HTTP du refus est la seule information qui dit QUI a dit non :
		// 503/502 vient du proxy à bout de ressources, 429 d'une limitation de
		// débit, 403 du contrôle d'origine, 404 d'une route absente. Sans lui, tous
		// les refus se ressemblent.
		if reponse != nil {
			return nil, fmt.Errorf("poignée de main refusée : HTTP %d", reponse.StatusCode)
		}
		return nil, err
	}
	poignee.ajouter(time.Since(debut))

	c := &connexion{index: index, socket: socket}
	c.vivante.Store(true)

	// Le serveur pousse `connexion.prete` immédiatement : on l'attend AVANT de
	// lancer la boucle, pour mesurer le temps d'admission dans le hub.
	_ = socket.SetReadDeadline(time.Now().Add(20 * time.Second))
	for {
		_, donnees, err := socket.ReadMessage()
		if err != nil {
			_ = socket.Close()
			return nil, err
		}
		var e enveloppe
		if json.Unmarshal(donnees, &e) == nil && e.Evenement == "connexion.prete" {
			break
		}
	}
	prete.ajouter(time.Since(debut))

	if salon != "" {
		envoi := time.Now()
		if err := socket.WriteMessage(websocket.TextMessage, []byte(`{"action":"abonner","salons":["`+salon+`"]}`)); err != nil {
			_ = socket.Close()
			return nil, err
		}
		for {
			_, donnees, err := socket.ReadMessage()
			if err != nil {
				_ = socket.Close()
				return nil, err
			}
			var e enveloppe
			if json.Unmarshal(donnees, &e) == nil && e.Evenement == "abonnement.confirme" {
				abonnement.ajouter(time.Since(envoi))
				break
			}
		}
	}

	go boucleLecture(c)
	return c, nil
}

// boucleLecture consomme le flux jusqu'à la fermeture. Le pong des pings serveur
// est renvoyé explicitement : c'est ce qui prouve qu'une connexion inactive
// survit au battement de cœur de 30 s.
func boucleLecture(c *connexion) {
	defer func() {
		c.vivante.Store(false)
		_ = c.socket.Close()
	}()
	c.socket.SetPingHandler(func(donnees string) error {
		_ = c.socket.SetReadDeadline(time.Now().Add(120 * time.Second))
		return c.socket.WriteControl(websocket.PongMessage, []byte(donnees), time.Now().Add(5*time.Second))
	})
	for {
		_ = c.socket.SetReadDeadline(time.Now().Add(120 * time.Second))
		_, donnees, err := c.socket.ReadMessage()
		if err != nil {
			return
		}
		recuA := time.Now()
		c.recus.Add(1)
		var e enveloppe
		if json.Unmarshal(donnees, &e) != nil {
			continue
		}
		c.sondeMu.Lock()
		if c.sondeNom != "" && e.Evenement == c.sondeNom && !c.sondeVu {
			c.sondeVu = true
			c.sondeQuand = recuA
			if t, err := time.Parse(time.RFC3339Nano, e.Horodatage); err == nil {
				c.sondeServeur = t
			}
		}
		c.sondeMu.Unlock()
	}
}

// mesurerAllerRetour envoie une action `desabonner` VIDE sur un échantillon de
// connexions et mesure le retour de `abonnement.confirme`. C'est le trajet
// complet pompe de lecture -> pompe d'écriture, donc l'indicateur de réactivité
// du hub sous charge. Action inoffensive : la liste vide ne retire aucun salon.
func mesurerAllerRetour(connexions []*connexion, echantillon int) resumeSerie {
	s := &serie{}
	if len(connexions) == 0 {
		return s.resume()
	}
	pas := len(connexions) / echantillon
	if pas < 1 {
		pas = 1
	}
	var groupe sync.WaitGroup
	for i := 0; i < len(connexions); i += pas {
		c := connexions[i]
		if !c.vivante.Load() {
			continue
		}
		groupe.Add(1)
		go func(c *connexion) {
			defer groupe.Done()
			c.sondeMu.Lock()
			c.sondeNom, c.sondeVu = "abonnement.confirme", false
			c.sondeMu.Unlock()
			envoi := time.Now()
			if err := c.socket.WriteMessage(websocket.TextMessage, []byte(`{"action":"desabonner","salons":[]}`)); err != nil {
				return
			}
			limite := time.Now().Add(10 * time.Second)
			for time.Now().Before(limite) {
				c.sondeMu.Lock()
				vu, quand := c.sondeVu, c.sondeQuand
				c.sondeMu.Unlock()
				if vu {
					s.ajouter(quand.Sub(envoi))
					return
				}
				time.Sleep(2 * time.Millisecond)
			}
		}(c)
	}
	groupe.Wait()
	for _, c := range connexions {
		c.sondeMu.Lock()
		c.sondeNom = ""
		c.sondeMu.Unlock()
	}
	return s.resume()
}

// mesurerDiffusion crée un vrai défi puis mesure le temps que met `defi.cree` à
// atteindre CHACUN des sockets abonnés au salon public. C'est la question qui
// compte pour la page /defis : à N joueurs connectés, en combien de temps tout
// le monde voit-il le nouveau défi ? Le défi sonde est annulé aussitôt après.
func mesurerDiffusion(cl *http.Client, api, jeton, jeu, plateforme string, mise int, connexions []*connexion) *rapportSonde {
	vivantes := make([]*connexion, 0, len(connexions))
	for _, c := range connexions {
		if c.vivante.Load() {
			c.sondeMu.Lock()
			c.sondeNom, c.sondeVu = "defi.cree", false
			c.sondeMu.Unlock()
			vivantes = append(vivantes, c)
		}
	}
	if len(vivantes) == 0 {
		return nil
	}

	base := strings.TrimRight(api, "/")
	emission := time.Now()
	r := appel(cl, http.MethodPost, base+"/defis", jeton, map[string]any{
		"jeuId": jeu, "plateformeId": plateforme, "montantMise": mise,
		"regles": "sonde de diffusion (montée en charge)", "dureeHeures": 1,
	})
	if r.Erreur != nil || r.Code != 201 {
		fmt.Printf("   [sonde de diffusion impossible : HTTP %d %s %v]\n", r.Code, tronquer(string(r.Corps), 120), r.Erreur)
		return nil
	}
	var defi struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(r.Corps, &defi)

	// Fenêtre de collecte : large, mais on sort dès que tout le monde a reçu.
	limite := time.Now().Add(15 * time.Second)
	for time.Now().Before(limite) {
		manquants := 0
		for _, c := range vivantes {
			c.sondeMu.Lock()
			vu := c.sondeVu
			c.sondeMu.Unlock()
			if !vu {
				manquants++
			}
		}
		if manquants == 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	depuisRequete, depuisServeur := &serie{}, &serie{}
	recus := 0
	for _, c := range vivantes {
		c.sondeMu.Lock()
		vu, quand, serveur := c.sondeVu, c.sondeQuand, c.sondeServeur
		c.sondeNom = ""
		c.sondeMu.Unlock()
		if !vu {
			continue
		}
		recus++
		depuisRequete.ajouter(quand.Sub(emission))
		if !serveur.IsZero() {
			if d := quand.Sub(serveur); d > 0 {
				depuisServeur.ajouter(d)
			}
		}
	}

	if defi.ID != "" {
		_ = appel(cl, http.MethodDelete, base+"/defis/"+defi.ID, jeton, nil)
	}

	return &rapportSonde{
		Evenement: "defi.cree", Destinataires: len(vivantes), Recus: recus,
		TauxReception: arrondi(float64(recus) / float64(len(vivantes)) * 100),
		DepuisRequete: depuisRequete.resume(), DepuisServeur: depuisServeur.resume(),
		LatenceCreation: arrondi(float64(r.Duree.Microseconds()) / 1000),
	}
}

// ─── Sous-commande « defis » ───────────────────────────────────────────────────

type rapportDefis struct {
	Mode           string         `json:"mode"`
	Concurrence    int            `json:"concurrence"`
	Iterations     int            `json:"iterations"`
	Duree          float64        `json:"dureeSecondes"`
	DebitParSec    float64        `json:"defisMenesAuMatchParSeconde"`
	RequetesParSec float64        `json:"requetesParSeconde"`
	Creations      resumeSerie    `json:"creationMs"`
	Rejointes      resumeSerie    `json:"rejoindreMs"`
	Codes          map[string]int `json:"codesHttp"`
	Anomalies      []string       `json:"anomalies"`
	DefisCrees     int            `json:"defisCrees"`
	MatchsOuverts  int            `json:"matchsOuverts"`
}

func commandeDefis(args []string) int {
	fs := flag.NewFlagSet("defis", flag.ExitOnError)
	api := fs.String("api", "http://127.0.0.1:8080/api", "base de l'API")
	comptesFichier := fs.String("comptes", "", "fichier JSON des comptes de charge")
	mode := fs.String("mode", "paires", "paires (création + acceptation) ou ruee (N joueurs sur le même défi)")
	concurrence := fs.Int("concurrence", 32, "opérations simultanées (mode ruee : nombre de prétendants)")
	concurrences := fs.String("concurrences", "", "mode paires : balayage de niveaux de concurrence, ex. 16,32,64,128")
	iterations := fs.Int("iterations", 256, "nombre de défis joués (mode paires) ou de manches (mode ruee)")
	jeu := fs.String("jeu", "", "identifiant de jeu")
	plateforme := fs.String("plateforme", "", "identifiant de plateforme")
	// La mise doit respecter les bornes de la configuration financière
	// (`configurations_financieres`) : sous le minimum, l'API répond 400 et la
	// mesure ne vaut plus rien. 500 XOF est le minimum posé par le seed.
	mise := fs.Int("mise", 500, "mise de chaque défi (doit respecter la mise minimale configurée)")
	sortieJSON := fs.String("json", "", "chemin d'un rapport JSON à écrire")
	_ = fs.Parse(args)

	comptes, err := chargerComptes(*comptesFichier)
	if err != nil {
		fmt.Println("comptes :", err)
		return 2
	}
	if *jeu == "" || *plateforme == "" {
		fmt.Println("-jeu et -plateforme sont obligatoires")
		return 2
	}
	base := strings.TrimRight(*api, "/")
	cl := nouveauClientHTTP(*concurrence)

	fmt.Printf("Cible          : %s\n", base)
	fmt.Printf("Mode           : %s  |  concurrence %d  |  %d itérations  |  %d comptes  |  mise %d\n\n",
		*mode, *concurrence, *iterations, len(comptes), *mise)

	niveaux := []int{*concurrence}
	if *mode != "ruee" && *concurrences != "" {
		n, err := listeEntiers(*concurrences)
		if err != nil || len(n) == 0 {
			fmt.Println("concurrences invalides :", *concurrences)
			return 2
		}
		niveaux = n
	}

	rapports := make([]rapportDefis, 0, len(niveaux))
	for _, niveau := range niveaux {
		var rap rapportDefis
		if *mode == "ruee" {
			rap = ruee(cl, base, comptes, *jeu, *plateforme, *mise, niveau, *iterations)
		} else {
			rap = paires(cl, base, comptes, *jeu, *plateforme, *mise, niveau, *iterations)
		}
		rapports = append(rapports, rap)
		afficherDefis(rap)
	}

	if *sortieJSON != "" {
		b, _ := json.MarshalIndent(rapports, "", "  ")
		if err := os.WriteFile(*sortieJSON, b, 0o644); err != nil {
			fmt.Println("écriture du rapport JSON impossible :", err)
		} else {
			fmt.Println("Rapport JSON :", *sortieJSON)
		}
	}
	for _, r := range rapports {
		if len(r.Anomalies) > 0 {
			return 1
		}
	}
	return 0
}

func afficherDefis(rap rapportDefis) {
	fmt.Printf("── %s — concurrence %d\n", rap.Mode, rap.Concurrence)
	fmt.Printf("   durée totale      : %.2f s\n", rap.Duree)
	fmt.Printf("   débit             : %.1f défis menés à leur match/s  (%.1f requêtes/s)\n", rap.DebitParSec, rap.RequetesParSec)
	fmt.Printf("   POST /defis       : %s\n", rap.Creations)
	fmt.Printf("   POST /rejoindre   : %s\n", rap.Rejointes)
	fmt.Printf("   codes HTTP        : %s\n", formaterCauses(rap.Codes))
	fmt.Printf("   défis créés       : %d  |  matchs ouverts : %d\n", rap.DefisCrees, rap.MatchsOuverts)
	if len(rap.Anomalies) > 0 {
		fmt.Printf("   ANOMALIES         :\n")
		for _, a := range rap.Anomalies {
			fmt.Printf("      - %s\n", a)
		}
	} else {
		fmt.Printf("   anomalies         : aucune\n")
	}
	fmt.Println()
}

// paires simule le cas d'usage nominal : un joueur crée un défi, un autre le
// rejoint — autant de fois que demandé, avec N opérations en vol.
func paires(cl *http.Client, base string, comptes []compte, jeu, plateforme string, mise, concurrence, iterations int) rapportDefis {
	creations, rejointes := &serie{}, &serie{}
	codes := nouveauCompteur()
	var anomaliesMu sync.Mutex
	listeAnomalies := []string{}
	var crees, matchs atomic.Int64

	travail := make(chan int, iterations)
	for i := 0; i < iterations; i++ {
		travail <- i
	}
	close(travail)

	debut := time.Now()
	var groupe sync.WaitGroup
	for w := 0; w < concurrence; w++ {
		groupe.Add(1)
		go func() {
			defer groupe.Done()
			for i := range travail {
				createur := comptes[(i*2)%len(comptes)]
				joueur := comptes[(i*2+1)%len(comptes)]
				if createur.ID == joueur.ID {
					joueur = comptes[(i*2+2)%len(comptes)]
				}
				r := appel(cl, http.MethodPost, base+"/defis", createur.Jeton, map[string]any{
					"jeuId": jeu, "plateformeId": plateforme, "montantMise": mise,
					"regles": "montée en charge", "dureeHeures": 1,
				})
				creations.ajouter(r.Duree)
				codes.ajouter("POST /defis " + etiquetteCode(r))
				if r.Code != 201 {
					// Une création refusée n'est JAMAIS un détail : sans elle il n'y a
					// rien à mesurer. La cause est remontée telle quelle (mise hors
					// bornes, adresse non confirmée, catalogue inactif…).
					anomaliesMu.Lock()
					if len(listeAnomalies) < 10 {
						listeAnomalies = append(listeAnomalies,
							fmt.Sprintf("création refusée (%s) : %s", etiquetteCode(r), tronquer(string(r.Corps), 140)))
					}
					anomaliesMu.Unlock()
					continue
				}
				crees.Add(1)
				var defi struct {
					ID string `json:"id"`
				}
				_ = json.Unmarshal(r.Corps, &defi)
				if defi.ID == "" {
					continue
				}
				rj := appel(cl, http.MethodPost, base+"/defis/"+defi.ID+"/rejoindre", joueur.Jeton, nil)
				rejointes.ajouter(rj.Duree)
				codes.ajouter("POST /rejoindre " + etiquetteCode(rj))
				switch rj.Code {
				case 200, 201:
					matchs.Add(1)
				default:
					anomaliesMu.Lock()
					if len(listeAnomalies) < 10 {
						listeAnomalies = append(listeAnomalies,
							fmt.Sprintf("rejoindre a répondu %d : %s", rj.Code, tronquer(string(rj.Corps), 120)))
					}
					anomaliesMu.Unlock()
				}
			}
		}()
	}
	groupe.Wait()
	duree := time.Since(debut)

	return rapportDefis{
		Mode: "paires", Concurrence: concurrence, Iterations: iterations,
		Duree:          arrondi(duree.Seconds()),
		DebitParSec:    arrondi(float64(matchs.Load()) / duree.Seconds()),
		RequetesParSec: arrondi(float64(creations.resume().N+rejointes.resume().N) / duree.Seconds()),
		Creations:      creations.resume(), Rejointes: rejointes.resume(), Codes: codes.copie(),
		Anomalies: listeAnomalies, DefisCrees: int(crees.Load()), MatchsOuverts: int(matchs.Load()),
	}
}

// ruee fait se jeter N joueurs EN MÊME TEMPS sur le MÊME défi. Le contrat métier
// est strict : exactement un 201 (le match est créé) et N-1 refus 409. Deux
// gagnants signifieraient une mise bloquée deux fois — c'est le test de
// correction sous concurrence, pas seulement de débit.
func ruee(cl *http.Client, base string, comptes []compte, jeu, plateforme string, mise, concurrence, manches int) rapportDefis {
	creations, rejointes := &serie{}, &serie{}
	codes := nouveauCompteur()
	listeAnomalies := []string{}
	var crees, matchs int64

	debut := time.Now()
	for m := 0; m < manches; m++ {
		createur := comptes[m%len(comptes)]
		r := appel(cl, http.MethodPost, base+"/defis", createur.Jeton, map[string]any{
			"jeuId": jeu, "plateformeId": plateforme, "montantMise": mise,
			"regles": "ruée sur un même défi", "dureeHeures": 1,
		})
		creations.ajouter(r.Duree)
		codes.ajouter("POST /defis " + etiquetteCode(r))
		if r.Code != 201 {
			if len(listeAnomalies) < 10 {
				listeAnomalies = append(listeAnomalies,
					fmt.Sprintf("manche %d : création refusée (%s) : %s", m+1, etiquetteCode(r), tronquer(string(r.Corps), 140)))
			}
			continue
		}
		crees++
		var defi struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(r.Corps, &defi)

		// Tous les prétendants sont armés puis lâchés au même instant.
		depart := make(chan struct{})
		var groupe sync.WaitGroup
		resultats := make([]int, 0, concurrence)
		var mu sync.Mutex
		for k := 0; k < concurrence; k++ {
			candidat := comptes[(m+1+k)%len(comptes)]
			if candidat.ID == createur.ID {
				continue
			}
			groupe.Add(1)
			go func(c compte) {
				defer groupe.Done()
				<-depart
				rj := appel(cl, http.MethodPost, base+"/defis/"+defi.ID+"/rejoindre", c.Jeton, nil)
				rejointes.ajouter(rj.Duree)
				codes.ajouter("POST /rejoindre " + etiquetteCode(rj))
				mu.Lock()
				resultats = append(resultats, rj.Code)
				mu.Unlock()
			}(candidat)
		}
		close(depart)
		groupe.Wait()

		gagnants, conflits, autres := 0, 0, 0
		for _, code := range resultats {
			switch {
			case code == 200 || code == 201:
				gagnants++
			case code == 409:
				conflits++
			default:
				autres++
			}
		}
		matchs += int64(gagnants)
		if len(resultats) > 0 && gagnants != 1 {
			listeAnomalies = append(listeAnomalies,
				fmt.Sprintf("manche %d : %d gagnants au lieu de 1 (%d conflits, %d autres)", m+1, gagnants, conflits, autres))
		}
		if autres > 0 {
			listeAnomalies = append(listeAnomalies,
				fmt.Sprintf("manche %d : %d réponses inattendues (ni 201 ni 409)", m+1, autres))
		}
	}
	duree := time.Since(debut)

	return rapportDefis{
		Mode: "ruee", Concurrence: concurrence, Iterations: manches,
		Duree:          arrondi(duree.Seconds()),
		DebitParSec:    arrondi(float64(matchs) / duree.Seconds()),
		RequetesParSec: arrondi(float64(creations.resume().N+rejointes.resume().N) / duree.Seconds()),
		Creations:      creations.resume(), Rejointes: rejointes.resume(), Codes: codes.copie(),
		Anomalies: listeAnomalies, DefisCrees: int(crees), MatchsOuverts: int(matchs),
	}
}

func etiquetteCode(r reponseAPI) string {
	if r.Erreur != nil {
		return "réseau: " + causeCourte(r.Erreur)
	}
	return strconv.Itoa(r.Code)
}

func tronquer(s string, n int) string {
	s = strings.ReplaceAll(strings.TrimSpace(s), "\n", " ")
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func listeEntiers(brut string) ([]int, error) {
	out := []int{}
	for _, p := range strings.Split(brut, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		n, err := strconv.Atoi(p)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	sort.Ints(out)
	return out, nil
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "sockets":
		os.Exit(commandeSockets(os.Args[2:]))
	case "defis":
		os.Exit(commandeDefis(os.Args[2:]))
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Println(`Montée en charge QUI PERD — deux sous-commandes :

  sockets   combien de joueurs tiennent en même temps sur le socket temps réel,
            et en combien de temps un défi créé leur parvient à tous.
  defis     combien de défis peuvent être créés et rejoints en même temps
            (mode paires), et le verrou tient-il quand tous se ruent sur le
            même défi (mode ruee).

Exemples :
  go run ./tests/outils/charge sockets -ws ws://127.0.0.1:8090/api/temps-reel -paliers 100,500,1000
  go run ./tests/outils/charge defis   -api http://127.0.0.1:8090/api -comptes tests/tmp/comptes.json \
       -jeu <uuid> -plateforme <uuid> -mode paires -concurrence 64 -iterations 512`)
}
