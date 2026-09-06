package auth

import "github.com/gofiber/fiber/v3"

// Enregistrer monte les routes d'authentification.
func Enregistrer(api fiber.Router) {
	grp := api.Group("/auth")
	grp.Post("/inscription", Inscription)
	grp.Post("/connexion", Connexion)
	grp.Post("/admin/connexion", ConnexionAdmin)
	grp.Post("/mot-de-passe-oublie", MotDePasseOublie)
	grp.Post("/reinitialisation-mot-de-passe", ReinitialiserMotDePasse)

	// Routes protégées
	grp.Post("/deconnexion", Connecte(), Deconnexion)
	grp.Get("/moi", Connecte(), Moi)
	grp.Post("/changer-mot-de-passe", Connecte(), ChangerMotDePasse)
	grp.Post("/verification-email", Connecte(), VerifierEmail)
	grp.Post("/verification-email/renvoyer", Connecte(), RenvoyerVerificationEmail)
}
