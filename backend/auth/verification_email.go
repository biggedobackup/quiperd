package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"fmt"
	"math/big"
	"time"

	"defisenligne/backend/administration"
	"defisenligne/backend/config"
	"defisenligne/backend/courriel"
	"defisenligne/backend/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Confirmation de l'adresse e-mail à l'inscription.
//
// Le code à 6 chiffres ne vit QUE dans Redis et dans le message envoyé au joueur : il
// n'apparaît jamais dans une réponse HTTP ni dans les journaux — sinon le contrôle ne
// prouverait plus que le joueur a bien accès à la boîte.
//
// Clés Redis :
//   - `verif:email:<utilisateurId>`         hachage { code, essais }, TTL 30 min
//   - `verif:email:<utilisateurId>:envoi`   verrou anti-renvoi, TTL 60 s
const (
	// DureeCodeEmail est la durée de vie d'un code de confirmation.
	DureeCodeEmail = 30 * time.Minute
	// EssaisMaxEmail : au 5ᵉ code faux, le code est détruit — il faut en redemander un.
	EssaisMaxEmail = 5
	// DelaiRenvoiEmail : un joueur ne peut pas demander deux codes en moins d'une minute.
	DelaiRenvoiEmail = 60 * time.Second

	champCode   = "code"
	champEssais = "essais"

	// MessageEmailNonConfirme est le refus opposé (403) aux actions qui engagent de
	// l'argent tant que l'adresse n'est pas confirmée. Le dépôt, lui, reste autorisé :
	// faire entrer de l'argent ne présente pas le même risque.
	MessageEmailNonConfirme = "Confirmez votre adresse e-mail avant de miser."
)

// ErrTropDeRenvois : un code a déjà été envoyé il y a moins de DelaiRenvoiEmail.
var ErrTropDeRenvois = errors.New("renvoi trop rapproché")

func cleVerifEmail(id uuid.UUID) string  { return "verif:email:" + id.String() }
func cleRenvoiEmail(id uuid.UUID) string { return "verif:email:" + id.String() + ":envoi" }

func contexteRedis() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 3*time.Second)
}

// genererCodeEmail tire un code à 6 chiffres avec crypto/rand (jamais math/rand : un
// générateur prévisible rendrait le code devinable). Les zéros de tête sont conservés,
// les 10^6 valeurs sont donc équiprobables.
func genererCodeEmail() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// EnvoyerCodeVerification tire un nouveau code, l'enregistre dans Redis (le précédent
// est remplacé, le compteur d'essais repart de zéro) et enfile l'e-mail.
//
// N'échoue jamais l'action métier appelante : l'inscription reste valide même si Redis
// ou le serveur SMTP est indisponible — le joueur pourra demander un renvoi.
func EnvoyerCodeVerification(u *Utilisateur) error {
	if u == nil || u.EmailVerifie {
		return nil
	}
	code, err := genererCodeEmail()
	if err != nil {
		return err
	}
	ctx, annuler := contexteRedis()
	defer annuler()
	cle := cleVerifEmail(u.ID)
	if err := config.Redis.HSet(ctx, cle, champCode, code, champEssais, 0).Err(); err != nil {
		return err
	}
	if err := config.Redis.Expire(ctx, cle, DureeCodeEmail).Err(); err != nil {
		return err
	}
	courriel.Enfiler(u.Email, courriel.MessageVerification(u.NomUtilisateur, code, int(DureeCodeEmail.Minutes())))
	return nil
}

// RenvoyerCodeVerification pose d'abord le verrou anti-renvoi (SET NX EX 60) : si la
// clé existe déjà, l'appel est refusé et le TTL restant indique quand réessayer.
// Renvoie ErrTropDeRenvois accompagné des secondes restantes.
func RenvoyerCodeVerification(u *Utilisateur) (int, error) {
	ctx, annuler := contexteRedis()
	defer annuler()
	verrou := cleRenvoiEmail(u.ID)
	pose, err := config.Redis.SetNX(ctx, verrou, "1", DelaiRenvoiEmail).Result()
	if err != nil {
		return 0, err
	}
	if !pose {
		restant, err := config.Redis.TTL(ctx, verrou).Result()
		if err != nil || restant <= 0 {
			restant = DelaiRenvoiEmail
		}
		return int(restant.Seconds()), ErrTropDeRenvois
	}
	if err := EnvoyerCodeVerification(u); err != nil {
		// L'envoi n'a pas abouti : on relâche le verrou pour ne pas immobiliser le
		// joueur une minute à cause d'un incident qui n'est pas de son fait.
		config.Redis.Del(ctx, verrou)
		return 0, err
	}
	return int(DelaiRenvoiEmail.Seconds()), nil
}

type entreeVerificationEmail struct {
	Code string `json:"code" validate:"required,len=6,number"`
}

