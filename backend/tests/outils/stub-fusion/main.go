// Outil de recette : doublure locale de MoneyFusion.
//
// MoneyFusion n'a ni bac à sable ni clés de test — l'URL d'API du marchand EST le
// secret, et créer un vrai paiement demande un compte marchand. Sans doublure, le
// parcours de dépôt ne serait jamais exercé de bout en bout : création du paiement,
// webhook, re-vérification `paiementNotif`, crédit du portefeuille, diffusion temps
// réel. Ce programme rejoue exactement les trois surfaces décrites par le skill
// « api_paiement_skill_FusionMoney » :
//
//	POST /<n'importe quel chemin>   création d'un paiement → {statut, token, url}
//	GET  /paiementNotif/<token>     état constaté → {statut, data{statut, Montant, frais, moyen}}
//	POST /_recette/<token>/<etat>   pilotage de la recette : bascule l'état PUIS
//	                                envoie le webhook au backend (comme le vrai
//	                                prestataire, qui notifie sans rien prouver).
//
// Deux fidélités comptent pour que le test ait un sens :
//   - `data.Montant` est NET des frais ; le backend doit recréditer Montant + frais ;
//   - le webhook ne dit pas la vérité (il annonce un état, le backend doit malgré tout
//     rappeler `paiementNotif`). Le drapeau -webhook-menteur pousse ce point à la
//     caricature en annonçant « paid » alors que l'état reste « pending ».
//
// Usage, depuis le dossier backend :
//
//	go run ./tests/outils/stub-fusion -port 8099
//	# puis, dans le .env du backend :
//	#   FUSIONMONEY_API_URL=http://127.0.0.1:8099/quiperd/paiement
//	#   FUSIONMONEY_CALLBACK_URL=http://127.0.0.1:8080/api/paiements/callback-fusion
//
// Réservé aux recettes : aucun binaire de production ne le référence, et il ne
// touche jamais la base de données.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
)

// transaction est un paiement vu par la doublure : ce que le marchand a demandé,
// et l'état que `paiementNotif` répondra.
type transaction struct {
	Token     string  `json:"token"`
	Reference string  `json:"reference"`
	Total     float64 `json:"total"`
	Numero    string  `json:"numero"`
	Nom       string  `json:"nom"`
	Webhook   string  `json:"webhook"`
	Retour    string  `json:"retour"`
	Statut    string  `json:"statut"` // pending | paid | failure | no paid
	Cree      string  `json:"cree"`
}

// frais : 1 % arrondi à l'unité, comme un opérateur Mobile Money ivoirien. La
// valeur exacte importe peu ; ce qui compte est qu'elle soit NON NULLE, pour que
// la recette détecte un backend qui créditerait le net au lieu du brut.
func (t transaction) frais() float64 { return math.Round(t.Total * 0.01) }

// net est ce que MoneyFusion renvoie dans `data.Montant` : le total moins les frais.
func (t transaction) net() float64 { return t.Total - t.frais() }

var (
	mu             sync.Mutex
	transactions   = map[string]*transaction{}
	compteur       int
	webhookDefaut  string
	webhookMenteur bool
)

