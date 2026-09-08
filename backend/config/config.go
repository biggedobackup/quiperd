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
	// SiteURL est l'adresse publique du site (frontend) utilisée pour fabriquer les
	// liens envoyés par e-mail (réinitialisation de mot de passe). Par défaut :
	// CORS_ORIGIN, seule origine servie par le frontend.
	SiteURL string

	// WSOriginesAutorisees complète CorsOrigin pour l'ouverture du socket temps réel
	// (GET /api/temps-reel). Liste séparée par des virgules, chaque entrée étant une
	// origine complète (« https://defisenligne.example »). Une origine absente des deux
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
	// StockagePhotosDir : dossier des photos de profil. Séparé des preuves, qui ont
	// une durée de vie et des règles d'accès différentes (une preuve appartient à un
	// match et n'est visible que de ses participants et de l'arbitre).
	StockagePhotosDir string
	UploadMaxOctets   int64

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

	// --- Courrier électronique (paquet courriel) ---
	// EmailActif à false : aucun message ne part sur le réseau, il est seulement
	// journalisé (mode développement). Jamais de secret dans les journaux : seuls le
	// destinataire et le sujet sont tracés.
	EmailActif      bool
	EmailExpediteur string
	SMTPHote        string
	SMTPPort        string
	SMTPUtilisateur string
	// SMTPMotDePasse ne doit JAMAIS être journalisé, sérialisé ni recopié ailleurs.
	SMTPMotDePasse string
}

// Cfg est l'instance globale, initialisée par Charger().
var Cfg *Config

// Charger lit le .env (s'il existe) puis construit la configuration.
func Charger() *Config {
	_ = godotenv.Load()

	corsOrigin := getEnv("CORS_ORIGIN", "http://localhost:3000")

	Cfg = &Config{
		AppEnv:     getEnv("APP_ENV", "development"),
		AppHost:    getEnv("APP_HOST", ""),
		AppPort:    getEnv("APP_PORT", "8080"),
		AppBaseURL: getEnv("APP_BASE_URL", "http://localhost:8080"),
		CorsOrigin: corsOrigin,
		SiteURL:    strings.TrimRight(getEnv("SITE_URL", corsOrigin), "/"),

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
		StockagePhotosDir:  getEnv("STOCKAGE_PHOTOS_DIR", "public/photos"),
		UploadMaxOctets:    int64(getEnvInt("UPLOAD_MAX_MO", 50)) * 1024 * 1024,

		SeedAdminNom:        getEnv("SEED_ADMIN_NOM", "Administrateur"),
		SeedAdminEmail:      getEnv("SEED_ADMIN_EMAIL", "admin@defisenligne.local"),
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

		EmailActif:      getEnvBool("EMAIL_ACTIF", false),
		EmailExpediteur: getEnv("EMAIL_EXPEDITEUR", "Défis en Ligne <no-reply@defisenligne.local>"),
		SMTPHote:        getEnv("SMTP_HOTE", ""),
		SMTPPort:        getEnv("SMTP_PORT", "587"),
		SMTPUtilisateur: getEnv("SMTP_UTILISATEUR", ""),
		SMTPMotDePasse:  getEnv("SMTP_MOT_DE_PASSE", ""),
	}
	return Cfg
}

// normaliserFusion applique la leçon du skill FusionMoney : jamais de sous-domaine www.
// (le certificat TLS de www.pay.moneyfusion.net est auto-signé et casse tout client Go strict).
func normaliserFusion(u string) string {
	return strings.Replace(u, "://www.pay.moneyfusion.net", "://pay.moneyfusion.net", 1)
}