// VerifierEmail godoc
// @Summary Confirmer son adresse e-mail avec le code à 6 chiffres
// @Tags auth
// @Security BearerAuth
// @Param corps body entreeVerificationEmail true "Code reçu par e-mail"
// @Success 200 {object} map[string]bool "{ emailVerifie: true }"
// @Failure 400 {object} map[string]any "code invalide, avec essaisRestants"
// @Failure 409 {object} map[string]string "adresse déjà confirmée"
// @Failure 429 {object} map[string]string "trop de tentatives"
// @Router /auth/verification-email [post]
func VerifierEmail(c fiber.Ctx) error {
	u, reponse := joueurCourant(c)
	if u == nil {
		return reponse
	}
	if u.EmailVerifie {
		return utils.Erreur(c, fiber.StatusConflict, "adresse e-mail déjà confirmée")
	}
	var in entreeVerificationEmail
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}

	ctx, annuler := contexteRedis()
	defer annuler()
	cle := cleVerifEmail(u.ID)
	attendu, err := config.Redis.HGet(ctx, cle, champCode).Result()
	if err != nil || attendu == "" {
		// Code expiré, jamais émis ou détruit après 5 essais : même réponse, aucune
		// information sur l'état interne.
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"erreur": "code invalide ou expiré, demandez un nouveau code", "essaisRestants": 0,
		})
	}

	// Comparaison à temps constant : la durée de la réponse ne doit rien apprendre.
	if subtle.ConstantTimeCompare([]byte(attendu), []byte(in.Code)) != 1 {
		essais, err := config.Redis.HIncrBy(ctx, cle, champEssais, 1).Result()
		if err != nil {
			essais = EssaisMaxEmail
		}
		if essais >= EssaisMaxEmail {
			config.Redis.Del(ctx, cle)
			return utils.Erreur(c, fiber.StatusTooManyRequests,
				"trop de tentatives, demandez un nouveau code")
		}
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"erreur": "code invalide", "essaisRestants": EssaisMaxEmail - int(essais),
		})
	}

	if err := config.DB.Model(&Utilisateur{}).Where("id = ?", u.ID).
		Update("email_verifie", true).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "confirmation impossible")
	}
	config.Redis.Del(ctx, cle, cleRenvoiEmail(u.ID))
	administration.Journaliser(config.DB, administration.ParamsAudit{
		UtilisateurID: &u.ID, Action: "auth:email_verifie", TableCible: "utilisateurs",
		IdentifiantCible: &u.ID, Nouvelle: map[string]any{"emailVerifie": true},
		AdresseIP: c.IP(),
	})
	return utils.OK(c, fiber.Map{"emailVerifie": true})
}

// RenvoyerVerificationEmail godoc
// @Summary Renvoyer le code de confirmation (corps vide)
// @Tags auth
// @Security BearerAuth
// @Success 200 {object} map[string]any "{ envoye: true, prochainEnvoiDans: 60 }"
// @Failure 409 {object} map[string]string "adresse déjà confirmée"
// @Failure 429 {object} map[string]any "renvoi trop rapproché, avec prochainEnvoiDans"
// @Router /auth/verification-email/renvoyer [post]
func RenvoyerVerificationEmail(c fiber.Ctx) error {
	u, reponse := joueurCourant(c)
	if u == nil {
		return reponse
	}
	if u.EmailVerifie {
		return utils.Erreur(c, fiber.StatusConflict, "adresse e-mail déjà confirmée")
	}
	restant, err := RenvoyerCodeVerification(u)
	if errors.Is(err, ErrTropDeRenvois) {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"erreur":            "un code vient d'être envoyé, patientez avant d'en demander un autre",
			"prochainEnvoiDans": restant,
		})
	}
	if err != nil {
		if utils.Log != nil {
			utils.Log.Warn("renvoi du code de confirmation impossible", zap.Error(err))
		}
		return utils.Erreur(c, fiber.StatusInternalServerError, "envoi impossible")
	}
	return utils.OK(c, fiber.Map{"envoye": true, "prochainEnvoiDans": restant})
}

// joueurCourant charge le joueur de la session. Un administrateur n'a pas d'adresse à
// confirmer : ces deux routes lui sont fermées (403) plutôt que de renvoyer un état
// inventé.
func joueurCourant(c fiber.Ctx) (*Utilisateur, error) {
	if RoleDe(c) == RoleAdmin {
		return nil, utils.Erreur(c, fiber.StatusForbidden, "route réservée aux joueurs")
	}
	u, err := TrouverUtilisateur(UtilisateurIDDe(c))
	if err != nil {
		return nil, utils.Erreur(c, fiber.StatusNotFound, "utilisateur introuvable")
	}
	return u, nil
}

// EmailConfirme refuse (403) les actions qui engagent de l'argent tant que l'adresse du
// joueur n'est pas confirmée : POST /defis, POST /defis/:id/rejoindre et la demande de
// retrait. Le DÉPÔT reste ouvert — bloquer une entrée d'argent frustrerait le joueur
// sans rien protéger. À chaîner APRÈS Connecte().
func EmailConfirme() fiber.Handler {
	return func(c fiber.Ctx) error {
		if RoleDe(c) == RoleAdmin {
			return c.Next()
		}
		var u Utilisateur
		if err := config.DB.Select("id", "email_verifie").
			First(&u, "id = ?", UtilisateurIDDe(c)).Error; err != nil {
			return utils.Erreur(c, fiber.StatusUnauthorized, "session invalide ou expirée")
		}
		if !u.EmailVerifie {
			return utils.Erreur(c, fiber.StatusForbidden, MessageEmailNonConfirme)
		}
		return c.Next()
	}
}
