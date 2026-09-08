// Package preuves gère l'upload, la vérification et la diffusion protégée des
// preuves de match (captures + vidéos) stockées sur le disque local.
package preuves

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"defisenligne/backend/administration"
	"defisenligne/backend/auth"
	"defisenligne/backend/config"
	"defisenligne/backend/matchs"
	"defisenligne/backend/tempsreel"
	"defisenligne/backend/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Statuts de preuve.
const (
	StatutEnAttente = "en_attente"
	StatutValidee   = "validee"
	StatutRejetee   = "rejetee"
)

// PreuveMatch (table 9).
type PreuveMatch struct {
	utils.ModeleBase
	MatchID          uuid.UUID  `gorm:"type:uuid;index" json:"matchId"`
	UtilisateurID    uuid.UUID  `gorm:"type:uuid;index" json:"utilisateurId"`
	Type             string     `gorm:"type:varchar(20)" json:"type"`
	UrlFichier       string     `gorm:"type:text" json:"urlFichier"`
	EmpreinteFichier string     `gorm:"type:varchar(128);index" json:"empreinteFichier"`
	Statut           string     `gorm:"type:varchar(20);default:'en_attente'" json:"statut"`
	MotifRejet       string     `gorm:"type:text" json:"motifRejet"`
	DateEnvoi        time.Time  `gorm:"autoCreateTime" json:"dateEnvoi"`
	DateVerification *time.Time `json:"dateVerification,omitempty"`
}

func (PreuveMatch) TableName() string { return "preuves_matchs" }

// ChargePreuveEnvoyee — match.preuve_envoyee (salon du match).
type ChargePreuveEnvoyee struct {
	MatchID       uuid.UUID `json:"matchId"`
	UtilisateurID uuid.UUID `json:"utilisateurId"`
	PreuveID      uuid.UUID `json:"preuveId"`
	Type          string    `json:"type"`
}

// ChargePreuveAVerifier — admin.preuve_a_verifier (salon admin).
type ChargePreuveAVerifier struct {
	PreuveID uuid.UUID `json:"preuveId"`
	MatchID  uuid.UUID `json:"matchId"`
}

// aDeposePreuve indique si un joueur a déposé au moins une preuve sur ce match.
func aDeposePreuve(tx *gorm.DB, matchID, userID uuid.UUID) bool {
	var n int64
	tx.Model(&PreuveMatch{}).Where("match_id = ? AND utilisateur_id = ?", matchID, userID).Count(&n)
	return n > 0
}