func main() {
	port := flag.Int("port", 8099, "port d'écoute de la doublure")
	flag.StringVar(&webhookDefaut, "webhook", "http://127.0.0.1:8080/api/paiements/callback-fusion",
		"URL de webhook utilisée si la création de paiement n'en fournit pas")
	flag.BoolVar(&webhookMenteur, "webhook-menteur", false,
		"annoncer « paid » dans le webhook alors que paiementNotif répond encore « pending »")
	flag.Parse()

	mux := http.NewServeMux()
	mux.HandleFunc("/paiementNotif/", verifier)
	mux.HandleFunc("/_recette/", piloter)
	mux.HandleFunc("/paiement/", pagePaiement)
	mux.HandleFunc("/", creer)

	adresse := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("doublure MoneyFusion sur http://%s (webhook par défaut : %s)", adresse, webhookDefaut)
	log.Printf("  FUSIONMONEY_API_URL=http://%s/quiperd/paiement", adresse)
	serveur := &http.Server{Addr: adresse, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(serveur.ListenAndServe())
}

func ecrire(w http.ResponseWriter, code int, corps any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(corps)
}

// creer répond à l'URL d'API du marchand : un POST JSON, aucune authentification
// (l'URL elle-même est le secret).
func creer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		ecrire(w, http.StatusMethodNotAllowed, map[string]any{"statut": false, "message": "POST attendu"})
		return
	}
	brut, _ := io.ReadAll(r.Body)

	var corps struct {
		TotalPrice   float64 `json:"totalPrice"`
		NumeroSend   string  `json:"numeroSend"`
		NomClient    string  `json:"nomclient"`
		WebhookURL   string  `json:"webhook_url"`
		ReturnURL    string  `json:"return_url"`
		PersonalInfo []struct {
			Reference string `json:"reference"`
		} `json:"personal_Info"`
	}
	if err := json.Unmarshal(brut, &corps); err != nil {
		ecrire(w, http.StatusBadRequest, map[string]any{"statut": false, "message": "corps illisible"})
		return
	}
	if corps.TotalPrice <= 0 {
		ecrire(w, http.StatusBadRequest, map[string]any{"statut": false, "message": "totalPrice manquant"})
		return
	}
	// Le vrai prestataire refuse un paiement sans numéro : la doublure aussi, sinon
	// une régression côté backend (numéro oublié) passerait inaperçue en recette.
	if strings.TrimSpace(corps.NumeroSend) == "" {
		ecrire(w, http.StatusBadRequest, map[string]any{"statut": false, "message": "numeroSend manquant"})
		return
	}

	mu.Lock()
	compteur++
	t := &transaction{
		Token:   fmt.Sprintf("stub-%d-%d", time.Now().Unix(), compteur),
		Total:   corps.TotalPrice,
		Numero:  corps.NumeroSend,
		Nom:     corps.NomClient,
		Webhook: corps.WebhookURL,
		Retour:  corps.ReturnURL,
		Statut:  "pending",
		Cree:    time.Now().Format(time.RFC3339),
	}
	if len(corps.PersonalInfo) > 0 {
		t.Reference = corps.PersonalInfo[0].Reference
	}
	if t.Webhook == "" {
		t.Webhook = webhookDefaut
	}
	transactions[t.Token] = t
	mu.Unlock()

	log.Printf("paiement créé  token=%s ref=%s total=%.0f", t.Token, t.Reference, t.Total)
	ecrire(w, http.StatusOK, map[string]any{
		"statut":  true,
		"token":   t.Token,
		"message": "paiement initié",
		"url":     fmt.Sprintf("http://%s/paiement/%s", r.Host, t.Token),
	})
}

// verifier rejoue `GET /paiementNotif/{token}`. `Montant` est NET des frais.
func verifier(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.URL.Path, "/paiementNotif/")
	mu.Lock()
	t, connu := transactions[token]
	mu.Unlock()
	if !connu {
		// Le vrai service répond 200 avec statut=false sur un token inconnu.
		ecrire(w, http.StatusOK, map[string]any{"statut": false, "message": "token inconnu"})
		return
	}
	ecrire(w, http.StatusOK, map[string]any{
		"statut": true,
		"data": map[string]any{
			"statut":        t.Statut,
			"Montant":       t.net(),
			"frais":         t.frais(),
			"moyen":         "MTN CI",
			"numero":        t.Numero,
			"nomclient":     t.Nom,
			"createdAt":     t.Cree,
			"personal_Info": []map[string]any{{"reference": t.Reference}},
		},
	})
}

