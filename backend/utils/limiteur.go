package utils

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// RedisLimiteur est le client utilisé par le limiteur. Il est posé au démarrage
// par le paquet `config` : `utils` ne peut pas importer `config` (cycle), et un
// limiteur qui n'aurait pas de client se contenterait de laisser passer.
var RedisLimiteur *redis.Client

// Compteur applique une fenêtre fixe sur une clé et dit si le plafond est franchi.
//
// Fenêtre fixe et non glissante : c'est suffisant pour freiner une attaque par
// force brute (le pire cas est deux fois le plafond à cheval sur deux fenêtres)
// et cela tient en un INCR + EXPIRE, donc en un aller-retour Redis.
//
// **Redis indisponible → on laisse passer.** Un limiteur qui tombe ne doit pas
// fermer la connexion à tout le monde ; l'incident est journalisé.
func Compteur(cle string, max int, fenetre time.Duration) (depasse bool, restantAvantReset time.Duration) {
	if RedisLimiteur == nil {
		return false, 0
	}
	ctx, annuler := context.WithTimeout(context.Background(), 2*time.Second)
	defer annuler()

	n, err := RedisLimiteur.Incr(ctx, cle).Result()
	if err != nil {
		if Log != nil {
			Log.Warn("limiteur : Redis indisponible, requête acceptée", zap.String("cle", cle), zap.Error(err))
		}
		return false, 0
	}
	if n == 1 {
		RedisLimiteur.Expire(ctx, cle, fenetre)
	}
	if n <= int64(max) {
		return false, 0
	}
	ttl, err := RedisLimiteur.TTL(ctx, cle).Result()
	if err != nil || ttl < 0 {
		ttl = fenetre
	}
	return true, ttl
}

// CompteurAtteint lit un compteur SANS l'incrémenter, et dit si le plafond est
// déjà atteint. Sert aux compteurs d'échecs, qui ne doivent monter que sur un
// échec réel : incrémenter à chaque tentative ferait verrouiller un compte au
// moment précis où son propriétaire tape enfin le bon mot de passe.
func CompteurAtteint(cle string, max int) (atteint bool, restantAvantReset time.Duration) {
	if RedisLimiteur == nil {
		return false, 0
	}
	ctx, annuler := context.WithTimeout(context.Background(), 2*time.Second)
	defer annuler()
	n, err := RedisLimiteur.Get(ctx, cle).Int64()
	if err != nil || n < int64(max) {
		return false, 0
	}
	ttl, err := RedisLimiteur.TTL(ctx, cle).Result()
	if err != nil || ttl < 0 {
		ttl = time.Minute
	}
	return true, ttl
}

// Incrementer fait monter un compteur d'échecs et pose sa fenêtre au premier coup.
func Incrementer(cle string, fenetre time.Duration) {
	if RedisLimiteur == nil {
		return
	}
	ctx, annuler := context.WithTimeout(context.Background(), 2*time.Second)
	defer annuler()
	if n, err := RedisLimiteur.Incr(ctx, cle).Result(); err == nil && n == 1 {
		RedisLimiteur.Expire(ctx, cle, fenetre)
	}
}

// TropDeTentatives renvoie la réponse 429 commune aux limiteurs.
func TropDeTentatives(c fiber.Ctx, ttl time.Duration) error {
	secondes := int(ttl.Seconds()) + 1
	c.Set("Retry-After", strconv.Itoa(secondes))
	return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
		"erreur":            "trop de tentatives, réessayez dans un instant",
		"prochainEssaiDans": secondes,
	})
}

// OublierCompteur efface un compteur (une authentification réussie ne doit pas
// laisser derrière elle les échecs qui l'ont précédée).
func OublierCompteur(cle string) {
	if RedisLimiteur == nil {
		return
	}
	ctx, annuler := context.WithTimeout(context.Background(), 2*time.Second)
	defer annuler()
	RedisLimiteur.Del(ctx, cle)
}

// LimiteurIP freine une route sensible par adresse IP.
//
// À réserver aux points d'entrée où l'abus coûte cher : connexion (force brute),
// inscription (création de comptes en masse), mot de passe oublié (inondation de
// courriels vers un tiers). Les routes de lecture n'en ont pas besoin — elles
// sont derrière le reverse proxy et ne déclenchent aucun effet de bord.
func LimiteurIP(nom string, max int, fenetre time.Duration) fiber.Handler {
	return func(c fiber.Ctx) error {
		depasse, ttl := Compteur("limite:"+nom+":"+ClientIP(c), max, fenetre)
		if !depasse {
			return c.Next()
		}
		return TropDeTentatives(c, ttl)
	}
}

// ClientIP renvoie l'adresse du visiteur en tenant compte du reverse proxy.
//
// `X-Forwarded-For` est une liste : le premier élément est le client d'origine,
// les suivants sont les proxys traversés. Sans proxy devant, l'en-tête est
// absent et l'adresse de la connexion fait foi.
func ClientIP(c fiber.Ctx) string {
	if xff := c.Get("X-Forwarded-For"); xff != "" {
		if premier := strings.TrimSpace(strings.Split(xff, ",")[0]); premier != "" {
			return premier
		}
	}
	if reel := c.Get("X-Real-IP"); reel != "" {
		return strings.TrimSpace(reel)
	}
	return c.IP()
}
