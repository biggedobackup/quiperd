package tempsreel

import (
	"encoding/json"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/google/uuid"
	"github.com/joho/godotenv"

	"quiperd/backend/config"
)

// Recette de bout en bout du socle temps réel : vrai serveur Fiber, vrai socket
// WebSocket, vrai Redis. Ignorée automatiquement si Redis n'est pas joignable.
func TestSocketBoutEnBout(t *testing.T) {
	_ = godotenv.Load("../.env")
	cfg := config.Charger()
	cfg.CorsOrigin = "http://localhost:3000"
	if err := config.ConnecterRedis(cfg); err != nil {
		t.Skip("Redis indisponible: " + err.Error())
	}
	Demarrer()

	joueur := uuid.New()
	app := fiber.New()
	// Même pile de middlewares que main.go : on vérifie que recover, logger et
	// surtout CORS ne perturbent pas la réponse 101 de l'upgrade.
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CorsOrigin},
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))
	api := app.Group("/api")
	Enregistrer(api, func(c fiber.Ctx) error {
		c.Locals(cleUtilisateurID, joueur)
		c.Locals(cleRole, RoleJoueur)
		return c.Next()
	})

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = app.Listener(ln, fiber.ListenConfig{DisableStartupMessage: true}) }()
	defer func() { _ = app.Shutdown() }()
	time.Sleep(300 * time.Millisecond)
	base := "http://" + ln.Addr().String()

	// 1) Ticket.
	req, _ := http.NewRequest(http.MethodPost, base+"/api/temps-reel/ticket", nil)
	rep, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer rep.Body.Close()
	if rep.StatusCode != 200 {
		t.Fatalf("ticket: statut %d", rep.StatusCode)
	}
	var ticket ReponseTicket
	if err := json.NewDecoder(rep.Body).Decode(&ticket); err != nil {
		t.Fatal(err)
	}
	if len(ticket.Ticket) < 40 || ticket.Expiration == "" {
		t.Fatalf("ticket inattendu: %+v", ticket)
	}

	// 2) Origine interdite → 403 à la poignée de main.
	entetes := http.Header{}
	entetes.Set("Origin", "https://site-malveillant.example")
	if _, _, err := websocket.DefaultDialer.Dial("ws://"+ln.Addr().String()+"/api/temps-reel", entetes); err == nil {
		t.Fatal("une origine hors liste blanche aurait dû être refusée")
	}

	// 3) Connexion authentifiée depuis l'origine du frontend.
	bonnes := http.Header{}
	bonnes.Set("Origin", "http://localhost:3000")
	conn, _, err := websocket.DefaultDialer.Dial(
		"ws://"+ln.Addr().String()+"/api/temps-reel?ticket="+ticket.Ticket, bonnes)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	env := lire(t, conn)
	if env.Evenement != EvtConnexionPrete {
		t.Fatalf("premier événement = %s, attendu %s", env.Evenement, EvtConnexionPrete)
	}
	charge := env.Charge.(map[string]any)
	if charge["role"] != RoleJoueur || charge["utilisateurId"] != joueur.String() {
		t.Fatalf("charge connexion.prete inattendue: %+v", charge)
	}

	// 4) Le même ticket ne vaut plus rien (GETDEL) → visiteur + connexion.refusee.
	conn2, _, err := websocket.DefaultDialer.Dial(
		"ws://"+ln.Addr().String()+"/api/temps-reel?ticket="+ticket.Ticket, bonnes)
	if err != nil {
		t.Fatal(err)
	}
	defer conn2.Close()
	env2 := lire(t, conn2)
	if env2.Evenement != EvtConnexionRefusee {
		t.Fatalf("rejeu du ticket: événement = %s, attendu %s", env2.Evenement, EvtConnexionRefusee)
	}
	env2 = lire(t, conn2)
	if env2.Evenement != EvtConnexionPrete || env2.Charge.(map[string]any)["role"] != RoleVisiteur {
		t.Fatalf("rejeu du ticket: la connexion devait basculer en visiteur, reçu %+v", env2)
	}

	// 5) Abonnements : public accepté, admin et salon d'autrui refusés.
	ecrire(t, conn, map[string]any{"action": "abonner", "salons": []string{
		SalonDefisPublics, SalonAdmin, SalonUtilisateur(joueur), SalonUtilisateur(uuid.New()),
	}})
	env = lire(t, conn)
	if env.Evenement != EvtAbonnementConfirme {
		t.Fatalf("événement = %s, attendu %s", env.Evenement, EvtAbonnementConfirme)
	}
	c := env.Charge.(map[string]any)
	salons := chaines(c["salons"])
	refuses := chaines(c["refuses"])
	if len(salons) != 2 || len(refuses) != 2 {
		t.Fatalf("abonnement.confirme inattendu: salons=%v refuses=%v", salons, refuses)
	}

	// Le compteur suit l'abonnement au salon public.
	env = lire(t, conn, EvtCompteurEnLigne)
	if env.Evenement != EvtCompteurEnLigne {
		t.Fatalf("événement = %s, attendu %s", env.Evenement, EvtCompteurEnLigne)
	}

	// 6) Diffusion via Redis Pub/Sub jusqu'au socket.
	Publier(EvtDefiCree, map[string]any{"id": "abc"}, SalonDefisPublics)
	env = lire(t, conn)
	if env.Evenement != EvtDefiCree || env.Salon != SalonDefisPublics {
		t.Fatalf("diffusion inattendue: %+v", env)
	}

	// 7) Un événement privé ne part pas sur le salon public.
	Publier(EvtPortefeuilleMaj, map[string]any{"soldeDisponible": "100"}, SalonUtilisateur(joueur))
	env = lire(t, conn)
	if env.Evenement != EvtPortefeuilleMaj || env.Salon != SalonUtilisateur(joueur) {
		t.Fatalf("diffusion privée inattendue: %+v", env)
	}

	// 8) Un ping client n'appelle aucune réponse applicative, mais ne casse rien.
	ecrire(t, conn, map[string]any{"action": "ping"})
	ecrire(t, conn, map[string]any{"action": "desabonner", "salons": []string{SalonDefisPublics}})
	env = lire(t, conn)
	if env.Evenement != EvtAbonnementConfirme || len(chaines(env.Charge.(map[string]any)["salons"])) != 1 {
		t.Fatalf("désabonnement inattendu: %+v", env)
	}

	if n := JoueursEnLigne(); n < 2 {
		t.Fatalf("JoueursEnLigne = %d, attendu au moins 2", n)
	}
}

