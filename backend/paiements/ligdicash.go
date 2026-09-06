package paiements

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"quiperd/backend/config"
)

// clientHTTP partagé (timeouts stricts).
var clientHTTP = &http.Client{Timeout: 20 * time.Second}

// CreerFactureLigdicash crée une facture avec redirection et renvoie l'URL de
// paiement hébergée + le token à stocker pour la vérification (confirm).
// Fidèle au skill LigdiCash : `unit_price` obligatoire, en-têtes Apikey + Bearer.
func CreerFactureLigdicash(p *Paiement, nomClient, email string) (urlPaiement, token string, err error) {
	cfg := config.Cfg
	if cfg.LigdicashAPIKey == "" || cfg.LigdicashAPIToken == "" {
		return "", "", fmt.Errorf("ligdicash non configuré")
	}
	montant := p.Montant.IntPart()
	corps := map[string]any{
		"commande": map[string]any{
			"invoice": map[string]any{
				"items": []map[string]any{{
					"name":        "Dépôt QUI PERD",
					"unit_price":  montant,
					"total_price": montant,
					"price":       montant,
					"quantity":    1,
				}},
				"total_amount":       montant,
				"devise":             "XOF",
				"description":        "Dépôt sur le portefeuille QUI PERD",
				"customer":           "",
				"customer_firstname": nomClient,
				"customer_lastname":  "",
				"customer_email":     email,
			},
			"store": map[string]any{"name": "QUI PERD", "website_url": cfg.AppBaseURL},
			"actions": map[string]any{
				"cancel_url":   cfg.AppBaseURL + "/portefeuille?paiement=annule",
				"return_url":   cfg.AppBaseURL + "/portefeuille?paiement=retour&ref=" + p.Reference,
				"callback_url": cfg.LigdicashCallbackURL,
			},
			"custom_data": map[string]any{"transaction_id": p.ID.String()},
		},
	}
	data, _ := json.Marshal(corps)
	req, _ := http.NewRequest(http.MethodPost, cfg.LigdicashBaseURL+"/redirect/checkout-invoice/create", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Apikey", cfg.LigdicashAPIKey)
	req.Header.Set("Authorization", "Bearer "+cfg.LigdicashAPIToken)

	resp, err := clientHTTP.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	brut, _ := io.ReadAll(resp.Body)

	var out struct {
		ResponseCode        string `json:"response_code"`
		Token               string `json:"token"`
		ResponseText        string `json:"response_text"`
		ResponseTextDetails string `json:"response_text_details"`
	}
	if err := json.Unmarshal(brut, &out); err != nil {
		return "", "", fmt.Errorf("réponse ligdicash illisible: %s", string(brut))
	}
	if out.ResponseCode != "00" {
		// Journalisé côté serveur ; message générique renvoyé au client par l'appelant.
		return "", "", fmt.Errorf("ligdicash refus (%s): %s", out.ResponseCode, out.ResponseTextDetails)
	}
	return out.ResponseText, out.Token, nil
}

// ConfirmerLigdicash interroge l'état réel d'une facture avec le token stocké.
func ConfirmerLigdicash(token string) (statut string, montant float64, operateur string, err error) {
	cfg := config.Cfg
	u := fmt.Sprintf("%s/redirect/checkout-invoice/confirm/?invoiceToken=%s",
		cfg.LigdicashBaseURL, url.QueryEscape(token))
	req, _ := http.NewRequest(http.MethodGet, u, nil)
	req.Header.Set("Apikey", cfg.LigdicashAPIKey)
	req.Header.Set("Authorization", "Bearer "+cfg.LigdicashAPIToken)

	resp, err := clientHTTP.Do(req)
	if err != nil {
		return "", 0, "", err
	}
	defer resp.Body.Close()
	brut, _ := io.ReadAll(resp.Body)

	var out struct {
		Status       string  `json:"status"`
		ResponseCode string  `json:"responseCode"`
		Amount       float64 `json:"amount"`
		OperatorName string  `json:"operatorName"`
		OperatorID   string  `json:"operatorId"`
	}
	if err := json.Unmarshal(brut, &out); err != nil {
		return "", 0, "", fmt.Errorf("réponse confirm illisible: %s", string(brut))
	}
	op := out.OperatorName
	if op == "" {
		op = out.OperatorID
	}
	return out.Status, out.Amount, op, nil
}
