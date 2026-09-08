package contact

import (
	"defisenligne/backend/auth"
	"github.com/gofiber/fiber/v3"
)

// Enregistrer monte les routes du formulaire de contact.
// L'envoi public est déclaré AVANT le groupe protégé : Fiber parcourt la pile dans l'ordre,
// le POST public est donc servi sans passer par Connecte()/AdminSeul() (même schéma que le
// catalogue jeux/plateformes).
func Enregistrer(api fiber.Router) {
	// Envoi public ; un jeton joueur valide, s'il est présent, rattache le message au compte.
	api.Post("/contact", auth.Optionnel(), Envoyer)

	grp := api.Group("/contact", auth.Connecte(), auth.AdminSeul())
	grp.Get("/", Lister)
	grp.Get("/:id", Detail)
	grp.Patch("/:id", Traiter)
	grp.Delete("/:id", Supprimer)
}
