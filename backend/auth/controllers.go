package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"quiperd/backend/administration"
	"quiperd/backend/config"
	"quiperd/backend/utils"
	"go.uber.org/zap"
)

// Inscription godoc
// @Summary Créer un compte joueur
// @Tags auth
// @Param corps body EntreeInscription true "Compte à créer"
// @Router /auth/inscription [post]
func Inscription(c fiber.Ctx) error {
	var in EntreeInscription
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	u, err := CreerUtilisateur(config.DB, in, StatutActif)
	if errors.Is(err, ErrIdentifiantsPris) {
		return utils.Erreur(c, fiber.StatusConflict, "nom d'utilisateur ou email déjà utilisé")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "création impossible")
	}
	jeton, jti, exp, err := GenererJeton(u.ID, RoleJoueur)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "génération de session impossible")
	}
	enregistrerSession(c, u.ID, jti, exp)
	return utils.OK(c, fiber.Map{"utilisateur": u, "jeton": jeton, "expiration": exp}, fiber.StatusCreated)
}

// enregistrerSession trace la connexion d'un joueur dans sessions_utilisateurs
// (appareil, adresse IP, expiration — table 18). Le jeton n'est jamais stocké en
// clair : seule l'empreinte SHA-256 de son jti est conservée.
func enregistrerSession(c fiber.Ctx, userID uuid.UUID, jti string, exp time.Time) {
	appareil := c.Get("User-Agent")
	if len(appareil) > 255 {
		appareil = appareil[:255]
	}
	s := SessionUtilisateur{
		UtilisateurID: userID, JetonHash: HashJeton(jti), Appareil: appareil, DateExpiration: exp,
	}
	if ip := c.IP(); ip != "" {
		s.AdresseIP = &ip
	}
	_ = config.DB.Create(&s).Error
}

type entreeConnexion struct {
	Email      string `json:"email" validate:"required"`
	MotDePasse string `json:"motDePasse" validate:"required"`
}

// Connexion godoc
// @Summary Connexion joueur
// @Tags auth
// @Router /auth/connexion [post]
func Connexion(c fiber.Ctx) error {
	var in entreeConnexion
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	var u Utilisateur
	err := config.DB.Where("email = ? OR nom_utilisateur = ?", strings.ToLower(in.Email), in.Email).First(&u).Error
	if err != nil || !VerifierMotDePasse(u.MotDePasse, in.MotDePasse) {
		journaliserEchec(c, in.Email, "joueur")
		return utils.Erreur(c, fiber.StatusUnauthorized, "identifiants invalides")
	}
	if u.Statut == StatutSuspendu {
		return utils.Erreur(c, fiber.StatusForbidden, "compte suspendu")
	}
	if u.Statut == StatutSupprime {
		return utils.Erreur(c, fiber.StatusForbidden, "compte supprimé")
	}
	jeton, jti, exp, err := GenererJeton(u.ID, RoleJoueur)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "génération de session impossible")
	}
	enregistrerSession(c, u.ID, jti, exp)
	return utils.OK(c, fiber.Map{"utilisateur": u, "jeton": jeton, "expiration": exp})
}

// ConnexionAdmin godoc
// @Summary Connexion administrateur
// @Tags auth
// @Router /auth/admin/connexion [post]
func ConnexionAdmin(c fiber.Ctx) error {
	var in entreeConnexion
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	var a Administrateur
	err := config.DB.Where("email = ?", strings.ToLower(in.Email)).First(&a).Error
	if err != nil || !VerifierMotDePasse(a.MotDePasse, in.MotDePasse) {
		journaliserEchec(c, in.Email, "admin")
		return utils.Erreur(c, fiber.StatusUnauthorized, "identifiants invalides")
	}
	if a.Statut == StatutSuspendu {
		return utils.Erreur(c, fiber.StatusForbidden, "compte suspendu")
	}
	jeton, _, exp, err := GenererJeton(a.ID, RoleAdmin)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "génération de session impossible")
	}
	return utils.OK(c, fiber.Map{"administrateur": a, "jeton": jeton, "expiration": exp})
}

// Deconnexion godoc
// @Summary Déconnexion (invalide la session Redis)
// @Tags auth
// @Security BearerAuth
// @Router /auth/deconnexion [post]
func Deconnexion(c fiber.Ctx) error {
	if jti := JTIDe(c); jti != "" {
		_ = InvaliderSession(jti)
		config.DB.Where("jeton_hash = ?", HashJeton(jti)).Delete(&SessionUtilisateur{})
	}
	return utils.OK(c, fiber.Map{"deconnecte": true})
}

