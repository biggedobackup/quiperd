package utils

import (
	"bytes"
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Client Firebase Cloud Messaging, API HTTP v1.
//
// L'API v1 n'accepte plus la « clé serveur » de l'ancienne API : chaque appel doit porter un
// jeton OAuth2 obtenu à partir d'un compte de service. Plutôt que de tirer
// `golang.org/x/oauth2/google`, on fait l'échange à la main — c'est une trentaine de lignes et
// le projet signe déjà des JWT avec `golang-jwt`. Une dépendance de moins à auditer et à
// maintenir, sur un chemin qui touche à une clé privée.
//
// Le flux est celui décrit par Google pour les comptes de service : on signe une assertion JWT
// avec la clé privée du compte, on l'échange contre un jeton d'accès valable une heure, et on
// s'en sert comme Bearer. Le jeton est gardé en mémoire jusqu'à son expiration.

const (
	fcmPortee     = "https://www.googleapis.com/auth/firebase.messaging"
	fcmURLJeton   = "https://oauth2.googleapis.com/token"
	fcmURLEnvoi   = "https://fcm.googleapis.com/v1/projects/%s/messages:send"
	fcmDelaiHTTP  = 10 * time.Second
	fcmMargeJeton = 60 * time.Second // on renouvelle un peu avant l'expiration réelle
)

// ErrJetonFCMInvalide : le jeton d'appareil n'est plus valide (application désinstallée,
// données effacées). L'appelant peut s'en servir pour oublier le jeton en base.
var ErrJetonFCMInvalide = errors.New("jeton FCM invalide ou expiré")

type compteServiceFCM struct {
	Type        string `json:"type"`
	ProjectID   string `json:"project_id"`
	PrivateKey  string `json:"private_key"`
	ClientEmail string `json:"client_email"`
	TokenURI    string `json:"token_uri"`
}

type clientFCM struct {
	compte     compteServiceFCM
	cle        *rsa.PrivateKey
	http       *http.Client
	mutex      sync.Mutex
	jeton      string
	expireLe   time.Time
	projectURL string
}

var fcm *clientFCM

// InitialiserFCM charge le compte de service et prépare le client.
//
// Renvoie une erreur si le fichier est absent ou mal formé : au démarrage, l'appelant choisit
// d'échouer ou de continuer sans push. Un démarrage silencieux avec un push muet serait pire —
// on croirait les notifications parties alors qu'elles ne le sont pas.
func InitialiserFCM(cheminCompteService string) error {
	brut, err := os.ReadFile(cheminCompteService)
	if err != nil {
		return fmt.Errorf("compte de service FCM illisible : %w", err)
	}
	var compte compteServiceFCM
	if err := json.Unmarshal(brut, &compte); err != nil {
		return fmt.Errorf("compte de service FCM mal formé : %w", err)
	}
	if compte.ProjectID == "" || compte.ClientEmail == "" || compte.PrivateKey == "" {
		return errors.New("compte de service FCM incomplet : project_id, client_email et private_key sont requis")
	}

	bloc, _ := pem.Decode([]byte(compte.PrivateKey))
	if bloc == nil {
		return errors.New("clé privée du compte de service FCM illisible (PEM attendu)")
	}
	cleAny, err := x509.ParsePKCS8PrivateKey(bloc.Bytes)
	if err != nil {
		return fmt.Errorf("clé privée du compte de service FCM invalide : %w", err)
	}
	cle, ok := cleAny.(*rsa.PrivateKey)
	if !ok {
		return errors.New("clé privée du compte de service FCM : RSA attendu")
	}

	if compte.TokenURI == "" {
		compte.TokenURI = fcmURLJeton
	}
	fcm = &clientFCM{
		compte:     compte,
		cle:        cle,
		http:       &http.Client{Timeout: fcmDelaiHTTP},
		projectURL: fmt.Sprintf(fcmURLEnvoi, compte.ProjectID),
	}
	return nil
}

// ProjetFCM renvoie l'identifiant du projet chargé — utile aux journaux de démarrage.
func ProjetFCM() string {
	if fcm == nil {
		return ""
	}
	return fcm.compte.ProjectID
}

// jetonAcces renvoie un jeton d'accès valide, en le renouvelant si besoin.
func (c *clientFCM) jetonAcces(ctx context.Context) (string, error) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	if c.jeton != "" && time.Now().Before(c.expireLe.Add(-fcmMargeJeton)) {
		return c.jeton, nil
	}

	maintenant := time.Now()
	assertion := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":   c.compte.ClientEmail,
		"scope": fcmPortee,
		"aud":   c.compte.TokenURI,
		"iat":   maintenant.Unix(),
		"exp":   maintenant.Add(time.Hour).Unix(),
	})
	signee, err := assertion.SignedString(c.cle)
	if err != nil {
		return "", fmt.Errorf("signature de l'assertion FCM : %w", err)
	}

	corps := url.Values{
		"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"},
		"assertion":  {signee},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.compte.TokenURI,
		strings.NewReader(corps.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	rep, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("échange du jeton FCM : %w", err)
	}
	defer rep.Body.Close()
	charge, _ := io.ReadAll(io.LimitReader(rep.Body, 1<<16))
	if rep.StatusCode != http.StatusOK {
		return "", fmt.Errorf("échange du jeton FCM refusé (%d) : %s", rep.StatusCode, tronquer(charge, 200))
	}

	var reponse struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(charge, &reponse); err != nil || reponse.AccessToken == "" {
		return "", errors.New("réponse d'échange de jeton FCM inexploitable")
	}
	c.jeton = reponse.AccessToken
	c.expireLe = maintenant.Add(time.Duration(reponse.ExpiresIn) * time.Second)
	return c.jeton, nil
}

