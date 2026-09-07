package auth

import (
	"time"

	"github.com/gofiber/fiber/v3"

	"quiperd/backend/utils"
)

// Enregistrer monte les routes d'authentification.
func Enregistrer(api fiber.Router) {
	grp := api.Group("/auth")
	// Plafonds par adresse IP sur les points d'entrée dont l'abus coûte cher. Ils
	// s'ajoutent au compteur par identifiant posé dans les contrôleurs de connexion :
	// l'un freine une machine qui essaie mille mots de passe, l'autre un réseau de
	// machines qui s'acharne sur un seul compte.
	// Les plafonds par IP sont larges à dessein : en Afrique de l'Ouest, un immeuble,
	// un cybercafé ou un opérateur mobile font sortir des centaines de joueurs par la
	// même adresse. C'est le compteur par identifiant (10 échecs, 15 min) qui protège
	// réellement un compte ; celui-ci ne sert qu'à casser une attaque automatisée.
	grp.Post("/inscription", utils.LimiteurIP("inscription", 20, time.Hour), Inscription)
	grp.Post("/connexion", utils.LimiteurIP("connexion", 120, 15*time.Minute), Connexion)
	grp.Post("/admin/connexion", utils.LimiteurIP("connexion-admin", 20, 15*time.Minute), ConnexionAdmin)
	grp.Post("/mot-de-passe-oublie", utils.LimiteurIP("mot-de-passe-oublie", 20, time.Hour), MotDePasseOublie)
	grp.Post("/reinitialisation-mot-de-passe", utils.LimiteurIP("reinitialisation", 60, time.Hour), ReinitialiserMotDePasse)

	// Routes protégées
	grp.Post("/deconnexion", Connecte(), Deconnexion)
	grp.Get("/moi", Connecte(), Moi)
	grp.Post("/changer-mot-de-passe", Connecte(), ChangerMotDePasse)
	grp.Post("/verification-email", Connecte(), VerifierEmail)
	grp.Post("/verification-email/renvoyer", Connecte(), RenvoyerVerificationEmail)
}