// Televerser godoc
// @Summary Envoyer une preuve de match (multipart → disque local)
// @Tags preuves
// @Security BearerAuth
// @Router /matchs/{id}/preuves [post]
func Televerser(c fiber.Ctx) error {
	matchID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)

	m, err := matchs.Charger(config.DB, matchID)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	if !m.EstParticipant(userID) {
		return utils.Erreur(c, fiber.StatusForbidden, "ce match ne vous concerne pas")
	}
	// Une preuve ne sert qu'à trancher un match encore ouvert. En accepter sur un match déjà
	// réglé remplirait le stockage de fichiers que personne n'examinera jamais, et laisserait
	// croire au joueur qu'il peut encore contester une issue définitive.
	if m.Statut == matchs.StatutTermine {
		return utils.Erreur(c, fiber.StatusConflict, "ce match est terminé, aucune preuve ne peut plus être ajoutée")
	}

	typePreuve := c.FormValue("type")
	if typePreuve != "capture_ecran" && typePreuve != "video" {
		return utils.Erreur(c, fiber.StatusBadRequest, "type de preuve invalide (capture_ecran ou video)")
	}

	fichier, err := c.FormFile("fichier")
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "fichier manquant")
	}
	if fichier.Size > config.Cfg.UploadMaxOctets {
		return utils.Erreur(c, fiber.StatusRequestEntityTooLarge, "fichier trop volumineux")
	}
	ext := strings.ToLower(filepath.Ext(fichier.Filename))
	if !utils.TypeAutorise(typePreuve, ext) {
		return utils.Erreur(c, fiber.StatusBadRequest, "format de fichier non autorisé")
	}
	// L'extension ne prouve rien : on regarde le contenu réel avant d'écrire sur le disque.
	if err := utils.ContenuAutorise(fichier, typePreuve); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "le contenu du fichier ne correspond pas au type annoncé")
	}

	chemin, empreinte, err := utils.SauvegarderPreuve(config.Cfg.StockagePreuvesDir, matchID.String(), userID.String(), fichier)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "enregistrement du fichier impossible")
	}

	// Détection de réutilisation : la même empreinte dans un AUTRE match est suspecte.
	var n int64
	config.DB.Model(&PreuveMatch{}).Where("empreinte_fichier = ? AND match_id <> ?", empreinte, matchID).Count(&n)
	if n > 0 {
		// Ne pas laisser de fichier orphelin sur le disque.
		_ = os.Remove(utils.CheminAbsoluPreuve(config.Cfg.StockagePreuvesDir, chemin))
		return utils.Erreur(c, fiber.StatusConflict, "cette preuve a déjà été utilisée pour un autre match")
	}

	p := PreuveMatch{
		MatchID: matchID, UtilisateurID: userID, Type: typePreuve,
		UrlFichier: chemin, EmpreinteFichier: empreinte, Statut: StatutEnAttente,
	}
	tampon := tempsreel.NouveauTampon()
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&p).Error; err != nil {
			return err
		}
		tampon.Ajouter(tempsreel.EvtMatchPreuveEnvoyee, ChargePreuveEnvoyee{
			MatchID: matchID, UtilisateurID: userID, PreuveID: p.ID, Type: typePreuve,
		}, tempsreel.SalonMatch(matchID))
		tampon.Ajouter(tempsreel.EvtAdminPreuveAVerifier, ChargePreuveAVerifier{
			PreuveID: p.ID, MatchID: matchID,
		}, tempsreel.SalonAdmin)

		// Machine à états : après un désaccord, le litige n'est ouvert qu'une fois les DEUX
		// preuves déposées (ou à l'expiration de l'échéance, côté worker). Verrou de la
		// ligne match d'abord, comme partout ailleurs (anti-interblocage).
		courant, err := matchs.ChargerVerrouille(tx, matchID)
		if err != nil {
			return err
		}
		if courant.Statut == matchs.StatutPreuveRequise &&
			aDeposePreuve(tx, matchID, courant.Joueur1ID) && aDeposePreuve(tx, matchID, courant.Joueur2ID) {
			if _, err := matchs.PasserEnLitige(tx, tampon, matchID,
				"Déclarations divergentes : les deux preuves ont été déposées"); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		_ = os.Remove(utils.CheminAbsoluPreuve(config.Cfg.StockagePreuvesDir, chemin))
		return utils.Erreur(c, fiber.StatusInternalServerError, "enregistrement impossible")
	}
	tampon.Diffuser()
	return utils.OK(c, p, fiber.StatusCreated)
}

// Lister godoc
// @Summary Preuves d'un match
// @Tags preuves
// @Security BearerAuth
// @Router /matchs/{id}/preuves [get]
func Lister(c fiber.Ctx) error {
	matchID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)
	m, err := matchs.Charger(config.DB, matchID)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	if !auth.EstAdmin(c) && !m.EstParticipant(userID) {
		return utils.Erreur(c, fiber.StatusForbidden, "ce match ne vous concerne pas")
	}
	var liste []PreuveMatch
	config.DB.Where("match_id = ?", matchID).Order("date_envoi ASC").Find(&liste)
	return utils.OK(c, liste)
}

