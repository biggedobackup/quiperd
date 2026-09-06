// Package litiges gère l'ouverture et l'arbitrage des litiges de match.
package litiges

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"quiperd/backend/administration"
	"quiperd/backend/auth"
	"quiperd/backend/config"
	"quiperd/backend/jobs"
	"quiperd/backend/matchs"
	"quiperd/backend/notifications"
	"quiperd/backend/portefeuilles"
	"quiperd/backend/utils"
)

// Statuts et décisions.
const (
	StatutEnCours = "en_cours"
	StatutResolu  = "resolu"

	DecisionGagnant       = "gagnant"
	DecisionRemboursement = "remboursement"
)

// Litige (table 10).
type Litige struct {
	utils.ModeleBase
	MatchID        uuid.UUID  `gorm:"type:uuid;index" json:"matchId"`
	OuvertParID    *uuid.UUID `gorm:"type:uuid" json:"ouvertParId,omitempty"`
	Motif          string     `gorm:"type:text" json:"motif"`
	Statut         string     `gorm:"type:varchar(20);default:'en_cours';index" json:"statut"`
	Decision       string     `gorm:"type:varchar(30)" json:"decision"`
	ArbitreID      *uuid.UUID `gorm:"type:uuid" json:"arbitreId,omitempty"`
	DateResolution *time.Time `json:"dateResolution,omitempty"`
}

func (Litige) TableName() string { return "litiges" }

// DelaiRelanceArbitre est le délai après lequel l'arbitre est rappelé (tâche Asynq litige:relance).
const DelaiRelanceArbitre = 24 * time.Hour

// Brancher installe le hook d'ouverture automatique de litige côté matchs
// (déclarations divergentes) — appelé au démarrage depuis main.
func Brancher() {
	matchs.OuvrirLitigeAuto = func(tx *gorm.DB, matchID uuid.UUID, motif string) {
		var n int64
		tx.Model(&Litige{}).Where("match_id = ? AND statut = ?", matchID, StatutEnCours).Count(&n)
		if n > 0 {
			return
		}
		litige := Litige{MatchID: matchID, Motif: motif, Statut: StatutEnCours}
		if err := tx.Create(&litige).Error; err != nil {
			return
		}
		var m matchs.MatchDefi
		if err := tx.First(&m, "id = ?", matchID).Error; err == nil {
			for _, j := range []uuid.UUID{m.Joueur1ID, m.Joueur2ID} {
				_ = notifications.Creer(tx, j, "Litige ouvert",
					"Vos déclarations de score divergent : un litige a été ouvert, un arbitre va trancher.",
					notifications.TypeLitigeOuvert)
			}
		}
		jobs.EnfilerLitigeRelance(litige.ID.String(), DelaiRelanceArbitre)
	}
}

// RelancerSiEnCours est appelé par le worker (tâche litige:relance) : si le litige
// est toujours sans décision après le délai, le rappel est journalisé (journaux_audit)
// et tracé dans les logs pour l'équipe d'arbitrage. Idempotent.
func RelancerSiEnCours(litigeID uuid.UUID) error {
	var l Litige
	if err := config.DB.First(&l, "id = ?", litigeID).Error; err != nil {
		return nil // litige supprimé : rien à relancer
	}
	if l.Statut != StatutEnCours {
		return nil
	}
	administration.Journaliser(config.DB, administration.ParamsAudit{
		Action: "litige:relance", TableCible: "litiges", IdentifiantCible: &l.ID,
		Nouvelle: map[string]any{"matchId": l.MatchID, "motif": l.Motif},
	})
	if utils.Log != nil {
		utils.Log.Warn("litige toujours en attente d'arbitrage",
			zap.String("litigeId", l.ID.String()), zap.String("matchId", l.MatchID.String()))
	}
	return nil
}

