// Package routes centralise l'enregistrement de toutes les routes de l'API.
package routes

import (
	"github.com/gofiber/fiber/v3"
	"github.com/swaggo/swag"
	"quiperd/backend/administration"
	"quiperd/backend/auth"
	"quiperd/backend/classement"
	"quiperd/backend/comptes_gamers"
	"quiperd/backend/config"
	"quiperd/backend/contact"
	"quiperd/backend/defis"
	_ "quiperd/backend/docs" // spécification Swagger générée (swag init)
	"quiperd/backend/jeux"
	"quiperd/backend/litiges"
	"quiperd/backend/matchs"
	"quiperd/backend/notifications"
	"quiperd/backend/paiements"
	"quiperd/backend/plateformes"
	"quiperd/backend/portefeuilles"
	"quiperd/backend/preuves"
	"quiperd/backend/tempsreel"
	"quiperd/backend/utilisateurs"
)

// Enregistrer monte /api et toutes les routes des modules.
func Enregistrer(app *fiber.App) {
	api := app.Group("/api")

	// Santé (Postgres + Redis)
	api.Get("/sante", Sante)

	// Documentation Swagger
	api.Get("/docs", swaggerUI)
	api.Get("/docs/", swaggerUI)
	api.Get("/docs/doc.json", swaggerJSON)

	// Modules
	auth.Enregistrer(api)
	utilisateurs.Enregistrer(api)
	comptes_gamers.Enregistrer(api)
	jeux.Enregistrer(api)
	plateformes.Enregistrer(api)
	defis.Enregistrer(api)
	matchs.Enregistrer(api)
	classement.Enregistrer(api)
	preuves.Enregistrer(api)
	litiges.Enregistrer(api)
	portefeuilles.Enregistrer(api)
	paiements.Enregistrer(api)
	notifications.Enregistrer(api)
	administration.Enregistrer(api, auth.Connecte(), auth.AdminSeul())
	contact.Enregistrer(api)
	// Temps réel : le socket est public (visiteur autorisé), le ticket exige la session.
	tempsreel.Enregistrer(api, auth.Connecte())
}

// Sante godoc
// @Summary Vérification de disponibilité (Postgres + Redis)
// @Tags systeme
// @Success 200 {object} map[string]any
// @Router /sante [get]
func Sante(c fiber.Ctx) error {
	statutPG := "ok"
	if err := config.PingDB(); err != nil {
		statutPG = "indisponible"
	}
	statutRedis := "ok"
	if err := config.PingRedis(); err != nil {
		statutRedis = "indisponible"
	}
	code := fiber.StatusOK
	if statutPG != "ok" || statutRedis != "ok" {
		code = fiber.StatusServiceUnavailable
	}
	return c.Status(code).JSON(fiber.Map{
		"statut":   "en_ligne",
		"postgres": statutPG,
		"redis":    statutRedis,
	})
}

// swaggerJSON sert la spécification générée par swaggo/swag (`swag init`),
// enregistrée par le paquet docs — indépendante du répertoire de travail.
func swaggerJSON(c fiber.Ctx) error {
	doc, err := swag.ReadDoc()
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erreur": "documentation non générée"})
	}
	c.Set("Content-Type", "application/json")
	return c.SendString(doc)
}

func swaggerUI(c fiber.Ctx) error {
	c.Set("Content-Type", "text/html; charset=utf-8")
	return c.SendString(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>QUI PERD — API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"/>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({ url: '/api/docs/doc.json', dom_id: '#swagger-ui' });
    };
  </script>
</body>
</html>`)
}