// envoyer poste un message à un appareil.
//
// La charge porte `notification` (ce que le système affiche quand l'application est fermée) ET
// `data` (ce que l'application lit pour ouvrir le bon écran). Les deux sont nécessaires : sans
// `notification`, Android n'affiche rien quand l'application dort ; sans `data`, un appui sur la
// bannière ouvre l'accueil au lieu du match concerné.
func (c *clientFCM) envoyer(ctx context.Context, jetonAppareil, titre, message, typ, cible string) error {
	return c.envoyerVers(ctx, "token", jetonAppareil, titre, message, typ, cible)
}

// envoyerCondition diffuse à un ensemble d'appareils décrit par une expression de topics.
//
// C'est ce qui permet d'annoncer un nouveau défi à toute la salle sans parcourir la table des
// jetons : un seul appel HTTP au lieu d'un par joueur. L'expression sert aussi à EXCLURE
// l'auteur du défi, à qui il serait absurde d'annoncer son propre défi.
func (c *clientFCM) envoyerCondition(ctx context.Context, condition, titre, message, typ, cible string) error {
	return c.envoyerVers(ctx, "condition", condition, titre, message, typ, cible)
}

func (c *clientFCM) envoyerVers(ctx context.Context, champDestination, destination, titre, message, typ, cible string) error {
	acces, err := c.jetonAcces(ctx)
	if err != nil {
		return err
	}

	donnees := map[string]string{"type": typ}
	if cible != "" {
		donnees["cible"] = cible
	}
	charge := map[string]any{
		"message": map[string]any{
			champDestination: destination,
			"notification": map[string]string{
				"title": titre,
				"body":  message,
			},
			"data": donnees,
			"android": map[string]any{
				"priority": "high",
				"notification": map[string]any{
					"channel_id": "defis_en_ligne_defaut",
					"sound":      "default",
				},
			},
			"apns": map[string]any{
				"payload": map[string]any{
					"aps": map[string]any{"sound": "default"},
				},
			},
		},
	}
	corps, err := json.Marshal(charge)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.projectURL, bytes.NewReader(corps))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+acces)
	req.Header.Set("Content-Type", "application/json")

	rep, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("envoi FCM : %w", err)
	}
	defer rep.Body.Close()
	reponse, _ := io.ReadAll(io.LimitReader(rep.Body, 1<<16))
	switch {
	case rep.StatusCode == http.StatusOK:
		return nil
	// 404 UNREGISTERED : l'application a été désinstallée, l'appareil ne recevra plus rien.
	case rep.StatusCode == http.StatusNotFound:
		return ErrJetonFCMInvalide

	// 400 INVALID_ARGUMENT : à ne traduire en « jeton mort » QUE si Google désigne le champ du
	// jeton. Un 400 peut aussi venir d'une charge mal formée de notre côté ; oublier le jeton
	// dans ce cas ferait taire les notifications de tout le monde sans que rien ne le signale.
	case rep.StatusCode == http.StatusBadRequest &&
		(bytes.Contains(reponse, []byte("registration-token-not-registered")) ||
			bytes.Contains(reponse, []byte(`"message.token"`))):
		return ErrJetonFCMInvalide
	default:
		return fmt.Errorf("envoi FCM refusé (%d) : %s", rep.StatusCode, tronquer(reponse, 300))
	}
}

func tronquer(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
