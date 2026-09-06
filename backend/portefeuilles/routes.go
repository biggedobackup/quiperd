package portefeuilles

import (
	"github.com/gofiber/fiber/v3"
	"quiperd/backend/auth"
)

// Enregistrer monte les routes du portefeuille (toutes protégées).
func Enregistrer(api fiber.Router) {
	grp := api.Group("/portefeuille", auth.Connecte())
	grp.Get("/", Lire)
	grp.Get("/transactions", Transactions)
}
