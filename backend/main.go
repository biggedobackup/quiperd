// QUI PERD — API backend.
//
// @title QUI PERD API
// @version 1.0
// @description API de la plateforme QUI PERD (défis de match, escrow, paiements Mobile Money).
// @BasePath /api
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
package main

import (
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"quiperd/backend/administration"
	"quiperd/backend/config"
	"quiperd/backend/jobs"
	"quiperd/backend/litiges"
	"quiperd/backend/matchs"
	"quiperd/backend/migrations"
	"quiperd/backend/notifications"
	"quiperd/backend/routes"
	"quiperd/backend/tempsreel"
	"quiperd/backend/utils"
	"quiperd/backend/worker"
)

func main() {
	cfg := config.Charger()
	utils.InitLogger(cfg.EstProduction())
	defer utils.Sync()
	utils.PushActif = cfg.FCMActif

	if err := config.ConnecterDB(cfg); err != nil {
		utils.Log.Fatal("connexion PostgreSQL impossible: " + err.Error())
	}
	if err := config.ConnecterRedis(cfg); err != nil {
		utils.Log.Fatal("connexion Redis impossible: " + err.Error())
	}

	if err := migrations.Migrer(); err != nil {
		utils.Log.Fatal("migration impossible: " + err.Error())
	}
	if err := migrations.Semer(utils.Log); err != nil {
		utils.Log.Fatal("seed impossible: " + err.Error())
	}

	// File d'attente Asynq + branchement des hooks inter-modules (sans cycle d'import).
	jobs.InitClient(cfg)
	defer jobs.Fermer()
	litiges.Brancher()
	brancherNotifications()

	// Worker Asynq (goroutine).
	worker.Demarrer(cfg)

	// Socle temps réel : file de publication, abonnement au canal Redis Pub/Sub
	// `qp:temps-reel` et compteur de joueurs en ligne. À démarrer AVANT les routes :
	// dès qu'un socket peut s'ouvrir, le hub doit être en état de diffuser.
	tempsreel.Demarrer()
	defer tempsreel.Arreter()

	// Tableau de bord administrateur vivant : plutôt que d'appeler le recalcul depuis une
	// dizaine de contrôleurs, on écoute le flux temps réel et on ne réagit qu'aux événements
	// qui déplacent réellement un compteur (administration décide lesquels).
	tempsreel.SurEvenement = administration.KpiSiConcerne

	app := fiber.New(fiber.Config{
		AppName:      "QUI PERD API",
		BodyLimit:    int(cfg.UploadMaxOctets) + 1024*1024,
		ErrorHandler: gestionErreur,
	})

	app.Use(recover.New())
	// Journal HTTP : une ligne par requête. Utile en développement, coûteux en production
	// (écriture synchrone sur stdout à chaque appel, journaux de conteneur qui gonflent) —
	// le reverse proxy tient déjà le journal d'accès.
	if !cfg.EstProduction() {
		app.Use(logger.New())
	}
	// Compression des réponses (gzip/brotli/deflate). Les listes JSON de l'API sont très
	// répétitives : la charge utile tombe d'environ 80 %, ce qui compte pour un joueur en
	// 3G. JAMAIS sur le socket temps réel : une trame WebSocket n'a rien à faire dans un
	// flux compressé, la connexion serait cassée à l'upgrade.
	app.Use(compress.New(compress.Config{
		Next: func(c fiber.Ctx) bool {
			return strings.HasPrefix(c.Path(), "/api/temps-reel")
		},
		Level: compress.LevelBestSpeed,
	}))
	app.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CorsOrigin},
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	routes.Enregistrer(app)

	// Arrêt propre : on ferme d'abord les sockets temps réel (trame de fermeture
	// envoyée à chaque client, empreinte du compteur retirée de Redis), puis le
	// serveur HTTP. Sans cela, les clients reconnectent sur un socle déjà mort.
	go arretPropre(app)

	utils.Log.Info("QUI PERD API démarrée sur " + cfg.AppHost + ":" + cfg.AppPort)
	if err := app.Listen(cfg.AppHost + ":" + cfg.AppPort); err != nil {
		utils.Log.Fatal("démarrage du serveur impossible: " + err.Error())
	}
}

// arretPropre attend SIGINT/SIGTERM (docker stop, Ctrl+C) et démonte la pile.
func arretPropre(app *fiber.App) {
	signaux := make(chan os.Signal, 1)
	signal.Notify(signaux, os.Interrupt, syscall.SIGTERM)
	<-signaux

	utils.Log.Info("arrêt demandé : fermeture des connexions temps réel")
	tempsreel.Arreter()
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		utils.Log.Warn("arrêt du serveur HTTP: " + err.Error())
	}
}

// brancherNotifications relie le règlement de match aux notifications (hook posé
// sur le package matchs pour éviter matchs -> notifications en import direct).
func brancherNotifications() {
	matchs.NotifierReglement = func(tx *gorm.DB, gagnantID, perdantID uuid.UUID, gain decimal.Decimal) {
		_ = notifications.Creer(tx, gagnantID, "Match terminé",
			"Félicitations, vous avez gagné le match. Votre gain a été crédité.", notifications.TypeMatchTermine)
		_ = notifications.Creer(tx, perdantID, "Match terminé",
			"Le match est terminé. Consultez le détail dans l'application.", notifications.TypeMatchTermine)
	}
}

func gestionErreur(c fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}
	return c.Status(code).JSON(fiber.Map{"erreur": err.Error()})
}
