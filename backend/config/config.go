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
	AppPort    string
	AppBaseURL string
	CorsOrigin string

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

	JWTSecret          string
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
		AppPort:    getEnv("APP_PORT", "8080"),
		AppBaseURL: getEnv("APP_BASE_URL", "http://localhost:8080"),
		CorsOrigin: getEnv("CORS_ORIGIN", "http://localhost:3000"),

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
