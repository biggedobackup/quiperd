package config

import (
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config regroupe toute la configuration lue depuis l'environnement (.env).
type Config struct {
	AppEnv     string
	AppHost    string
	AppPort    string
	AppBaseURL string
	CorsOrigin string

	// WSOriginesAutorisees complète CorsOrigin pour l'ouverture du socket temps réel
	// (GET /api/temps-reel). Liste séparée par des virgules, chaque entrée étant une
	// origine complète (« https://quiperd.example »). Une origine absente des deux
	// listes est refusée à la poignée de main : c'est la protection contre le
	// détournement de socket inter-site (CSWSH). La valeur `*` désactive le contrôle
	// et n'est tolérable qu'en développement.
	WSOriginesAutorisees []string
	// WSTicketTTLSecondes est la durée de vie du ticket d'ouverture de socket
	// (clé Redis `ws:ticket:<valeur>`), consommé une seule fois. 60 s par défaut.
	WSTicketTTLSecondes int

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string
	DBTimeZone string

	RedisAddr     string
	RedisPassword string
	RedisDB       int

	JWTSecret           string
	JWTExpirationHeures int

	StockagePreuvesDir string
	UploadMaxOctets    int64

	SeedAdminNom        string
	SeedAdminEmail      string
	SeedAdminMotDePasse string

	LigdicashAPIKey      string
	LigdicashAPIToken    string
	LigdicashBaseURL     string
	LigdicashCallbackURL string

	FusionMoneyAPIURL      string
	FusionMoneyCallbackURL string

	PaiementPrestataires []string

	FCMActif           bool
	FCMCredentialsFile string
}

// Cfg est l'instance globale, initialisée par Charger().
var Cfg *Config

// Charger lit le .env (s'il existe) puis construit la configuration.
func Charger() *Config {
	_ = godotenv.Load()

	Cfg = &Config{
		AppEnv:     getEnv("APP_ENV", "development"),
		AppHost:    getEnv("APP_HOST", ""),
		AppPort:    getEnv("APP_PORT", "8080"),
		AppBaseURL: getEnv("APP_BASE_URL", "http://localhost:8080"),
		CorsOrigin: getEnv("CORS_ORIGIN", "http://localhost:3000"),

		WSOriginesAutorisees: splitCSV(getEnv("WS_ORIGINES_AUTORISEES", "")),
		WSTicketTTLSecondes:  getEnvInt("WS_TICKET_TTL_SECONDES", 60),

		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", ""),
		DBName:     getEnv("DB_NAME", "qui_perd"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),
		DBTimeZone: getEnv("DB_TIMEZONE", "UTC"),

		RedisAddr:     getEnv("REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getEnvInt("REDIS_DB", 0),

		JWTSecret:           getEnv("JWT_SECRET", "secret-dev-non-securise-a-changer"),
		JWTExpirationHeures: getEnvInt("JWT_EXPIRATION_HEURES", 72),

		StockagePreuvesDir: getEnv("STOCKAGE_PREUVES_DIR", "public/preuves"),
		UploadMaxOctets:    int64(getEnvInt("UPLOAD_MAX_MO", 50)) * 1024 * 1024,

		SeedAdminNom:        getEnv("SEED_ADMIN_NOM", "Administrateur"),
		SeedAdminEmail:      getEnv("SEED_ADMIN_EMAIL", "admin@quiperd.local"),
		SeedAdminMotDePasse: getEnv("SEED_ADMIN_MOTDEPASSE", "Admin1234!"),

		LigdicashAPIKey:      getEnv("LIGDICASH_API_KEY", ""),
		LigdicashAPIToken:    getEnv("LIGDICASH_API_TOKEN", ""),
		LigdicashBaseURL:     getEnv("LIGDICASH_BASE_URL", "https://app.ligdicash.com/pay/v01"),
		LigdicashCallbackURL: getEnv("LIGDICASH_CALLBACK_URL", "http://localhost:8080/api/paiements/callback-ligdicash"),

		FusionMoneyAPIURL:      normaliserFusion(getEnv("FUSIONMONEY_API_URL", "")),
		FusionMoneyCallbackURL: getEnv("FUSIONMONEY_CALLBACK_URL", "http://localhost:8080/api/paiements/callback-fusion"),

		PaiementPrestataires: splitCSV(getEnv("PAIEMENT_PRESTATAIRES", "ligdicash,fusionmoney")),

		FCMActif:           getEnvBool("FCM_ACTIF", false),
		FCMCredentialsFile: getEnv("FCM_CREDENTIALS_FILE", ""),
	}
	return Cfg
}

// normaliserFusion applique la leçon du skill FusionMoney : jamais de sous-domaine www.
// (le certificat TLS de www.pay.moneyfusion.net est auto-signé et casse tout client Go strict).
func normaliserFusion(u string) string {
	return strings.Replace(u, "://www.pay.moneyfusion.net", "://pay.moneyfusion.net", 1)
}

func (c *Config) EstProduction() bool {
	return c.AppEnv == "production"
}

// OriginesWebSocket construit la liste blanche des origines admises à ouvrir le
// socket temps réel : l'origine du frontend (CORS_ORIGIN) plus les origines
// supplémentaires de WS_ORIGINES_AUTORISEES. Les entrées sont normalisées en
// minuscules et sans barre oblique finale pour être comparées telles quelles à
// l'en-tête `Origin` de la requête d'upgrade.
func (c *Config) OriginesWebSocket() []string {
	brutes := append([]string{c.CorsOrigin}, c.WSOriginesAutorisees...)
	vues := make(map[string]struct{}, len(brutes))
	out := make([]string, 0, len(brutes))
	for _, o := range brutes {
		n := strings.TrimRight(strings.ToLower(strings.TrimSpace(o)), "/")
		if n == "" {
			continue
		}
		if _, deja := vues[n]; deja {
			continue
		}
		vues[n] = struct{}{}
		out = append(out, n)
	}
	return out
}

func (c *Config) PrestataireActif(nom string) bool {
	for _, p := range c.PaiementPrestataires {
		if strings.EqualFold(strings.TrimSpace(p), nom) {
			return true
		}
	}
	return false
}

func getEnv(cle, defaut string) string {
	if v, ok := os.LookupEnv(cle); ok && v != "" {
		return v
	}
	return defaut
}

func getEnvInt(cle string, defaut int) int {
	if v, ok := os.LookupEnv(cle); ok && v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return defaut
}

func getEnvBool(cle string, defaut bool) bool {
	if v, ok := os.LookupEnv(cle); ok && v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return defaut
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
