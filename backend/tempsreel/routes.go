package tempsreel

import "github.com/gofiber/fiber/v3"

// Enregistrer monte les deux routes du temps réel.
//
// Le middleware d'authentification est injecté par routes/routes.go : le paquet
// tempsreel n'importe pas auth (règle d'import, cf. evenements.go), exactement
// comme administration.Enregistrer reçoit ses gardes.
//
//   - GET  /api/temps-reel        — public : le socket s'ouvre aussi en visiteur
//     (salons publics uniquement). L'identification passe par le ticket, jamais
//     par un en-tête `Authorization` : le navigateur ne peut pas en poser un sur
//     une connexion WebSocket.
//   - POST /api/temps-reel/ticket — protégé : échange la session contre un
//     ticket à usage unique.
func Enregistrer(api fiber.Router, connecte fiber.Handler) {
	api.Get("/temps-reel", Websocket)
	api.Post("/temps-reel/ticket", connecte, CreerTicket)
}
