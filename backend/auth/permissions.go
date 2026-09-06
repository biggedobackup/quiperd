package auth

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"quiperd/backend/utils"
)

// Clés de contexte (Locals).
const (
	CleUtilisateurID = "utilisateurID"
	CleRole          = "role"
	CleJTI           = "jti"
)

// Connecte est le middleware d'authentification : valide le Bearer JWT et la
// session Redis, puis renseigne les Locals.
func Connecte() fiber.Handler {
	return func(c fiber.Ctx) error {
		entete := c.Get("Authorization")
		if entete == "" || !strings.HasPrefix(entete, "Bearer ") {
			return utils.Erreur(c, fiber.StatusUnauthorized, "authentification requise")
		}
		jetonStr := strings.TrimSpace(strings.TrimPrefix(entete, "Bearer "))
		claims, err := ValiderJeton(jetonStr)
		if err != nil {
			return utils.Erreur(c, fiber.StatusUnauthorized, "session invalide ou expirée")
		}
		id, err := uuid.Parse(claims.Subject)
		if err != nil {
			return utils.Erreur(c, fiber.StatusUnauthorized, "jeton invalide")
		}
		c.Locals(CleUtilisateurID, id)
		c.Locals(CleRole, claims.Role)
		c.Locals(CleJTI, claims.ID)
		return c.Next()
	}
}

// Optionnel renseigne les Locals si un jeton valide est présent, sans jamais
// rejeter la requête. Utile pour les routes publiques dont le contenu varie
// selon le rôle (ex. le catalogue : l'admin voit aussi les entrées inactives).
func Optionnel() fiber.Handler {
	return func(c fiber.Ctx) error {
		entete := c.Get("Authorization")
		if strings.HasPrefix(entete, "Bearer ") {
			jetonStr := strings.TrimSpace(strings.TrimPrefix(entete, "Bearer "))
			if claims, err := ValiderJeton(jetonStr); err == nil {
				if id, err := uuid.Parse(claims.Subject); err == nil {
					c.Locals(CleUtilisateurID, id)
					c.Locals(CleRole, claims.Role)
					c.Locals(CleJTI, claims.ID)
				}
			}
		}
		return c.Next()
	}
}

// AdminSeul refuse l'accès si le rôle du jeton n'est pas administrateur.
// À chaîner APRÈS Connecte().
func AdminSeul() fiber.Handler {
	return func(c fiber.Ctx) error {
		if RoleDe(c) != RoleAdmin {
			return utils.Erreur(c, fiber.StatusForbidden, "accès réservé aux administrateurs")
		}
		return c.Next()
	}
}

// UtilisateurIDDe récupère l'id de l'utilisateur/administrateur courant.
func UtilisateurIDDe(c fiber.Ctx) uuid.UUID {
	if v, ok := c.Locals(CleUtilisateurID).(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}

// RoleDe récupère le rôle courant.
func RoleDe(c fiber.Ctx) string {
	if v, ok := c.Locals(CleRole).(string); ok {
		return v
	}
	return ""
}

// JTIDe récupère le jti de la session courante.
func JTIDe(c fiber.Ctx) string {
	if v, ok := c.Locals(CleJTI).(string); ok {
		return v
	}
	return ""
}

// EstAdmin indique si le contexte courant est un administrateur.
func EstAdmin(c fiber.Ctx) bool { return RoleDe(c) == RoleAdmin }
