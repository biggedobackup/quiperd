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
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"quiperd/backend/config"
	"quiperd/backend/jobs"
	"quiperd/backend/litiges"
	"quiperd/backend/matchs"
	"quiperd/backend/migrations"
	"quiperd/backend/notifications"
	"quiperd/backend/routes"
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

	app := fiber.New(fiber.Config{
		AppName:      "QUI PERD API",
		BodyLimit:    int(cfg.UploadMaxOctets) + 1024*1024,
		ErrorHandler: gestionErreur,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CorsOrigin},
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	routes.Enregistrer(app)

	utils.Log.Info("QUI PERD API démarrée sur " + cfg.AppHost + ":" + cfg.AppPort)
	if err := app.Listen(cfg.AppHost + ":" + cfg.AppPort); err != nil {
		utils.Log.Fatal("démarrage du serveur impossible: " + err.Error())
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
