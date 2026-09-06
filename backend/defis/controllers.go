package defis

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
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

type entreeDefi struct {
	JeuID        string          `json:"jeuId" validate:"required,uuid"`
	PlateformeID string          `json:"plateformeId" validate:"required,uuid"`
	MontantMise  decimal.Decimal `json:"montantMise"`
	Regles       string          `json:"regles"`
	DureeHeures  int             `json:"dureeHeures"`
}

// DefiListe est une ligne de la liste des défis ouverts : le défi enrichi des
// libellés joints (créateur, jeu + catégorie, plateforme + famille), sérialisé en camelCase.
type DefiListe struct {
	Defi
	CreateurNom       string `json:"createurNom"`
	JeuNom            string `json:"jeuNom"`
	JeuCategorie      string `json:"jeuCategorie"`
	PlateformeNom     string `json:"plateformeNom"`
	PlateformeFamille string `json:"plateformeFamille"`
}

// appliquerFiltres applique les filtres de requête communs aux listes de défis.
func appliquerFiltres(c fiber.Ctx, q *gorm.DB) *gorm.DB {
	if jeu := c.Query("jeu"); jeu != "" {
		q = q.Where("d.jeu_id = ?", jeu)
	}
	if plat := c.Query("plateforme"); plat != "" {
		q = q.Where("d.plateforme_id = ?", plat)
	}
	if cat := c.Query("categorie"); cat != "" {
		q = q.Where("j.categorie = ?", cat)
	}
	if fam := c.Query("famille"); fam != "" {
		q = q.Where("p.famille = ?", fam)
	}
	if miseMax := c.Query("miseMax"); miseMax != "" {
		q = q.Where("d.montant_mise <= ?", miseMax)
	}
	return q
}

// ListerOuverts godoc
// @Summary Défis ouverts, en attente d'un adversaire (public — site vitrine)
// @Tags defis
// @Success 200 {array} DefiListe
// @Router /defis/ouverts [get]
func ListerOuverts(c fiber.Ctx) error {
	q := requeteDefis(config.DB).
		Where("d.statut = ?", StatutOuvert).
		Where("d.date_expiration IS NULL OR d.date_expiration > ?", time.Now().UTC())
	q = appliquerFiltres(c, q)
	lignes := []DefiListe{}
	if err := q.Order("d.date_creation DESC").Limit(100).Scan(&lignes).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des défis impossible")
	}
	return utils.OK(c, lignes)
}

func requeteDefis(db *gorm.DB) *gorm.DB {
	return db.Table("defis d").
		Select(`d.*, u.nom_utilisateur AS createur_nom, j.nom AS jeu_nom, j.categorie AS jeu_categorie,
			p.nom AS plateforme_nom, p.famille AS plateforme_famille`).
		Joins("LEFT JOIN utilisateurs u ON u.id = d.createur_id").
		Joins("LEFT JOIN jeux j ON j.id = d.jeu_id").
		Joins("LEFT JOIN plateformes p ON p.id = d.plateforme_id")
}

// Lister godoc
// @Summary Défis ouverts (?jeu=, ?plateforme=, ?miseMax=) — ou mes défis, tous statuts (?mes=1)
// @Tags defis
// @Security BearerAuth
// @Success 200 {array} DefiListe
// @Router /defis [get]
func Lister(c fiber.Ctx) error {
	q := requeteDefis(config.DB)
	if c.Query("mes") == "1" {
		q = q.Where("d.createur_id = ?", auth.UtilisateurIDDe(c))
	} else {
		q = q.Where("d.statut = ?", StatutOuvert).
			Where("d.date_expiration IS NULL OR d.date_expiration > ?", time.Now().UTC())
	}
	q = appliquerFiltres(c, q)

	lignes := []DefiListe{}
	if err := q.Order("d.date_creation DESC").Scan(&lignes).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des défis impossible")
	}
	return utils.OK(c, lignes)
}

