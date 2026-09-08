package config

import (
	"strings"
	"testing"
)

// baseProduction : une configuration de production par ailleurs saine, pour n'éprouver qu'un
// réglage à la fois.
func baseProduction() *Config {
	return &Config{
		AppEnv:              "production",
		JWTSecret:           strings.Repeat("s", 48),
		SeedAdminMotDePasse: "UnMotDePasseChoisi1!",
		CorsOrigin:          "https://quiperd.ouesergegedeon.com",
	}
}

func contient(manques []string, extrait string) bool {
	for _, m := range manques {
		if strings.Contains(m, extrait) {
			return true
		}
	}
	return false
}

// TestVerifierProductionAdresseLocale couvre la panne réelle de septembre 2026 : la production
// tournait avec `CORS_ORIGIN=http://127.0.0.1:8082`. Le contrôle ne cherchait que le mot
// « localhost », si bien que cette valeur passait — et le joueur qui payait était renvoyé vers
// une adresse morte après le paiement.
func TestVerifierProductionAdresseLocale(t *testing.T) {
	cas := []struct {
		origine string
		refuse  bool
	}{
		{"https://quiperd.ouesergegedeon.com", false},
		{"http://localhost:3000", true},
		{"http://127.0.0.1:8082", true},
		{"http://0.0.0.0:3000", true},
		{"http://[::1]:3000", true},
		{"", true},
	}
	for _, c := range cas {
		cfg := baseProduction()
		cfg.CorsOrigin = c.origine
		manques := cfg.VerifierProduction()
		refuse := contient(manques, "CORS_ORIGIN")
		if refuse != c.refuse {
			t.Errorf("CORS_ORIGIN=%q : refus=%v, attendu %v (%v)", c.origine, refuse, c.refuse, manques)
		}
	}
}

// TestVerifierProductionPrestataireAnnonceMaisInutilisable couvre l'autre moitié de la même
// panne : `PAIEMENT_PRESTATAIRES` annonçait fusionmoney alors que `FUSIONMONEY_API_URL` était
// vide. Le serveur démarrait sans rien dire et le joueur lisait « aucun moyen de paiement
// disponible » sans que personne ne sache pourquoi.
func TestVerifierProductionPrestataireAnnonceMaisInutilisable(t *testing.T) {
	cfg := baseProduction()
	cfg.PaiementPrestataires = []string{"fusionmoney"}
	if manques := cfg.VerifierProduction(); !contient(manques, "FUSIONMONEY_API_URL est vide") {
		t.Errorf("un prestataire annoncé sans identifiants doit être refusé, obtenu %v", manques)
	}

	cfg.PaiementPrestataires = []string{"ligdicash"}
	if manques := cfg.VerifierProduction(); !contient(manques, "LIGDICASH_API_KEY") {
		t.Errorf("ligdicash annoncé sans clés doit être refusé, obtenu %v", manques)
	}

	// Non annoncé : ne rien exiger. Ne pas proposer un prestataire est un choix légitime.
	cfg.PaiementPrestataires = nil
	if manques := cfg.VerifierProduction(); len(manques) != 0 {
		t.Errorf("aucun prestataire annoncé : rien à exiger, obtenu %v", manques)
	}
}

// TestVerifierProductionRappelInjoignable : un prestataire correctement identifié mais dont
// l'URL de rappel ne sort pas de la machine. C'est le cas le plus coûteux — le joueur paie
// vraiment, et la confirmation n'arrive jamais.
func TestVerifierProductionRappelInjoignable(t *testing.T) {
	cfg := baseProduction()
	cfg.PaiementPrestataires = []string{"fusionmoney"}
	cfg.FusionMoneyAPIURL = "https://www.pay.moneyfusion.net/App/xxxx/pay/"

	cfg.FusionMoneyCallbackURL = "http://127.0.0.1:8082/api/paiements/callback-fusion"
	if manques := cfg.VerifierProduction(); !contient(manques, "FUSIONMONEY_CALLBACK_URL") {
		t.Errorf("une URL de rappel locale doit être refusée, obtenu %v", manques)
	}

	cfg.FusionMoneyCallbackURL = "https://quiperd.ouesergegedeon.com/api/paiements/callback-fusion"
	if manques := cfg.VerifierProduction(); len(manques) != 0 {
		t.Errorf("configuration complète : rien à signaler, obtenu %v", manques)
	}
}

// TestVerifierProductionIgnoreHorsProduction : en développement, viser localhost est normal.
func TestVerifierProductionIgnoreHorsProduction(t *testing.T) {
	cfg := baseProduction()
	cfg.AppEnv = "development"
	cfg.CorsOrigin = "http://localhost:3000"
	cfg.PaiementPrestataires = []string{"fusionmoney"}
	if manques := cfg.VerifierProduction(); manques != nil {
		t.Errorf("hors production, aucun contrôle ne doit s'appliquer, obtenu %v", manques)
	}
}