// URLRetourPortefeuille fabrique l'adresse où le prestataire renvoie le joueur
// après (ou à l'abandon d') un paiement.
//
// Elle part de SiteURL — l'adresse publique du FRONTEND — et non d'AppBaseURL,
// qui désigne l'API : renvoyer le joueur sur l'API le ferait atterrir sur un 404
// juste après avoir payé. Le chemin est celui de la vraie route du portefeuille.
func (c *Config) URLRetourPortefeuille(requete string) string {
	base := strings.TrimRight(c.SiteURL, "/") + "/joueur/portefeuille"
	if requete == "" {
		return base
	}
	return base + "?" + requete
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

// Valeurs par défaut de développement qui seraient des portes ouvertes en production.
const (
	JWTSecretParDefaut    = "secret-dev-non-securise-a-changer"
	AdminMotDePasseDefaut = "Admin1234!"
	// longueurMinimaleSecret : 32 octets, soit la taille d'une clé HMAC-SHA256.
	longueurMinimaleSecret = 32
)

// VerifierProduction refuse de laisser démarrer une instance de production
// configurée avec les valeurs de développement.
//
// Un JWT_SECRET laissé au défaut signe des jetons que n'importe qui peut
// fabriquer : c'est un contournement complet de l'authentification sur une
// plateforme qui manipule de l'argent réel. Le mot de passe administrateur par
// défaut donne, lui, l'accès à l'arbitrage et aux paiements. Mieux vaut un
// serveur qui refuse de démarrer qu'un serveur ouvert.
func (c *Config) VerifierProduction() []string {
	if !c.EstProduction() {
		return nil
	}
	var manques []string
	if c.JWTSecret == JWTSecretParDefaut {
		manques = append(manques, "JWT_SECRET est resté à la valeur de développement")
	}
	if len(c.JWTSecret) < longueurMinimaleSecret {
		manques = append(manques, "JWT_SECRET fait moins de 32 caractères")
	}
	if c.SeedAdminMotDePasse == AdminMotDePasseDefaut {
		manques = append(manques, "SEED_ADMIN_MOTDEPASSE est resté à la valeur de développement")
	}
	if c.CorsOrigin == "" || estAdresseLocale(c.CorsOrigin) {
		manques = append(manques, "CORS_ORIGIN pointe encore une adresse locale")
	}
	if strings.Contains(strings.Join(c.WSOriginesAutorisees, ","), "*") {
		manques = append(manques, "WS_ORIGINES_AUTORISEES contient « * » (socket ouvert à toute origine)")
	}

	// Paiements. Un prestataire ANNONCÉ mais inutilisable est le pire des deux mondes : le
	// serveur démarre, le joueur ouvre la modale de dépôt, et se heurte à « aucun moyen de
	// paiement disponible » sans que rien n'ait signalé quoi que ce soit — ou pire, il paie et
	// la confirmation n'arrive jamais parce que l'URL de rappel est injoignable depuis
	// l'extérieur. Les deux cas se sont produits en production ; ils sont désormais bloquants.
	for _, p := range c.PaiementPrestataires {
		switch strings.ToLower(strings.TrimSpace(p)) {
		case "ligdicash":
			if c.LigdicashAPIKey == "" || c.LigdicashAPIToken == "" {
				manques = append(manques, "PAIEMENT_PRESTATAIRES annonce ligdicash mais LIGDICASH_API_KEY/LIGDICASH_API_TOKEN sont vides")
			} else if estAdresseLocale(c.LigdicashCallbackURL) {
				manques = append(manques, "LIGDICASH_CALLBACK_URL pointe une adresse locale : le prestataire ne pourra jamais confirmer un dépôt")
			}
		case "fusionmoney":
			if c.FusionMoneyAPIURL == "" {
				manques = append(manques, "PAIEMENT_PRESTATAIRES annonce fusionmoney mais FUSIONMONEY_API_URL est vide")
			} else if estAdresseLocale(c.FusionMoneyCallbackURL) {
				manques = append(manques, "FUSIONMONEY_CALLBACK_URL pointe une adresse locale : le prestataire ne pourra jamais confirmer un dépôt")
			}
		}
	}
	return manques
}

// estAdresseLocale reconnaît une adresse qui ne sort pas de la machine.
//
// Chercher le seul mot « localhost » ne suffisait pas : la production tournait avec
// `http://127.0.0.1:8082`, qui passait le contrôle sans encombre et cassait à la fois l'adresse
// de retour du joueur après paiement et l'URL de rappel du prestataire.
func estAdresseLocale(adresse string) bool {
	a := strings.ToLower(strings.TrimSpace(adresse))
	if a == "" {
		return false
	}
	for _, motif := range []string{"localhost", "127.0.0.1", "0.0.0.0", "[::1]", "10.0.2.2"} {
		if strings.Contains(a, motif) {
			return true
		}
	}
	return false
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