// Creer godoc
// @Summary Créer un défi (bloque la mise du créateur)
// @Tags defis
// @Security BearerAuth
// @Router /defis [post]
func Creer(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	var in entreeDefi
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	if in.MontantMise.LessThanOrEqual(decimal.Zero) {
		return utils.Erreur(c, fiber.StatusBadRequest, "le montant de la mise doit être positif")
	}
	jeuID, _ := uuid.Parse(in.JeuID)
	platID, _ := uuid.Parse(in.PlateformeID)

	// Vérifier le catalogue (jeu et plateforme actifs).
	if !existeActif("jeux", jeuID) {
		return utils.Erreur(c, fiber.StatusBadRequest, "jeu invalide ou inactif")
	}
	if !existeActif("plateformes", platID) {
		return utils.Erreur(c, fiber.StatusBadRequest, "plateforme invalide ou inactive")
	}

	// Bornes de mise (configuration financière).
	if min, ok := administration.MiseMinimale(config.DB); ok && in.MontantMise.LessThan(min) {
		return utils.Erreur(c, fiber.StatusBadRequest, "mise inférieure au minimum autorisé")
	}
	if max, ok := administration.MiseMaximale(config.DB); ok && in.MontantMise.GreaterThan(max) {
		return utils.Erreur(c, fiber.StatusBadRequest, "mise supérieure au maximum autorisé")
	}

	dureeHeures := in.DureeHeures
	if dureeHeures <= 0 {
		dureeHeures = 24
	}
	expiration := time.Now().UTC().Add(time.Duration(dureeHeures) * time.Hour)

	var defi Defi
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		defi = Defi{
			CreateurID: userID, JeuID: jeuID, PlateformeID: platID,
			MontantMise: in.MontantMise, Devise: "XOF", Regles: in.Regles,
			Statut: StatutOuvert, DateExpiration: &expiration,
		}
		if err := tx.Create(&defi).Error; err != nil {
			return err
		}
		if _, err := portefeuilles.BloquerMise(tx, userID, defi.ID, in.MontantMise, "XOF"); err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &userID, Action: "defi:creation", TableCible: "defis",
			IdentifiantCible: &defi.ID, Nouvelle: defi, AdresseIP: c.IP(),
		})
		return nil
	})
	if errors.Is(err, portefeuilles.ErrSoldeInsuffisant) {
		return utils.Erreur(c, fiber.StatusUnprocessableEntity, "solde insuffisant pour créer ce défi")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "création du défi impossible")
	}

	jobs.EnfilerDefiExpiration(defi.ID.String(), time.Until(expiration))
	return utils.OK(c, defi, fiber.StatusCreated)
}

// Detail godoc
// @Summary Détail d'un défi (libellés créateur/jeu/plateforme) et son match s'il existe
// @Tags defis
// @Security BearerAuth
// @Router /defis/{id} [get]
func Detail(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	var defi DefiListe
	res := requeteDefis(config.DB).Where("d.id = ?", id).Limit(1).Scan(&defi)
	if res.Error != nil || res.RowsAffected == 0 {
		return utils.Erreur(c, fiber.StatusNotFound, "défi introuvable")
	}
	reponse := fiber.Map{"defi": defi}
	if m, err := matchs.ChargerEnrichiParDefi(config.DB, id); err == nil {
		reponse["match"] = m
	}
	return utils.OK(c, reponse)
}