// piloter est l'entrée de la recette : `POST /_recette/<token>/<etat>`. Elle
// bascule l'état constaté puis notifie le backend, dans cet ordre — l'inverse
// laisserait le backend vérifier avant que l'état ait changé.
//
// Deux paramètres de requête servent à isoler les règles du skill :
//
//	?annonce=<etat>   ce que le webhook PRÉTEND, indépendamment de l'état constaté ;
//	                  `?annonce=paid` sur une transaction restée « pending » prouve
//	                  qu'un webhook menteur ne crédite rien.
//	?webhook=non      ne notifie pas : seul le polling de secours peut alors conclure.
func piloter(w http.ResponseWriter, r *http.Request) {
	chemin := strings.Trim(strings.TrimPrefix(r.URL.Path, "/_recette/"), "/")
	if chemin == "transactions" {
		mu.Lock()
		liste := make([]transaction, 0, len(transactions))
		for _, t := range transactions {
			liste = append(liste, *t)
		}
		mu.Unlock()
		ecrire(w, http.StatusOK, liste)
		return
	}

	parties := strings.Split(chemin, "/")
	if len(parties) != 2 {
		ecrire(w, http.StatusBadRequest, map[string]any{"erreur": "POST /_recette/<token>/<pending|paid|failure>"})
		return
	}
	token, etat := parties[0], parties[1]
	switch etat {
	case "pending", "paid", "failure", "no paid":
	default:
		ecrire(w, http.StatusBadRequest, map[string]any{"erreur": "état inconnu : " + etat})
		return
	}

	mu.Lock()
	t, connu := transactions[token]
	if connu {
		t.Statut = etat
	}
	mu.Unlock()
	if !connu {
		ecrire(w, http.StatusNotFound, map[string]any{"erreur": "token inconnu"})
		return
	}

	code, reponse := 0, "webhook non envoyé"
	if r.URL.Query().Get("webhook") != "non" {
		code, reponse = notifier(t, etat, r.URL.Query().Get("annonce"))
	}
	log.Printf("état %s → %s ; webhook %s (HTTP %d)", token, etat, t.Webhook, code)
	ecrire(w, http.StatusOK, map[string]any{
		"token":          t.Token,
		"reference":      t.Reference,
		"statut":         t.Statut,
		"montantNet":     t.net(),
		"frais":          t.frais(),
		"webhookURL":     t.Webhook,
		"webhookCode":    code,
		"webhookReponse": reponse,
	})
}

// notifier envoie le webhook. Le corps annonce un état — que le backend doit
// ignorer au profit de `paiementNotif`.
func notifier(t *transaction, etat, force string) (int, string) {
	annonce := etat
	if webhookMenteur {
		annonce = "paid"
	}
	if force != "" {
		annonce = force
	}
	corps := map[string]any{
		"event":         "payin.session." + map[string]string{"paid": "completed", "failure": "cancelled"}[etat],
		"personal_Info": []map[string]any{{"reference": t.Reference}},
		"tokenPay":      t.Token,
		"numeroSend":    t.Numero,
		"nomclient":     t.Nom,
		"Montant":       t.net(),
		"frais":         t.frais(),
		"moyen":         "MTN CI",
		"statut":        annonce,
	}
	data, _ := json.Marshal(corps)
	req, err := http.NewRequest(http.MethodPost, t.Webhook, bytes.NewReader(data))
	if err != nil {
		return 0, err.Error()
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err.Error()
	}
	defer resp.Body.Close()
	lu, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(lu)
}

// pagePaiement remplace la page hébergée : la recette n'a pas à la remplir, mais
// ouvrir l'URL renvoyée par le backend doit donner autre chose qu'une erreur.
func pagePaiement(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.URL.Path, "/paiement/")
	mu.Lock()
	t, connu := transactions[token]
	mu.Unlock()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if !connu {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, "<h1>Token inconnu</h1>")
		return
	}
	fmt.Fprintf(w, "<h1>Doublure MoneyFusion</h1><p>Référence %s — %.0f XOF — état <b>%s</b></p>"+
		"<p>Basculer : <code>POST /_recette/%s/paid</code></p>", t.Reference, t.Total, t.Statut, t.Token)
}
