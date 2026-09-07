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
	"quiperd/backend/tempsreel"
	"quiperd/backend/utils"
)

// ChargeDefiRejoint — defi.rejoint : le défi quitte la liste ouverte, un match démarre.
type ChargeDefiRejoint struct {
	DefiID  uuid.UUID `json:"defiId"`
	MatchID uuid.UUID `json:"matchId"`
}

// ChargeDefiID — defi.annule et defi.expire : le défi quitte simplement la liste ouverte.
type ChargeDefiID struct {
	DefiID uuid.UUID `json:"defiId"`
}

// chargerLigne relit un défi sous sa forme de liste (libellés joints compris), telle que la
// renvoie GET /api/defis/ouverts : c'est la charge exacte de l'événement defi.cree, pour que
// le client puisse insérer la ligne sans aucun appel réseau.
func chargerLigne(db *gorm.DB, id uuid.UUID) (*DefiListe, error) {
	var ligne DefiListe
	res := requeteDefis(db).Where("d.id = ?", id).Limit(1).Scan(&ligne)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &ligne, nil
}

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
	tampon := tempsreel.NouveauTampon()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		defi = Defi{
			CreateurID: userID, JeuID: jeuID, PlateformeID: platID,
			MontantMise: in.MontantMise, Devise: "XOF", Regles: in.Regles,
			Statut: StatutOuvert, DateExpiration: &expiration,
		}
		if err := tx.Create(&defi).Error; err != nil {
			return err
		}
		mise, err := portefeuilles.BloquerMise(tx, userID, defi.ID, in.MontantMise, "XOF")
		if err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &userID, Action: "defi:creation", TableCible: "defis",
			IdentifiantCible: &defi.ID, Nouvelle: defi, AdresseIP: c.IP(),
		})
		// Le défi apparaît en direct dans « Défis ouverts », y compris chez son créateur :
		// la charge est la ligne complète de GET /api/defis/ouverts (libellés joints).
		if ligne, e := chargerLigne(tx, defi.ID); e == nil {
			tampon.Ajouter(tempsreel.EvtDefiCree, ligne, tempsreel.SalonDefisPublics)
		}
		portefeuilles.AjouterMiseEtEtat(tx, tampon, mise.ID, userID)
		return nil
	})
	if errors.Is(err, portefeuilles.ErrSoldeInsuffisant) {
		return utils.Erreur(c, fiber.StatusUnprocessableEntity, "solde insuffisant pour créer ce défi")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "création du défi impossible")
	}
	tampon.Diffuser()

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

// DetailPublic godoc
// @Summary Fiche publique d'un défi (lien partagé, aucune authentification)
// @Description Sert les liens de partage : le destinataire voit le défi avant même d'avoir un
// @Description compte. Mêmes colonnes que `/defis/ouverts` — rien de plus que ce que la liste
// @Description publique montre déjà. Le match éventuel n'est PAS joint : il regarde deux joueurs
// @Description identifiés, pas un visiteur.
// @Tags defis
// @Success 200 {object} DefiListe
// @Router /defis/{id}/public [get]
func DetailPublic(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	var defi DefiListe
	res := requeteDefis(config.DB).Where("d.id = ?", id).Limit(1).Scan(&defi)
	if res.Error != nil || res.RowsAffected == 0 {
		return utils.Erreur(c, fiber.StatusNotFound, "défi introuvable")
	}
	return utils.OK(c, defi)
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
	tampon := tempsreel.NouveauTampon()
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
		mise, err := portefeuilles.BloquerMise(tx, userID, defi.ID, defi.MontantMise, defi.Devise)
		if err != nil {
			return err
		}
		m, err := matchs.CreerMatch(tx, defi.ID, defi.CreateurID, userID, defi.MontantMise, defi.Devise)
		if err != nil {
			return err
		}
		match = m
		_ = notifications.Creer(tx, defi.CreateurID, "Défi accepté",
			"Un joueur a rejoint votre défi. Le match peut commencer.", notifications.TypeDefiRejoint, tampon)
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &userID, Action: "defi:rejoindre", TableCible: "defis",
			IdentifiantCible: &defi.ID, Nouvelle: fiber.Map{"matchId": m.ID}, AdresseIP: c.IP(),
		})

		// Le défi sort de la liste publique ; le match arrive chez les deux joueurs.
		tampon.Ajouter(tempsreel.EvtDefiRejoint, ChargeDefiRejoint{DefiID: defi.ID, MatchID: m.ID},
			tempsreel.SalonDefisPublics)
		if enrichi, e := matchs.ChargerEnrichi(tx, m.ID); e == nil {
			tampon.Ajouter(tempsreel.EvtMatchCree, enrichi,
				tempsreel.SalonUtilisateur(defi.CreateurID), tempsreel.SalonUtilisateur(userID))
		}
		portefeuilles.AjouterMiseEtEtat(tx, tampon, mise.ID, userID, defi.CreateurID)
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
	tampon.Diffuser()
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

	tampon := tempsreel.NouveauTampon()
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
		tampon.Ajouter(tempsreel.EvtDefiAnnule, ChargeDefiID{DefiID: id}, tempsreel.SalonDefisPublics)
		if mise, e := portefeuilles.MiseDuDefi(tx, id, userID); e == nil {
			portefeuilles.AjouterTransactionsMise(tx, tampon, mise.ID)
		}
		portefeuilles.AjouterEtat(tx, tampon, userID)
		return nil
	})
	if errors.Is(err, errIndisponible) {
		return utils.Erreur(c, fiber.StatusConflict, "défi introuvable ou non annulable")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "annulation impossible")
	}
	tampon.Diffuser()
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
	// Route PUBLIQUE, déclarée hors du groupe protégé : c'est elle que sert un lien de
	// partage ouvert par quelqu'un qui n'a pas (encore) de compte. Elle ne renvoie que ce
	// que la liste publique montre déjà.
	api.Get("/defis/:id/public", DetailPublic)
	grp := api.Group("/defis", auth.Connecte())
	grp.Get("/", Lister)
	// Engager de l'argent exige une adresse confirmée (403 sinon) ; consulter, annuler
	// son propre défi et déposer restent ouverts.
	grp.Post("/", auth.EmailConfirme(), Creer)
	grp.Get("/:id", Detail)
	grp.Post("/:id/rejoindre", auth.EmailConfirme(), Rejoindre)
	grp.Delete("/:id", Annuler)
}
