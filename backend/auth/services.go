package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"quiperd/backend/config"
)

// Rôles portés par le jeton.
const (
	RoleJoueur = "joueur"
	RoleAdmin  = "admin"
)

var ErrJetonInvalide = errors.New("jeton invalide ou session expirée")

// Claims du JWT QUI PERD.
type Claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

func clePrefixeSession(jti string) string { return "session:" + jti }
func cleSessionsUtilisateur(id string) string { return "sessions:utilisateur:" + id }

// HacherMotDePasse renvoie le hash bcrypt d'un mot de passe.
func HacherMotDePasse(mdp string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(mdp), bcrypt.DefaultCost)
	return string(h), err
}

// VerifierMotDePasse compare un mot de passe clair à son hash.
func VerifierMotDePasse(hash, mdp string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(mdp)) == nil
}

// ErrIdentifiantsPris : nom d'utilisateur ou e-mail déjà porté par un autre compte (→ 409).
var ErrIdentifiantsPris = errors.New("nom d'utilisateur ou email déjà utilisé")

// EntreeInscription est le corps de POST /auth/inscription. La création d'un compte par
// un administrateur (POST /utilisateurs) réutilise exactement ces règles de validation.
type EntreeInscription struct {
	NomUtilisateur string `json:"nomUtilisateur" validate:"required,min=3,max=50"`
	Email          string `json:"email" validate:"required,email"`
	MotDePasse     string `json:"motDePasse" validate:"required,min=6"`
	Telephone      string `json:"telephone"`
	Pays           string `json:"pays"`
}

// CreerUtilisateur hache le mot de passe et insère le joueur dans la transaction fournie
// (e-mail normalisé en minuscules, statut `actif` par défaut). Aucun jeton ni session
// n'est émis : l'inscription publique et la création par un administrateur partagent ce
// service, seul le contrôleur d'inscription ouvre ensuite une session.
func CreerUtilisateur(tx *gorm.DB, in EntreeInscription, statut string) (*Utilisateur, error) {
	if statut == "" {
		statut = StatutActif
	}
	email := strings.ToLower(in.Email)
	var n int64
	if err := tx.Model(&Utilisateur{}).
		Where("nom_utilisateur = ? OR email = ?", in.NomUtilisateur, email).Count(&n).Error; err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, ErrIdentifiantsPris
	}
	hash, err := HacherMotDePasse(in.MotDePasse)
	if err != nil {
		return nil, err
	}
	u := Utilisateur{
		NomUtilisateur: in.NomUtilisateur, Email: email, Telephone: in.Telephone,
		Pays: in.Pays, MotDePasse: hash, Statut: statut,
	}
	if err := tx.Create(&u).Error; err != nil {
		// Deux créations simultanées : l'index unique tranche, même réponse 409.
		return nil, ErrIdentifiantsPris
	}
	return &u, nil
}

// GenererJeton crée un JWT HS256 et enregistre son jti dans Redis (liste blanche).
func GenererJeton(sujet uuid.UUID, role string) (jeton string, jti string, expiration time.Time, err error) {
	cfg := config.Cfg
	jti = uuid.NewString()
	expiration = time.Now().UTC().Add(time.Duration(cfg.JWTExpirationHeures) * time.Hour)

	claims := Claims{
		Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   sujet.String(),
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(expiration),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			Issuer:    "qui-perd",
		},
	}

	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	jeton, err = t.SignedString([]byte(cfg.JWTSecret))
	if err != nil {
		return "", "", time.Time{}, err
	}

	// Liste blanche : la session existe tant que la clé Redis existe.
	ttl := time.Until(expiration)
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	if err := config.Redis.Set(ctx, clePrefixeSession(jti), sujet.String()+"|"+role, ttl).Err(); err != nil {
		return "", "", time.Time{}, fmt.Errorf("enregistrement session: %w", err)
	}
	// Index inverse : permet d'invalider toutes les sessions d'un utilisateur (suspension).
	cleSet := cleSessionsUtilisateur(sujet.String())
	config.Redis.SAdd(ctx, cleSet, jti)
	config.Redis.Expire(ctx, cleSet, ttl)
	return jeton, jti, expiration, nil
}

// HashJeton renvoie l'empreinte SHA-256 (hex) d'un jti, stockée dans
// sessions_utilisateurs.jeton_hash — le jeton lui-même n'est jamais persisté.
func HashJeton(jti string) string {
	h := sha256.Sum256([]byte(jti))
	return hex.EncodeToString(h[:])
}

// InvaliderToutesSessions supprime toutes les sessions actives d'un utilisateur
// (suspension de compte, réinitialisation du mot de passe) : liste blanche Redis
// et lignes sessions_utilisateurs.
func InvaliderToutesSessions(id uuid.UUID) error {
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	config.DB.Where("utilisateur_id = ?", id).Delete(&SessionUtilisateur{})
	cleSet := cleSessionsUtilisateur(id.String())
	jtis, err := config.Redis.SMembers(ctx, cleSet).Result()
	if err != nil {
		return err
	}
	for _, jti := range jtis {
		config.Redis.Del(ctx, clePrefixeSession(jti))
	}
	return config.Redis.Del(ctx, cleSet).Err()
}

// ValiderJeton vérifie la signature, l'expiration et la présence du jti dans Redis.
func ValiderJeton(jetonStr string) (*Claims, error) {
	cfg := config.Cfg
	claims := &Claims{}
	t, err := jwt.ParseWithClaims(jetonStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrJetonInvalide
		}
		return []byte(cfg.JWTSecret), nil
	})
	if err != nil || !t.Valid {
		return nil, ErrJetonInvalide
	}

	// Vérifier la liste blanche Redis (déconnexion réelle).
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	if n, err := config.Redis.Exists(ctx, clePrefixeSession(claims.ID)).Result(); err != nil || n == 0 {
		return nil, ErrJetonInvalide
	}
	return claims, nil
}

// InvaliderSession supprime le jti de Redis (déconnexion).
func InvaliderSession(jti string) error {
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	return config.Redis.Del(ctx, clePrefixeSession(jti)).Err()
}

// TrouverUtilisateur charge un joueur par id.
func TrouverUtilisateur(id uuid.UUID) (*Utilisateur, error) {
	var u Utilisateur
	if err := config.DB.First(&u, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

// TrouverAdministrateur charge un administrateur par id.
func TrouverAdministrateur(id uuid.UUID) (*Administrateur, error) {
	var a Administrateur
	if err := config.DB.First(&a, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &a, nil
}
