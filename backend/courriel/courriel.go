// Package courriel envoie les e-mails transactionnels de Défis en Ligne (code de confirmation
// d'inscription, réinitialisation de mot de passe, accusés de retrait).
//
// Règles du paquet :
//   - bibliothèque standard uniquement (`net/smtp`, `crypto/tls`) — aucune dépendance ;
//   - STARTTLS obligatoire (port 587), authentification AUTH LOGIN (`authLogin` ci-dessous), délais bornés ;
//   - EMAIL_ACTIF=false ⇒ rien ne part sur le réseau, le message est seulement journalisé ;
//   - un échec d'envoi ne fait JAMAIS échouer l'action métier : les modules n'appellent
//     jamais Envoyer directement, ils passent par Enfiler (tâche Asynq `courriel:envoi`).
//
// Discipline d'import identique à `jobs` et `tempsreel` : ce paquet ne connaît que
// `config`, `utils` et `jobs`. Aucun module métier n'est importé ici.
package courriel

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"

	"defisenligne/backend/config"
	"defisenligne/backend/utils"
	"go.uber.org/zap"
)

// Délais bornés : un serveur SMTP lent ne doit jamais immobiliser une goroutine du
// worker. La connexion complète (bannière, STARTTLS, AUTH, DATA, QUIT) est couverte
// par une échéance unique posée sur la socket.
const (
	delaiConnexion = 10 * time.Second
	delaiEchange   = 30 * time.Second
)

// ErrAdresseInvalide : destinataire illisible — inutile de réessayer.
var ErrAdresseInvalide = errors.New("adresse de destination invalide")

// Message est un e-mail prêt à partir : un sujet, une version texte brut et une
// version HTML. Les deux versions portent le même contenu (multipart/alternative) :
// un client qui n'affiche pas le HTML reste servi.
type Message struct {
	Sujet string
	Texte string
	HTML  string
}

// authLogin implémente smtp.Auth pour le mécanisme LOGIN (smtp.office365.com /
// Exchange Online refuse AUTH PLAIN par « 504 5.7.4 Unrecognized authentication
// type »). La bibliothèque standard ne fournit que PlainAuth et CRAMMD5Auth : LOGIN
// (le mécanisme qu'utilise un client comme Nodemailer) doit être écrit à la main.
// Rien d'externe — les identifiants transitent en base64 sur le canal déjà chiffré
// par STARTTLS, exactement comme PlainAuth.
type authLogin struct {
	utilisateur string
	motDePasse  string
}

func (a *authLogin) Start(*smtp.ServerInfo) (string, []byte, error) {
	// « AUTH LOGIN <nom d'utilisateur en base64> » : l'identifiant part en réponse
	// initiale, le serveur demande ensuite le mot de passe.
	return "LOGIN", []byte(a.utilisateur), nil
}

func (a *authLogin) Next(_ []byte, more bool) ([]byte, error) {
	if more {
		return []byte(a.motDePasse), nil
	}
	return nil, nil
}

// Actif indique si l'envoi réseau est armé (EMAIL_ACTIF + hôte SMTP renseigné).
func Actif() bool {
	c := config.Cfg
	return c != nil && c.EmailActif && strings.TrimSpace(c.SMTPHote) != ""
}

// domainesNonRoutables liste les suffixes réservés par les RFC 2606 / 6761 : aucune
// boîte n'existe derrière, les envoyer à un relais réel ne produit que des rejets qui
// abîment la réputation de l'expéditeur. Les adresses de recette (`@test.local`) et les
// comptes anonymisés (`@defisenligne.invalid`) tombent ici : le message est journalisé, pas
// envoyé.
var domainesNonRoutables = []string{".test", ".example", ".invalid", ".localhost", ".local"}

// Envoyer transmet un message par SMTP. Renvoie une erreur uniquement pour permettre au
// worker de réessayer : aucun appelant métier ne doit propager cette erreur à l'utilisateur.
func Envoyer(destinataire string, m Message) error {
	adresse, err := mail.ParseAddress(strings.TrimSpace(destinataire))
	if err != nil || adresse.Address == "" {
		return ErrAdresseInvalide
	}
	if m.Sujet == "" {
		return ErrAdresseInvalide
	}

	if nonRoutable(adresse.Address) {
		journaliser("courriel non envoyé : domaine réservé (RFC 2606/6761)", adresse.Address, m.Sujet)
		return nil
	}
	if !Actif() {
		// Mode développement : on trace le destinataire et le sujet, jamais le corps
		// (il contient le code de confirmation ou le lien de réinitialisation).
		journaliser("courriel simulé (EMAIL_ACTIF=false)", adresse.Address, m.Sujet)
		return nil
	}

	corps, err := construireMIME(adresse.Address, m)
	if err != nil {
		return err
	}
	if err := transmettre(adresse.Address, corps); err != nil {
		if utils.Log != nil {
			utils.Log.Warn("envoi de courriel impossible",
				zap.String("destinataire", adresse.Address), zap.String("sujet", m.Sujet), zap.Error(err))
		}
		return err
	}
	journaliser("courriel envoyé", adresse.Address, m.Sujet)
	return nil
}

func journaliser(message, destinataire, sujet string) {
	if utils.Log == nil {
		return
	}
	utils.Log.Info(message, zap.String("destinataire", destinataire), zap.String("sujet", sujet))
}

