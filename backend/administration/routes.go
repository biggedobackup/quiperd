package administration

import "github.com/gofiber/fiber/v3"

// Enregistrer monte les routes d'administration. Les middlewares d'authentification
// sont injectés (connecte, adminSeul) pour éviter que ce package importe `auth`
// (auth importe administration pour l'audit — l'injection casse le cycle).
func Enregistrer(api fiber.Router, connecte, adminSeul fiber.Handler) {
	// Lecture publique des règles financières actives (site vitrine, création de défi).
	api.Get("/configurations-financieres", ListerConfigurationsPubliques)

	grp := api.Group("/administration", connecte, adminSeul)
	grp.Get("/statistiques", Statistiques)
	grp.Get("/configurations-financieres", ListerConfigurations)
	grp.Patch("/configurations-financieres", ModifierConfiguration)
	grp.Get("/journaux-audit", ListerJournauxAudit)
}
