package utils

import "github.com/gofiber/fiber/v3"

// Erreur renvoie une erreur JSON au format de la charte API :
// { "erreur": "message lisible en français" }.
func Erreur(c fiber.Ctx, statut int, message string) error {
	return c.Status(statut).JSON(fiber.Map{"erreur": message})
}

// ErreurValidation renvoie une 400 avec le détail des champs invalides.
func ErreurValidation(c fiber.Ctx, message string, details map[string]string) error {
	corps := fiber.Map{"erreur": message}
	if len(details) > 0 {
		corps["details"] = details
	}
	return c.Status(fiber.StatusBadRequest).JSON(corps)
}

// OK renvoie une donnée avec le statut fourni (200 par défaut).
func OK(c fiber.Ctx, donnee any, statut ...int) error {
	code := fiber.StatusOK
	if len(statut) > 0 {
		code = statut[0]
	}
	return c.Status(code).JSON(donnee)
}
