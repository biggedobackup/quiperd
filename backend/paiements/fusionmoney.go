package paiements

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"quiperd/backend/config"
)

// CreerPaiementFusion crée un paiement MoneyFusion et renvoie l'URL hébergée + le token.
// numeroSend (téléphone du client) est obligatoire côté MoneyFusion.
func CreerPaiementFusion(p *Paiement, nomClient, numeroSend string) (urlPaiement, token string, err error) {
	cfg := config.Cfg
	if cfg.FusionMoneyAPIURL == "" {
		return "", "", fmt.Errorf("moneyfusion non configuré")
	}
	if numeroSend == "" {
		return "", "", fmt.Errorf("numéro de téléphone requis")
	}
	montant := p.Montant.IntPart()
	corps := map[string]any{
		"totalPrice":    montant,
		"article":       []map[string]any{{"depot": montant}},
		"personal_Info": []map[string]any{{"reference": p.Reference}},
		"numeroSend":    numeroSend,
		"nomclient":     nomClient,
		"return_url":    cfg.AppBaseURL + "/portefeuille?paiement=retour&ref=" + p.Reference,
		"webhook_url":   cfg.FusionMoneyCallbackURL,
	}
	data, _ := json.Marshal(corps)
	req, _ := http.NewRequest(http.MethodPost, cfg.FusionMoneyAPIURL, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := clientHTTP.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	brut, _ := io.ReadAll(resp.Body)

	var out struct {
		Statut  bool   `json:"statut"`
		Token   string `json:"token"`
		Message string `json:"message"`
		URL     string `json:"url"`
	}
	if err := json.Unmarshal(brut, &out); err != nil {
		return "", "", fmt.Errorf("réponse moneyfusion illisible: %s", string(brut))
	}
	if !out.Statut {
		return "", "", fmt.Errorf("moneyfusion refus: %s", out.Message)
	}
	return out.URL, out.Token, nil
}

// VerifierFusion interroge paiementNotif avec le token stocké.
// `Montant` renvoyé est NET des frais (voir skill §3).
func VerifierFusion(token string) (statut string, montant, frais float64, operateur string, err error) {
	base := "https://pay.moneyfusion.net"
	u := base + "/paiementNotif/" + strings.TrimSpace(token)
	resp, err := clientHTTP.Get(u)
	if err != nil {
		return "", 0, 0, "", err
	}
	defer resp.Body.Close()
	brut, _ := io.ReadAll(resp.Body)

	var out struct {
		Statut bool `json:"statut"`
		Data   struct {
			Statut  string  `json:"statut"`
			Montant float64 `json:"Montant"`
			Frais   float64 `json:"frais"`
			Moyen   string  `json:"moyen"`
		} `json:"data"`
	}
	if err := json.Unmarshal(brut, &out); err != nil {
		return "", 0, 0, "", fmt.Errorf("réponse paiementNotif illisible: %s", string(brut))
	}
	return out.Data.Statut, out.Data.Montant, out.Data.Frais, out.Data.Moyen, nil
}
