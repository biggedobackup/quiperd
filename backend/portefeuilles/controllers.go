package portefeuilles

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"quiperd/backend/auth"
	"quiperd/backend/config"
	"quiperd/backend/utils"
)

// Lire godoc
// @Summary Solde du portefeuille
// @Tags portefeuille
// @Security BearerAuth
// @Success 200 {object} Portefeuille
// @Router /portefeuille [get]
func Lire(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	p, err := LirePortefeuille(userID, config.DB)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture du portefeuille impossible")
	}
	return utils.OK(c, p)
}

// Transactions godoc
// @Summary Historique des mouvements
// @Tags portefeuille
// @Security BearerAuth
// @Success 200 {array} TransactionPortefeuille
// @Router /portefeuille/transactions [get]
func Transactions(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	limite, _ := strconv.Atoi(c.Query("limite", "50"))
	if limite <= 0 || limite > 200 {
		limite = 50
	}
	decalage, _ := strconv.Atoi(c.Query("decalage", "0"))
	if decalage < 0 {
		decalage = 0
	}
	txs, err := ListerTransactions(config.DB, userID, limite, decalage)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des transactions impossible")
	}
	return utils.OK(c, txs)
}