// Rejoindre godoc
// @Summary Rejoindre un défi (bloque la mise, crée le match)
// @Tags defis
// @Security BearerAuth
// @Router /defis/{id}/rejoindre [post]
func Rejoindre(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)

	var match *matchs.MatchDefi
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		var defi Defi
		if err := tx.First(&defi, "id = ?", id).Error; err != nil {
			return errIntrouvable
		}
		if defi.CreateurID == userID {
			return errPropreDefi
		}
		if defi.DateExpiration != nil && defi.DateExpiration.Before(time.Now().UTC()) {
			return errIndisponible
		}
		// Transition atomique ouvert -> complet : empêche le double « rejoindre ».
		res := tx.Model(&Defi{}).Where("id = ? AND statut = ?", id, StatutOuvert).
			Update("statut", StatutComplet)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errIndisponible
		}
		if _, err := portefeuilles.BloquerMise(tx, userID, defi.ID, defi.MontantMise, defi.Devise); err != nil {
			return err
		}
		m, err := matchs.CreerMatch(tx, defi.ID, defi.CreateurID, userID, defi.MontantMise, defi.Devise)
		if err != nil {
			return err
		}
		match = m
		_ = notifications.Creer(tx, defi.CreateurID, "Défi accepté",
			"Un joueur a rejoint votre défi. Le match peut commencer.", notifications.TypeDefiRejoint)
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &userID, Action: "defi:rejoindre", TableCible: "defis",
			IdentifiantCible: &defi.ID, Nouvelle: fiber.Map{"matchId": m.ID}, AdresseIP: c.IP(),
		})
		return nil
	})

	switch {
	case errors.Is(err, errIntrouvable):
		return utils.Erreur(c, fiber.StatusNotFound, "défi introuvable")
	case errors.Is(err, errPropreDefi):
		return utils.Erreur(c, fiber.StatusBadRequest, "vous ne pouvez pas rejoindre votre propre défi")
	case errors.Is(err, errIndisponible):
		return utils.Erreur(c, fiber.StatusConflict, "ce défi n'est plus disponible")
	case errors.Is(err, portefeuilles.ErrSoldeInsuffisant):
		return utils.Erreur(c, fiber.StatusUnprocessableEntity, "solde insuffisant pour rejoindre ce défi")
	case err != nil:
		return utils.Erreur(c, fiber.StatusInternalServerError, "impossible de rejoindre le défi")
	}
	return utils.OK(c, match, fiber.StatusCreated)
}

// Annuler godoc
// @Summary Annuler un défi ouvert (rend la mise au créateur, moins la commission)
// @Tags defis
// @Security BearerAuth
// @Router /defis/{id} [delete]
func Annuler(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// Transition atomique ouvert -> annule : seul l'appel qui la réussit rend la mise
		// (un double clic ou une expiration concurrente obtient RowsAffected = 0 → 409).
		res := tx.Model(&Defi{}).
			Where("id = ? AND createur_id = ? AND statut = ?", id, userID, StatutOuvert).
			Update("statut", StatutAnnule)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errIndisponible
		}
		// Règle produit : toute mise rendue = mise × (1 − commission), même sur annulation.
		taux := administration.CommissionActuelle(tx)
		rendu, commission, err := portefeuilles.RembourserMise(tx, id, userID, taux, "défi annulé")
		if err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &userID, Action: "defi:annulation", TableCible: "defis",
			IdentifiantCible: &id, AdresseIP: c.IP(),
			Nouvelle: fiber.Map{"statut": StatutAnnule, "rendu": rendu, "commission": commission, "taux": taux},
		})
		return nil
	})
	if errors.Is(err, errIndisponible) {
		return utils.Erreur(c, fiber.StatusConflict, "défi introuvable ou non annulable")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "annulation impossible")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func existeActif(table string, id uuid.UUID) bool {
	var n int64
	config.DB.Table(table).Where("id = ? AND statut = ?", id, "actif").Count(&n)
	return n > 0
}

var (
	errIntrouvable  = errors.New("introuvable")
	errPropreDefi   = errors.New("propre défi")
	errIndisponible = errors.New("indisponible")
)

// Enregistrer monte les routes des défis. La liste publique est déclarée AVANT le groupe
// protégé : sinon `/defis/ouverts` serait capturé par `/defis/:id` et exigerait un jeton.
func Enregistrer(api fiber.Router) {
	api.Get("/defis/ouverts", ListerOuverts)
	grp := api.Group("/defis", auth.Connecte())
	grp.Get("/", Lister)
	grp.Post("/", Creer)
	grp.Get("/:id", Detail)
	grp.Post("/:id/rejoindre", Rejoindre)
	grp.Delete("/:id", Annuler)
}