// Présence : le hub relaie aux AUTRES membres du salon de match, jamais à
// l'émetteur, et annonce le départ à la fermeture du socket.
func TestPresenceMatch(t *testing.T) {
	_ = godotenv.Load("../.env")
	cfg := config.Charger()
	cfg.CorsOrigin = "http://localhost:3000"
	if err := config.ConnecterRedis(cfg); err != nil {
		t.Skip("Redis indisponible: " + err.Error())
	}
	if err := config.ConnecterDB(cfg); err != nil {
		t.Log("PostgreSQL indisponible, vérification SQL du salon match ignorée: " + err.Error())
	}
	Demarrer()

	// Deux administrateurs DISTINCTS : la présence est par utilisateur, un même
	// compte ouvert deux fois ne s'annonce pas à lui-même.
	adminA, adminB := uuid.New(), uuid.New()
	var suivant int
	app := fiber.New()
	api := app.Group("/api")
	Enregistrer(api, func(c fiber.Ctx) error {
		id := adminA
		if suivant > 0 {
			id = adminB
		}
		suivant++
		c.Locals(cleUtilisateurID, id)
		c.Locals(cleRole, RoleAdmin)
		return c.Next()
	})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = app.Listener(ln, fiber.ListenConfig{DisableStartupMessage: true}) }()
	defer func() { _ = app.Shutdown() }()
	time.Sleep(300 * time.Millisecond)

	salon := SalonMatch(uuid.New())
	ouvrir := func() *websocket.Conn {
		rep, err := http.Post("http://"+ln.Addr().String()+"/api/temps-reel/ticket", "", nil)
		if err != nil {
			t.Fatal(err)
		}
		defer rep.Body.Close()
		var ticket ReponseTicket
		if err := json.NewDecoder(rep.Body).Decode(&ticket); err != nil {
			t.Fatal(err)
		}
		entetes := http.Header{}
		entetes.Set("Origin", "http://localhost:3000")
		conn, _, err := websocket.DefaultDialer.Dial(
			"ws://"+ln.Addr().String()+"/api/temps-reel?ticket="+ticket.Ticket, entetes)
		if err != nil {
			t.Fatal(err)
		}
		lire(t, conn) // connexion.prete
		ecrire(t, conn, map[string]any{"action": "abonner", "salons": []string{salon}})
		lire(t, conn) // abonnement.confirme
		return conn
	}

	a := ouvrir()
	defer a.Close()
	b := ouvrir()
	defer b.Close()

	ecrire(t, a, map[string]any{"action": "presence", "salon": salon, "surLaPage": true})
	env := lire(t, b)
	if env.Evenement != EvtMatchPresence || env.Salon != salon {
		t.Fatalf("présence non relayée: %+v", env)
	}
	charge := env.Charge.(map[string]any)
	if charge["present"] != true || charge["surLaPage"] != true || charge["utilisateurId"] != adminA.String() {
		t.Fatalf("charge de présence inattendue: %+v", charge)
	}
	if len(charge) != 3 {
		t.Fatalf("la présence ne doit porter que 3 champs, reçu %+v", charge)
	}

	// L'émetteur ne se voit pas lui-même (aucun message en attente côté A).
	_ = a.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	if _, _, err := a.ReadMessage(); err == nil {
		t.Fatal("l'émetteur ne doit pas recevoir sa propre présence")
	}

	// Fermeture de A → départ annoncé à B.
	a.Close()
	env = lire(t, b)
	if env.Evenement != EvtMatchPresence || env.Charge.(map[string]any)["present"] != false {
		t.Fatalf("départ non annoncé: %+v", env)
	}
}