// Fichier diffuse le fichier de preuve via une route protégée (jamais un chemin statique).
// @Router /preuves/{id}/fichier [get]
func Fichier(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)
	var p PreuveMatch
	if err := config.DB.First(&p, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "preuve introuvable")
	}
	m, err := matchs.Charger(config.DB, p.MatchID)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	if !auth.EstAdmin(c) && !m.EstParticipant(userID) {
		return utils.Erreur(c, fiber.StatusForbidden, "accès refusé")
	}
	chemin, err := utils.CheminPreuveSous(config.Cfg.StockagePreuvesDir, p.UrlFichier)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "preuve introuvable")
	}
	// Le fichier est servi tel quel : le nom d'origine n'est jamais réutilisé et
	// `nosniff` est posé globalement, mais on force l'affichage en pièce jointe pour
	// qu'aucun contenu téléversé ne s'exécute dans le contexte du domaine.
	c.Set("Content-Disposition", "inline; filename=\""+p.ID.String()+filepath.Ext(p.UrlFichier)+"\"")
	return c.SendFile(chemin)
}

type entreeVerification struct {
	Statut     string `json:"statut" validate:"required,oneof=validee rejetee"`
	MotifRejet string `json:"motifRejet"`
}

// Verifier godoc
// @Summary Valider/rejeter une preuve (admin)
// @Tags preuves
// @Security BearerAuth
// @Router /preuves/{id} [patch]
func Verifier(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	arbitre := auth.UtilisateurIDDe(c)
	var in entreeVerification
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}

	var p PreuveMatch
	if err := config.DB.First(&p, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "preuve introuvable")
	}
	maintenant := time.Now().UTC()
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		maj := map[string]any{"statut": in.Statut, "date_verification": maintenant}
		if in.Statut == StatutRejetee {
			maj["motif_rejet"] = in.MotifRejet
		}
		if err := tx.Model(&PreuveMatch{}).Where("id = ?", id).Updates(maj).Error; err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			AdministrateurID: &arbitre, Action: "preuve:" + in.Statut, TableCible: "preuves_matchs",
			IdentifiantCible: &id, AdresseIP: c.IP(),
		})
		return nil
	})
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "mise à jour impossible")
	}

	// Auto-validation du match si les deux joueurs ont une preuve validée et
	// que le match est en vérification (déclarations concordantes).
	if in.Statut == StatutValidee {
		tenterValidationAuto(p.MatchID, arbitre)
	}
	return utils.OK(c, fiber.Map{"statut": in.Statut})
}

// tenterValidationAuto règle un match resté en `verification` dès que les deux preuves sont
// validées. Ce chemin ne concerne plus le parcours joueur courant (deux déclarations
// concordantes règlent le match immédiatement, sans preuve ni arbitre) : il ne sert qu'aux
// lignes historiques encore en `verification`.
func tenterValidationAuto(matchID, arbitre uuid.UUID) {
	m, err := matchs.Charger(config.DB, matchID)
	if err != nil || m.Statut != matchs.StatutVerification {
		return
	}
	if preuveValideePour(matchID, m.Joueur1ID) && preuveValideePour(matchID, m.Joueur2ID) {
		_, _ = matchs.ValiderMatch(matchID, &arbitre)
	}
}

func preuveValideePour(matchID, userID uuid.UUID) bool {
	var n int64
	config.DB.Model(&PreuveMatch{}).
		Where("match_id = ? AND utilisateur_id = ? AND statut = ?", matchID, userID, StatutValidee).
		Count(&n)
	return n > 0
}

// Enregistrer monte les routes des preuves.
func Enregistrer(api fiber.Router) {
	grp := api.Group("/matchs", auth.Connecte())
	grp.Post("/:id/preuves", Televerser)
	grp.Get("/:id/preuves", Lister)

	pv := api.Group("/preuves", auth.Connecte())
	pv.Get("/:id/fichier", Fichier)
	pv.Patch("/:id", auth.AdminSeul(), Verifier)
}
