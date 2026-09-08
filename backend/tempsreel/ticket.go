package tempsreel

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"defisenligne/backend/config"
	"defisenligne/backend/utils"
)

// prefixeTicket est l'espace de noms Redis des tickets d'ouverture de socket.
const prefixeTicket = "ws:ticket:"

// Clés de contexte Fiber renseignées par auth.Connecte(). Recopiées ici car
// tempsreel n'importe pas auth (règle d'import du paquet) : elles doivent rester
// identiques à auth.CleUtilisateurID / auth.CleRole.
const (
	cleUtilisateurID = "utilisateurID"
	cleRole          = "role"
)

// sessionTicket est la charge stockée dans Redis sous `ws:ticket:<valeur>`.
type sessionTicket struct {
	UtilisateurID string `json:"utilisateurId"`
	Role          string `json:"role"`
}

// ReponseTicket est le corps renvoyé par POST /api/temps-reel/ticket.
type ReponseTicket struct {
	Ticket     string `json:"ticket"`
	Expiration string `json:"expiration"`
}

// erreurs de consommation renvoyées au client dans `connexion.refusee`.
var (
	errTicketInvalide = errors.New("ticket invalide, expiré ou déjà utilisé")
	errTempsReelHS    = errors.New("service temps réel indisponible")
)

// dureeTicket lit la durée de vie configurée (WS_TICKET_TTL_SECONDES, 60 s par défaut).
func dureeTicket() time.Duration {
	secondes := 60
	if config.Cfg != nil && config.Cfg.WSTicketTTLSecondes > 0 {
		secondes = config.Cfg.WSTicketTTLSecondes
	}
	return time.Duration(secondes) * time.Second
}

// creerTicket génère un aléa cryptographique de 32 octets (base64 URL sans
// remplissage) et l'associe à la session dans Redis avec un TTL court.
func creerTicket(utilisateurID uuid.UUID, role string) (string, time.Time, error) {
	if config.Redis == nil {
		return "", time.Time{}, errTempsReelHS
	}
	brut := make([]byte, 32)
	if _, err := rand.Read(brut); err != nil {
		return "", time.Time{}, err
	}
	valeur := base64.RawURLEncoding.EncodeToString(brut)

	charge, err := json.Marshal(sessionTicket{UtilisateurID: utilisateurID.String(), Role: role})
	if err != nil {
		return "", time.Time{}, err
	}
	ttl := dureeTicket()
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	if err := config.Redis.Set(ctx, prefixeTicket+valeur, charge, ttl).Err(); err != nil {
		return "", time.Time{}, err
	}
	return valeur, time.Now().UTC().Add(ttl), nil
}

// consommerTicket échange le ticket contre la session, de façon ATOMIQUE (GETDEL) :
// un ticket rejoué par un tiers qui l'aurait intercepté ne vaut plus rien.
func consommerTicket(valeur string) (uuid.UUID, string, error) {
	if valeur == "" {
		return uuid.Nil, RoleVisiteur, errTicketInvalide
	}
	if config.Redis == nil {
		return uuid.Nil, RoleVisiteur, errTempsReelHS
	}
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()

	brut, err := config.Redis.GetDel(ctx, prefixeTicket+valeur).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return uuid.Nil, RoleVisiteur, errTicketInvalide
		}
		return uuid.Nil, RoleVisiteur, errTempsReelHS
	}

	var s sessionTicket
	if err := json.Unmarshal(brut, &s); err != nil {
		return uuid.Nil, RoleVisiteur, errTicketInvalide
	}
	id, err := uuid.Parse(s.UtilisateurID)
	if err != nil {
		return uuid.Nil, RoleVisiteur, errTicketInvalide
	}
	role := s.Role
	if role != RoleAdmin && role != RoleJoueur {
		role = RoleJoueur
	}
	return id, role, nil
}

// CreerTicket godoc
// @Summary Ticket d'ouverture du socket temps réel
// @Description Échange la session Bearer contre un ticket à usage unique (32 octets aléatoires, base64 URL, TTL 60 s). Le navigateur ouvre ensuite `wss://<hôte>/api/temps-reel?ticket=<ticket>` : le jeton JWT ne transite jamais dans l'URL. Un ticket absent, expiré ou déjà consommé n'échoue pas la connexion — le socket s'ouvre en visiteur (salons publics) après un événement `connexion.refusee`.
// @Tags temps-reel
// @Produce json
// @Security BearerAuth
// @Success 200 {object} tempsreel.ReponseTicket
// @Failure 401 {object} map[string]string "authentification requise"
// @Failure 503 {object} map[string]string "service temps réel indisponible"
// @Router /temps-reel/ticket [post]
func CreerTicket(c fiber.Ctx) error {
	utilisateurID, _ := c.Locals(cleUtilisateurID).(uuid.UUID)
	if utilisateurID == uuid.Nil {
		return utils.Erreur(c, fiber.StatusUnauthorized, "authentification requise")
	}
	role, _ := c.Locals(cleRole).(string)
	if role == "" {
		role = RoleJoueur
	}

	valeur, expiration, err := creerTicket(utilisateurID, role)
	if err != nil {
		journaliser("temps réel: création de ticket impossible")
		return utils.Erreur(c, fiber.StatusServiceUnavailable, "service temps réel indisponible")
	}
	return utils.OK(c, ReponseTicket{
		Ticket:     valeur,
		Expiration: expiration.Format(time.RFC3339),
	})
}
