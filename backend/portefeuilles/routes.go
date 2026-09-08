package portefeuilles

import (
	"defisenligne/backend/auth"
	"github.com/gofiber/fiber/v3"
)

// Enregistrer monte les routes du portefeuille (toutes protégées).
func Enregistrer(api fiber.Router) {
	grp := api.Group("/portefeuille", auth.Connecte())
	grp.Get("/", Lire)
	grp.Get("/transactions", Transactions)
}