// Ouvrir godoc
// @Summary Ouvrir un litige sur un match
// @Tags litiges
// @Security BearerAuth
// @Router /matchs/{id}/litige [post]
func Ouvrir(c fiber.Ctx) error {
	matchID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)
	var in struct {
		Motif string `json:"motif" validate:"required,min=3"`
	}
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}

	m, err := matchs.Charger(config.DB, matchID)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	if !m.EstParticipant(userID) {
		return utils.Erreur(c, fiber.StatusForbidden, "ce match ne vous concerne pas")
	}
	if m.Statut == matchs.StatutTermine {
		return utils.Erreur(c, fiber.StatusConflict, "ce match est déjà réglé")
	}
	if m.Statut == matchs.StatutLitige {
		return utils.Erreur(c, fiber.StatusConflict, "un litige est déjà ouvert sur ce match")
	}
	adversaire := m.Joueur1ID
	if userID == m.Joueur1ID {
		adversaire = m.Joueur2ID
	}

	var litige Litige
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// Transition atomique vers "litige" : deux ouvertures simultanées ne créent qu'un litige.
		res := tx.Model(&matchs.MatchDefi{}).
			Where("id = ? AND statut IN ?", matchID, []string{matchs.StatutEnCours, matchs.StatutVerification}).
			Update("statut", matchs.StatutLitige)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errDejaEnLitige
		}
		litige = Litige{MatchID: matchID, OuvertParID: &userID, Motif: in.Motif, Statut: StatutEnCours}
		if err := tx.Create(&litige).Error; err != nil {
			return err
		}
		_ = notifications.Creer(tx, adversaire, "Litige ouvert",
			"Votre adversaire a ouvert un litige sur votre match. Un arbitre va trancher.",
			notifications.TypeLitigeOuvert)
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &userID, Action: "litige:ouverture", TableCible: "litiges",
			IdentifiantCible: &litige.ID, Nouvelle: map[string]any{"motif": in.Motif}, AdresseIP: c.IP(),
		})
		return nil
	})
	if errors.Is(err, errDejaEnLitige) {
		return utils.Erreur(c, fiber.StatusConflict, "un litige est déjà ouvert sur ce match")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "ouverture du litige impossible")
	}
	jobs.EnfilerLitigeRelance(litige.ID.String(), DelaiRelanceArbitre)
	return utils.OK(c, litige, fiber.StatusCreated)
}

// Lister godoc
// @Summary Mes litiges (admin : ?tous=1 pour tous)
// @Tags litiges
// @Security BearerAuth
// @Router /litiges [get]
func Lister(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	if auth.EstAdmin(c) && c.Query("tous") == "1" {
		// Administration : tous les litiges, enveloppe paginée (10/page, ?page&taille,
		// filtre ?statut=en_cours|resolu), plus récents d'abord.
		page, taille, offset := utils.Pagination(c)
		q := config.DB.Model(&Litige{})
		if s := c.Query("statut"); s != "" {
			q = q.Where("statut = ?", s)
		}
		q = q.Session(&gorm.Session{}) // base réutilisable : un COUNT puis un SELECT paginé
		var total int64
		if err := q.Count(&total).Error; err != nil {
			return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des litiges impossible")
		}
		liste := []Litige{}
		if err := q.Order("date_creation DESC").Limit(taille).Offset(offset).Find(&liste).Error; err != nil {
			return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des litiges impossible")
		}
		return utils.OK(c, utils.NouvellePage(liste, total, page, taille))
	}
	// Joueur : litiges où il est impliqué (joueur1 ou joueur2 du match) — tableau simple.
	liste := []Litige{}
	q := config.DB.Order("date_creation DESC").
		Where("match_id IN (?)",
			config.DB.Table("matchs").Select("id").
				Where("joueur_1_id = ? OR joueur_2_id = ?", userID, userID))
	if err := q.Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des litiges impossible")
	}
	return utils.OK(c, liste)
}

type entreeDecision struct {
	Decision  string `json:"decision" validate:"required,oneof=gagnant remboursement"`
	GagnantID string `json:"gagnantId" validate:"omitempty,uuid"`
}