// Moi godoc
// @Summary Utilisateur ou administrateur courant
// @Tags auth
// @Security BearerAuth
// @Router /auth/moi [get]
func Moi(c fiber.Ctx) error {
	id := UtilisateurIDDe(c)
	if RoleDe(c) == RoleAdmin {
		a, err := TrouverAdministrateur(id)
		if err != nil {
			return utils.Erreur(c, fiber.StatusNotFound, "administrateur introuvable")
		}
		return utils.OK(c, fiber.Map{"administrateur": a, "role": RoleAdmin})
	}
	u, err := TrouverUtilisateur(id)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "utilisateur introuvable")
	}
	return utils.OK(c, fiber.Map{"utilisateur": u, "role": RoleJoueur})
}

type entreeMotDePasseOublie struct {
	Email string `json:"email" validate:"required,email"`
}

// MotDePasseOublie godoc
// @Summary Demande de réinitialisation de mot de passe
// @Tags auth
// @Router /auth/mot-de-passe-oublie [post]
func MotDePasseOublie(c fiber.Ctx) error {
	var in entreeMotDePasseOublie
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	var u Utilisateur
	// Réponse générique quoi qu'il arrive (pas d'énumération de comptes).
	if err := config.DB.Where("email = ?", strings.ToLower(in.Email)).First(&u).Error; err == nil {
		token := uuid.NewString()
		ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
		defer annuler()
		config.Redis.Set(ctx, "reset:"+token, u.ID.String(), time.Hour)
		// Envoi email non configuré en dev : on journalise le lien de réinitialisation.
		if utils.Log != nil {
			utils.Log.Info("réinitialisation mot de passe demandée",
				zap.String("email", u.Email), zap.String("token", token))
		}
	}
	return utils.OK(c, fiber.Map{"message": "Si un compte existe, un lien de réinitialisation a été envoyé."})
}

type entreeReinit struct {
	Token         string `json:"token" validate:"required"`
	NouveauMotDePasse string `json:"nouveauMotDePasse" validate:"required,min=6"`
}

// ReinitialiserMotDePasse godoc
// @Summary Réinitialiser le mot de passe avec un token
// @Tags auth
// @Router /auth/reinitialisation-mot-de-passe [post]
func ReinitialiserMotDePasse(c fiber.Ctx) error {
	var in entreeReinit
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	idStr, err := config.Redis.Get(ctx, "reset:"+in.Token).Result()
	if err != nil || idStr == "" {
		return utils.Erreur(c, fiber.StatusBadRequest, "token invalide ou expiré")
	}
	id, _ := uuid.Parse(idStr)
	hash, err := HacherMotDePasse(in.NouveauMotDePasse)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "réinitialisation impossible")
	}
	if err := config.DB.Model(&Utilisateur{}).Where("id = ?", id).Update("mot_de_passe", hash).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "réinitialisation impossible")
	}
	config.Redis.Del(ctx, "reset:"+in.Token)
	_ = InvaliderToutesSessions(id)
	return utils.OK(c, fiber.Map{"message": "Mot de passe réinitialisé."})
}

type entreeChangement struct {
	MotDePasseActuel  string `json:"motDePasseActuel" validate:"required"`
	NouveauMotDePasse string `json:"nouveauMotDePasse" validate:"required,min=6"`
}

// ChangerMotDePasse godoc
// @Summary Changer son mot de passe
// @Tags auth
// @Security BearerAuth
// @Router /auth/changer-mot-de-passe [post]
func ChangerMotDePasse(c fiber.Ctx) error {
	id := UtilisateurIDDe(c)
	var in entreeChangement
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}

	if RoleDe(c) == RoleAdmin {
		a, err := TrouverAdministrateur(id)
		if err != nil || !VerifierMotDePasse(a.MotDePasse, in.MotDePasseActuel) {
			return utils.Erreur(c, fiber.StatusUnauthorized, "mot de passe actuel incorrect")
		}
		hash, _ := HacherMotDePasse(in.NouveauMotDePasse)
		config.DB.Model(&Administrateur{}).Where("id = ?", id).Update("mot_de_passe", hash)
	} else {
		u, err := TrouverUtilisateur(id)
		if err != nil || !VerifierMotDePasse(u.MotDePasse, in.MotDePasseActuel) {
			return utils.Erreur(c, fiber.StatusUnauthorized, "mot de passe actuel incorrect")
		}
		hash, _ := HacherMotDePasse(in.NouveauMotDePasse)
		config.DB.Model(&Utilisateur{}).Where("id = ?", id).Update("mot_de_passe", hash)
	}
	return utils.OK(c, fiber.Map{"message": "Mot de passe modifié."})
}

func journaliserEchec(c fiber.Ctx, email, typ string) {
	ip := c.IP()
	administration.Journaliser(config.DB, administration.ParamsAudit{
		Action: "connexion:echec_" + typ, TableCible: "auth",
		Nouvelle: map[string]any{"email": email}, AdresseIP: ip,
	})
}
