package administration

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"quiperd/backend/config"
	"quiperd/backend/utils"
)

// Statistiques godoc
// @Summary KPIs du tableau de bord admin (cache Redis 60 s)
// @Tags administration
// @Security BearerAuth
// @Router /administration/statistiques [get]
func Statistiques(c fiber.Ctx) error {
	const cle = CleCacheStats // même clé que le rafraîchissement temps réel (kpi.go)
	ctx := context.Background()
	if config.Redis != nil {
		if val, err := config.Redis.Get(ctx, cle).Result(); err == nil && val != "" {
			c.Set("Content-Type", "application/json")
			return c.SendString(val)
		}
	}

	stats := calculerStatistiques(config.DB)
	data, _ := json.Marshal(stats)
	if config.Redis != nil {
		config.Redis.Set(ctx, cle, data, 60*time.Second)
	}
	c.Set("Content-Type", "application/json")
	return c.SendString(string(data))
}

type statsAdmin struct {
	UtilisateursActifs int64           `json:"utilisateursActifs"`
	UtilisateursTotal  int64           `json:"utilisateursTotal"`
	DefisOuverts       int64           `json:"defisOuverts"`
	MatchsEnCours      int64           `json:"matchsEnCours"`
	MatchsTermines     int64           `json:"matchsTermines"`
	LitigesOuverts     int64           `json:"litigesOuverts"`
	VolumeMise         decimal.Decimal `json:"volumeMise"`
	CommissionCumulee  decimal.Decimal `json:"commissionCumulee"`
	DepotsReussis      decimal.Decimal `json:"depotsReussis"`
	RetraitsReussis    decimal.Decimal `json:"retraitsReussis"`
}

func calculerStatistiques(db *gorm.DB) statsAdmin {
	var s statsAdmin
	db.Table("utilisateurs").Where("statut = ?", "actif").Count(&s.UtilisateursActifs)
	db.Table("utilisateurs").Count(&s.UtilisateursTotal)
	db.Table("defis").Where("statut = ?", "ouvert").Count(&s.DefisOuverts)
	// Matchs « en cours » = tout ce qui n'est pas réglé et dont l'escrow est encore bloqué
	// (le litige est compté à part, comme avant).
	db.Table("matchs").Where("statut IN ?",
		[]string{"en_cours", "preuve_requise", "nul_en_attente", "verification"}).Count(&s.MatchsEnCours)
	db.Table("matchs").Where("statut = ?", "termine").Count(&s.MatchsTermines)
	db.Table("litiges").Where("statut = ?", "en_cours").Count(&s.LitigesOuverts)

	s.VolumeMise = sommeDecimale(db, "SELECT COALESCE(SUM(montant),0) FROM mises")
	s.CommissionCumulee = sommeDecimale(db, "SELECT COALESCE(SUM(montant),0) FROM transactions_portefeuilles WHERE type = 'commission' AND statut = 'valide'")
	s.DepotsReussis = sommeDecimale(db, "SELECT COALESCE(SUM(montant),0) FROM paiements WHERE type='depot' AND statut='reussi'")
	s.RetraitsReussis = sommeDecimale(db, "SELECT COALESCE(SUM(montant),0) FROM paiements WHERE type='retrait' AND statut='reussi'")
	return s
}

func sommeDecimale(db *gorm.DB, requete string) decimal.Decimal {
	var v decimal.Decimal
	db.Raw(requete).Scan(&v)
	return v
}

// ListerConfigurations godoc
// @Summary Configurations financières actives (admin)
// @Tags administration
// @Security BearerAuth
// @Router /administration/configurations-financieres [get]
func ListerConfigurations(c fiber.Ctx) error {
	var liste []ConfigurationFinanciere
	if err := config.DB.Where("statut = ?", "actif").
		Where("date_fin IS NULL OR date_fin > ?", time.Now().UTC()).
		Order("type ASC, date_debut DESC").Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	return utils.OK(c, liste)
}

// ConfigurationPublique est la vue publique d'une règle financière (valeur active seule).
type ConfigurationPublique struct {
	Type   string          `json:"type"`
	Valeur decimal.Decimal `json:"valeur"`
	Devise string          `json:"devise"`
}

