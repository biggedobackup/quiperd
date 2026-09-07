package utils

import (
	"strings"

	"github.com/gofiber/fiber/v3"
)

// EntetesSecurite pose les en-têtes de sécurité sur TOUTES les réponses de l'API.
//
// Le reverse proxy en pose déjà quelques-uns, mais l'API est jointe directement
// par l'application mobile et, en développement, sans proxy du tout : les
// garanties ne doivent pas dépendre d'une couche que l'on peut oublier de
// déployer. Ce qui est posé ici :
//
//   - `X-Content-Type-Options: nosniff` — décisif pour les preuves servies par
//     `/api/preuves/:id/fichier` : sans lui, un fichier téléversé au contenu
//     trompeur pourrait être interprété comme du HTML par le navigateur ;
//   - `X-Frame-Options: DENY` et `frame-ancestors 'none'` — l'API n'a aucune
//     raison d'être encadrée (la page de paiement encadrée, elle, est celle du
//     prestataire, pas la nôtre) ;
//   - `Referrer-Policy` — aucune URL d'API dans le référent d'un site tiers ;
//   - `Permissions-Policy` — l'API ne rend pas de page, aucune API du navigateur
//     ne lui est nécessaire ;
//   - `Strict-Transport-Security` dès que la requête est arrivée en HTTPS. On se
//     fie à `X-Forwarded-Proto` du proxy : en réseau local le site est servi en
//     HTTP simple, et poser HSTS y rendrait l'API injoignable.
//
// `Cache-Control: no-store` est réservé aux réponses authentifiées : le
// catalogue public a tout intérêt à être mis en cache, un solde jamais.
func EntetesSecurite() fiber.Handler {
	return func(c fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		// La documentation Swagger est la seule page HTML servie par l'API : elle charge
		// sa feuille de style et son script depuis un CDN. Elle n'est montée qu'hors
		// production ; lui appliquer `default-src 'none'` la rendrait illisible.
		if !strings.HasPrefix(c.Path(), "/api/docs") {
			c.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
		}
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()")
		c.Set("Cross-Origin-Resource-Policy", "same-site")
		if requeteHTTPS(c) {
			c.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		if c.Get("Authorization") != "" {
			c.Set("Cache-Control", "no-store")
		} else if cachePublic(c) {
			// Catalogue et règles : ces réponses ne dépendent d'aucun joueur et ne
			// changent qu'à l'initiative d'un administrateur. Les laisser mettre en
			// cache par le navigateur et par Cloudflare supprime un aller-retour à
			// chaque ouverture de page — la différence se sent sur une 3G ivoirienne.
			// `Vary: Authorization` : la variante administrateur (catalogue complet)
			// ne doit jamais être servie depuis le cache de la variante publique.
			c.Set("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
			c.Set("Vary", "Authorization, Accept-Encoding")
		}
		return c.Next()
	}
}

// cheminsCachables : lectures publiques, identiques pour tout le monde, que rien
// n'oblige à recalculer à chaque affichage de page.
var cheminsCachables = []string{
	"/api/jeux",
	"/api/plateformes",
	"/api/configurations-financieres",
	"/api/classement",
	"/api/paiements/prestataires",
}

func cachePublic(c fiber.Ctx) bool {
	if c.Method() != fiber.MethodGet {
		return false
	}
	chemin := c.Path()
	for _, prefixe := range cheminsCachables {
		if chemin == prefixe || strings.HasPrefix(chemin, prefixe+"/") || strings.HasPrefix(chemin, prefixe+"?") {
			return true
		}
	}
	return false
}

// requeteHTTPS dit si le visiteur a joint la plateforme en HTTPS, en se fiant à
// l'en-tête du proxy de confiance placé devant l'API.
func requeteHTTPS(c fiber.Ctx) bool {
	if transmis := c.Get("X-Forwarded-Proto"); transmis != "" {
		return strings.EqualFold(strings.TrimSpace(strings.Split(transmis, ",")[0]), "https")
	}
	return c.Scheme() == "https"
}