func nonRoutable(adresse string) bool {
	at := strings.LastIndex(adresse, "@")
	if at < 0 {
		return true
	}
	domaine := strings.ToLower(adresse[at+1:])
	if domaine == "localhost" {
		return true
	}
	for _, suffixe := range domainesNonRoutables {
		if strings.HasSuffix(domaine, suffixe) {
			return true
		}
	}
	return false
}

// transmettre ouvre la session SMTP : connexion bornée, STARTTLS, authentification,
// enveloppe puis données. Chaque étape échoue franchement — jamais de repli en clair.
func transmettre(destinataire string, corps []byte) error {
	cfg := config.Cfg
	hote := strings.TrimSpace(cfg.SMTPHote)
	port := strings.TrimSpace(cfg.SMTPPort)
	if port == "" {
		port = "587"
	}
	expediteur, err := adresseExpediteur()
	if err != nil {
		return err
	}

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(hote, port), delaiConnexion)
	if err != nil {
		return fmt.Errorf("connexion SMTP %s:%s: %w", hote, port, err)
	}
	// Échéance unique sur toute la session : aucune étape ne peut rester bloquée.
	_ = conn.SetDeadline(time.Now().Add(delaiEchange))

	client, err := smtp.NewClient(conn, hote)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("session SMTP: %w", err)
	}
	defer func() { _ = client.Close() }()

	if ok, _ := client.Extension("STARTTLS"); !ok {
		return errors.New("le serveur SMTP n'annonce pas STARTTLS (port 587 attendu)")
	}
	if err := client.StartTLS(&tls.Config{ServerName: hote, MinVersion: tls.VersionTLS12}); err != nil {
		return fmt.Errorf("STARTTLS: %w", err)
	}
	if cfg.SMTPUtilisateur != "" {
		if err := client.Auth(&authLogin{utilisateur: cfg.SMTPUtilisateur, motDePasse: cfg.SMTPMotDePasse}); err != nil {
			return fmt.Errorf("authentification SMTP refusée: %w", err)
		}
	}
	if err := client.Mail(expediteur); err != nil {
		return fmt.Errorf("MAIL FROM: %w", err)
	}
	if err := client.Rcpt(destinataire); err != nil {
		return fmt.Errorf("RCPT TO: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA: %w", err)
	}
	if _, err := w.Write(corps); err != nil {
		_ = w.Close()
		return fmt.Errorf("écriture du corps: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("fin du corps: %w", err)
	}
	return client.Quit()
}

// adresseExpediteur extrait l'adresse nue de EMAIL_EXPEDITEUR (« Défis en Ligne <no-reply@… > »)
// pour l'enveloppe SMTP ; l'en-tête From garde le nom d'affichage.
func adresseExpediteur() (string, error) {
	a, err := mail.ParseAddress(strings.TrimSpace(config.Cfg.EmailExpediteur))
	if err != nil {
		return "", fmt.Errorf("EMAIL_EXPEDITEUR illisible: %w", err)
	}
	return a.Address, nil
}

// construireMIME assemble un message multipart/alternative (texte brut + HTML), corps
// encodés en base64 : aucun souci de ligne trop longue ni de caractère accentué.
func construireMIME(destinataire string, m Message) ([]byte, error) {
	de, err := mail.ParseAddress(strings.TrimSpace(config.Cfg.EmailExpediteur))
	if err != nil {
		return nil, fmt.Errorf("EMAIL_EXPEDITEUR illisible: %w", err)
	}
	frontiere, err := frontiereAleatoire()
	if err != nil {
		return nil, err
	}
	domaine := de.Address
	if at := strings.LastIndex(domaine, "@"); at >= 0 {
		domaine = domaine[at+1:]
	}
	identifiant, err := frontiereAleatoire()
	if err != nil {
		return nil, err
	}

	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", (&mail.Address{Name: de.Name, Address: de.Address}).String())
	fmt.Fprintf(&b, "To: %s\r\n", (&mail.Address{Address: destinataire}).String())
	fmt.Fprintf(&b, "Subject: %s\r\n", mime.QEncoding.Encode("UTF-8", m.Sujet))
	fmt.Fprintf(&b, "Date: %s\r\n", time.Now().UTC().Format(time.RFC1123Z))
	fmt.Fprintf(&b, "Message-ID: <%s@%s>\r\n", identifiant, domaine)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Auto-Submitted: auto-generated\r\n")
	fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", frontiere)

	fmt.Fprintf(&b, "--%s\r\n", frontiere)
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(base64Lignes(m.Texte))

	fmt.Fprintf(&b, "--%s\r\n", frontiere)
	b.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(base64Lignes(m.HTML))

	fmt.Fprintf(&b, "--%s--\r\n", frontiere)
	return []byte(b.String()), nil
}

func frontiereAleatoire() (string, error) {
	brut := make([]byte, 16)
	if _, err := rand.Read(brut); err != nil {
		return "", err
	}
	return hex.EncodeToString(brut), nil
}

// base64Lignes encode en base64 découpé à 76 caractères (limite RFC 2045).
func base64Lignes(s string) string {
	encode := base64.StdEncoding.EncodeToString([]byte(s))
	var b strings.Builder
	for len(encode) > 76 {
		b.WriteString(encode[:76])
		b.WriteString("\r\n")
		encode = encode[76:]
	}
	b.WriteString(encode)
	b.WriteString("\r\n")
	return b.String()
}