// ListerConfigurationsPubliques godoc
// @Summary Règles financières actives (public) — commission, mises min/max, frais de retrait
// @Tags administration
// @Success 200 {array} ConfigurationPublique
// @Router /configurations-financieres [get]
func ListerConfigurationsPubliques(c fiber.Ctx) error {
	var liste []ConfigurationFinanciere
	if err := config.DB.Where("statut = ?", "actif").
		Where("date_fin IS NULL OR date_fin > ?", time.Now().UTC()).
		Order("type ASC, date_debut DESC").Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	out := make([]ConfigurationPublique, 0, len(liste))
	vus := map[string]bool{}
	for _, cfg := range liste {
		if vus[cfg.Type] {
			continue // une seule valeur (la plus récente) par type
		}
		vus[cfg.Type] = true
		out = append(out, ConfigurationPublique{Type: cfg.Type, Valeur: cfg.Valeur, Devise: cfg.Devise})
	}
	return utils.OK(c, out)
}

type entreeConfig struct {
	Type   string          `json:"type" validate:"required,oneof=commission_defi mise_minimale mise_maximale frais_retrait delai_confirmation_minutes delai_preuve_minutes delai_choix_nul_minutes"`
	Valeur decimal.Decimal `json:"valeur"`
}

// ModifierConfiguration godoc
// @Summary Modifier une configuration financière (admin) — historisé
// @Tags administration
// @Security BearerAuth
// @Router /administration/configurations-financieres [patch]
func ModifierConfiguration(c fiber.Ctx) error {
	adminID := auth_UtilisateurID(c)
	var in entreeConfig
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}

	maintenant := time.Now().UTC()
	var nouvelle ConfigurationFinanciere
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var ancienne ConfigurationFinanciere
		ancienneExiste := tx.Where("type = ? AND statut = ?", in.Type, "actif").
			Order("date_debut DESC").First(&ancienne).Error == nil

		// Clôturer l'ancienne valeur active.
		tx.Model(&ConfigurationFinanciere{}).
			Where("type = ? AND statut = ?", in.Type, "actif").
			Updates(map[string]any{"statut": "inactif", "date_fin": maintenant})

		nouvelle = ConfigurationFinanciere{
			Type: in.Type, Valeur: in.Valeur, Devise: "XOF",
			Statut: "actif", DateDebut: maintenant,
		}
		if err := tx.Create(&nouvelle).Error; err != nil {
			return err
		}
		var ancVal any
		if ancienneExiste {
			ancVal = ancienne.Valeur
		}
		Journaliser(tx, ParamsAudit{
			AdministrateurID: &adminID, Action: "configuration:modification",
			TableCible: "configurations_financieres", IdentifiantCible: &nouvelle.ID,
			Ancienne: ancVal, Nouvelle: in.Valeur, AdresseIP: c.IP(),
		})
		return nil
	})
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "modification impossible")
	}
	return utils.OK(c, nouvelle)
}

// ListerJournauxAudit godoc
// @Summary Journal d'audit (admin, lecture seule) — paginé, 10 par page, plus récents d'abord
// @Tags administration
// @Security BearerAuth
// @Param page query int false "Page (défaut 1)"
// @Param taille query int false "Éléments par page (1..100, défaut 10)"
// @Param action query string false "Filtre exact sur l'action (ex. litige:decision)"
// @Success 200 {object} utils.Page[JournalAudit]
// @Router /administration/journaux-audit [get]
func ListerJournauxAudit(c fiber.Ctx) error {
	page, taille, offset := utils.Pagination(c)
	q := config.DB.Model(&JournalAudit{})
	if a := c.Query("action"); a != "" {
		q = q.Where("action = ?", a)
	}
	q = q.Session(&gorm.Session{}) // base réutilisable : un COUNT puis un SELECT paginé
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	liste := []JournalAudit{}
	if err := q.Order("date_creation DESC").Limit(taille).Offset(offset).Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	return utils.OK(c, utils.NouvellePage(liste, total, page, taille))
}

// auth_UtilisateurID lit l'id admin depuis les Locals sans importer le package auth
// (évite tout cycle) : la clé est la même chaîne que celle posée par le middleware.
func auth_UtilisateurID(c fiber.Ctx) uuid.UUID {
	if v, ok := c.Locals("utilisateurID").(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}