// lire renvoie le prochain événement en ignorant les compteur.en_ligne
// spontanés (débattus toutes les 5 s), sauf quand on les attend explicitement.
func lire(t *testing.T, conn *websocket.Conn, attendus ...string) Enveloppe {
	t.Helper()
	attendCompteur := len(attendus) > 0 && attendus[0] == EvtCompteurEnLigne
	for i := 0; i < 10; i++ {
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, brut, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		var env Enveloppe
		if err := json.Unmarshal(brut, &env); err != nil {
			t.Fatal(err)
		}
		if env.Evenement == EvtCompteurEnLigne && !attendCompteur {
			continue
		}
		return env
	}
	t.Fatal("aucun événement utile reçu")
	return Enveloppe{}
}

func ecrire(t *testing.T, conn *websocket.Conn, v any) {
	t.Helper()
	b, _ := json.Marshal(v)
	if err := conn.WriteMessage(websocket.TextMessage, b); err != nil {
		t.Fatal(err)
	}
}

func chaines(v any) []string {
	liste, _ := v.([]any)
	out := make([]string, 0, len(liste))
	for _, e := range liste {
		if s, ok := e.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// Vérifie que la requête SQL brute d'appartenance au match colle bien au schéma
// réel (colonnes joueur_1_id / joueur_2_id de l'annexe, pas celles de GORM).
func TestAppartenanceMatchSQL(t *testing.T) {
	_ = godotenv.Load("../.env")
	cfg := config.Charger()
	if err := config.ConnecterDB(cfg); err != nil {
		t.Skip("PostgreSQL indisponible: " + err.Error())
	}
	var ligne struct {
		ID      uuid.UUID
		Joueur1 uuid.UUID
		Joueur2 uuid.UUID
	}
	err := config.DB.Raw(
		`SELECT id, joueur_1_id AS joueur1, joueur_2_id AS joueur2 FROM matchs LIMIT 1`).
		Scan(&ligne).Error
	if err != nil {
		t.Fatalf("schéma matchs inattendu: %v", err)
	}
	if ligne.ID == uuid.Nil {
		t.Skip("aucun match en base")
	}
	if !estJoueurDuMatch(ligne.ID, ligne.Joueur1) {
		t.Fatal("le joueur 1 devrait appartenir au match")
	}
	if !estJoueurDuMatch(ligne.ID, ligne.Joueur2) {
		t.Fatal("le joueur 2 devrait appartenir au match")
	}
	if estJoueurDuMatch(ligne.ID, uuid.New()) {
		t.Fatal("un tiers ne doit pas appartenir au match")
	}
	if !autoriserSalon(ligne.Joueur1, RoleJoueur, SalonMatch(ligne.ID)) {
		t.Fatal("le joueur 1 doit pouvoir rejoindre le salon du match")
	}
	if autoriserSalon(uuid.New(), RoleJoueur, SalonMatch(ligne.ID)) {
		t.Fatal("un tiers ne doit pas pouvoir rejoindre le salon du match")
	}
}