// Decider godoc
// @Summary Décision arbitrale (admin) — règlement au gagnant ou remboursement croisé (chaque mise rendue moins la commission)
// @Tags litiges
// @Security BearerAuth
// @Router /litiges/{id} [patch]
func Decider(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	arbitre := auth.UtilisateurIDDe(c)
	var in entreeDecision
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}

	var litige Litige
	if err := config.DB.First(&litige, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "litige introuvable")
	}
	if litige.Statut == StatutResolu {
		return utils.Erreur(c, fiber.StatusConflict, "litige déjà résolu")
	}
	m, err := matchs.Charger(config.DB, litige.MatchID)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}

	var gagnantID, perdantID uuid.UUID
	if in.Decision == DecisionGagnant {
		gagnantID, err = uuid.Parse(in.GagnantID)
		if err != nil || (gagnantID != m.Joueur1ID && gagnantID != m.Joueur2ID) {
			return utils.Erreur(c, fiber.StatusBadRequest, "gagnant invalide")
		}
		perdantID = m.Joueur1ID
		if gagnantID == m.Joueur1ID {
			perdantID = m.Joueur2ID
		}
	}

	maintenant := time.Now().UTC()
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// Transition atomique litige -> termine (empêche double règlement).
		res := tx.Model(&matchs.MatchDefi{}).
			Where("id = ? AND statut = ?", m.ID, matchs.StatutLitige).
			Update("statut", matchs.StatutTermine)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errDejaRegle
		}

		// La commission est prélevée dans les deux cas : sur le total réglé au gagnant, ou
		// sur chaque mise rendue (règle produit : toute mise rendue = mise × (1 − commission)).
		taux := administration.CommissionActuelle(tx)
		if in.Decision == DecisionRemboursement {
			if err := portefeuilles.RemboursementCroise(tx, m.DefiID, m.ID, m.Joueur1ID, m.Joueur2ID, taux); err != nil {
				return err
			}
			tx.Model(&matchs.MatchDefi{}).Where("id = ?", m.ID).Update("date_fin", maintenant)
		} else {
			if _, _, err := portefeuilles.ReglerEscrow(tx, m.DefiID, m.ID, gagnantID, perdantID, m.MontantMise, taux); err != nil {
				return err
			}
			tx.Model(&matchs.MatchDefi{}).Where("id = ?", m.ID).Updates(map[string]any{
				"gagnant_id": gagnantID, "perdant_id": perdantID, "date_fin": maintenant,
			})
		}

		if err := tx.Model(&Litige{}).Where("id = ?", id).Updates(map[string]any{
			"statut": StatutResolu, "decision": in.Decision,
			"arbitre_id": arbitre, "date_resolution": maintenant,
		}).Error; err != nil {
			return err
		}

		administration.Journaliser(tx, administration.ParamsAudit{
			AdministrateurID: &arbitre, Action: "litige:decision", TableCible: "litiges",
			IdentifiantCible: &id, Nouvelle: fiber.Map{"decision": in.Decision, "gagnantId": in.GagnantID},
			AdresseIP: c.IP(),
		})

		message := "La décision arbitrale a été rendue : le match est réglé au gagnant désigné par l'arbitre."
		if in.Decision == DecisionRemboursement {
			message = "La décision arbitrale a été rendue : match annulé, chaque joueur récupère sa mise moins la commission de la plateforme."
		}
		_ = notifications.Creer(tx, m.Joueur1ID, "Litige résolu", message, notifications.TypeLitigeResolu)
		_ = notifications.Creer(tx, m.Joueur2ID, "Litige résolu", message, notifications.TypeLitigeResolu)
		return nil
	})

	if errors.Is(err, errDejaRegle) {
		return utils.Erreur(c, fiber.StatusConflict, "ce match est déjà réglé")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "décision impossible")
	}
	return utils.OK(c, fiber.Map{"statut": StatutResolu, "decision": in.Decision})
}

var (
	errDejaRegle    = errors.New("déjà réglé")
	errDejaEnLitige = errors.New("déjà en litige")
)

// Enregistrer monte les routes des litiges.
func Enregistrer(api fiber.Router) {
	api.Post("/matchs/:id/litige", auth.Connecte(), Ouvrir)

	grp := api.Group("/litiges", auth.Connecte())
	grp.Get("/", Lister)
	grp.Patch("/:id", auth.AdminSeul(), Decider)
}
