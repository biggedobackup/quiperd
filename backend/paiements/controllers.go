package paiements

import (
	"encoding/json"
	"fmt"
	"strings"

	"defisenligne/backend/administration"
	"defisenligne/backend/auth"
	"defisenligne/backend/config"
	"defisenligne/backend/portefeuilles"
	"defisenligne/backend/tempsreel"
	"defisenligne/backend/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type entreeDepot struct {
	Montant     decimal.Decimal `json:"montant"`
	Prestataire string          `json:"prestataire" validate:"required,oneof=ligdicash fusionmoney"`
	Numero      string          `json:"numero"`
}

// Depot godoc
// @Summary Dépôt via LigdiCash/MoneyFusion
// @Tags paiements
// @Security BearerAuth
// @Router /paiements/depot [post]
// montantEntier vérifie qu'un montant tient en francs CFA entiers.
//
// Le XOF n'a pas de subdivision en usage, et MoneyFusion n'accepte qu'un
// `totalPrice` entier : accepter 100,6 reviendrait à faire payer 101 au joueur
// pour ne lui en créditer que 100,6. On refuse à la porte plutôt que d'arrondir
// en silence — sur une plateforme d'argent réel, un écart, même de 0,4, est une
// anomalie comptable.
func montantEntier(m decimal.Decimal) bool { return m.Equal(m.Truncate(0)) }

func Depot(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	var in entreeDepot
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	if in.Montant.LessThanOrEqual(decimal.Zero) {
		return utils.Erreur(c, fiber.StatusBadRequest, "le montant doit être positif")
	}
	if !montantEntier(in.Montant) {
		return utils.ErreurValidation(c, "validation échouée",
			map[string]string{"montant": "le montant doit être un nombre entier de FCFA"})
	}
	if !config.Cfg.PrestataireActif(in.Prestataire) || !prestataireConfigure(in.Prestataire) {
		return utils.Erreur(c, fiber.StatusBadRequest, "prestataire indisponible")
	}
	if mini := montantMinimumPrestataire(in.Prestataire); in.Montant.LessThan(decimal.NewFromInt(mini)) {
		return utils.ErreurValidation(c, "validation échouée", map[string]string{
			"montant": fmt.Sprintf("minimum %d FCFA pour ce moyen de paiement", mini),
		})
	}
	// MoneyFusion exige le téléphone du payeur dès la création : sans lui, la
	// passerelle refuse et le joueur se retrouve devant un dépôt sans page de
	// paiement (skill FusionMoney §2).
	if in.Prestataire == PrestataireFusionMoney && strings.TrimSpace(in.Numero) == "" {
		return utils.ErreurValidation(c, "validation échouée",
			map[string]string{"numero": "numéro Mobile Money requis pour MoneyFusion"})
	}
	u, err := auth.TrouverUtilisateur(userID)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "utilisateur introuvable")
	}
	p, urlPaiement, err := Deposer(userID, in.Montant, in.Prestataire, u.NomUtilisateur, u.Email, in.Numero)
	if err != nil {
		// La passerelle a refusé : le dépôt n'aboutira jamais. On le clôt et on le
		// dit, au lieu de renvoyer un « en attente de confirmation » qui laisse le
		// joueur guetter un solde qui n'arrivera pas.
		if p != nil {
			_ = AppliquerEchecDepot(p.ID, "refus à la création: "+err.Error())
		}
		return utils.Erreur(c, fiber.StatusBadGateway,
			"Le paiement n'a pas pu être ouvert chez le prestataire. Réessayez dans un instant.")
	}
	reponse := fiber.Map{"paiement": p}
	if urlPaiement != "" {
		reponse["urlPaiement"] = urlPaiement
	} else {
		reponse["message"] = "Paiement créé. En attente de confirmation du prestataire."
	}
	return utils.OK(c, reponse, fiber.StatusCreated)
}

type entreeRetrait struct {
	Montant     decimal.Decimal `json:"montant"`
	Prestataire string          `json:"prestataire" validate:"required,oneof=ligdicash fusionmoney"`
	Numero      string          `json:"numero" validate:"required"`
}

// Retrait godoc
// @Summary Retrait vers Mobile Money
// @Tags paiements
// @Security BearerAuth
// @Router /paiements/retrait [post]
func Retrait(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	var in entreeRetrait
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	if in.Montant.LessThanOrEqual(decimal.Zero) {
		return utils.Erreur(c, fiber.StatusBadRequest, "le montant doit être positif")
	}
	if !montantEntier(in.Montant) {
		return utils.ErreurValidation(c, "validation échouée",
			map[string]string{"montant": "le montant doit être un nombre entier de FCFA"})
	}
	if !config.Cfg.PrestataireActif(in.Prestataire) {
		return utils.Erreur(c, fiber.StatusBadRequest, "prestataire indisponible")
	}
	p, err := Retirer(userID, in.Montant, in.Prestataire, in.Numero)
	if err == portefeuilles.ErrSoldeInsuffisant {
		return utils.Erreur(c, fiber.StatusUnprocessableEntity, "solde disponible insuffisant")
	}
	// Message distinct du solde insuffisant : le joueur a l'argent, il ne l'a pas encore
	// engagé. Lui dire « solde insuffisant » alors qu'il voit son solde serait incompréhensible.
	if err == portefeuilles.ErrDepotNonJoue {
		return utils.Erreur(c, fiber.StatusUnprocessableEntity,
			"un dépôt doit d'abord être joué en défi avant de pouvoir être retiré : seul le solde retirable peut partir")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "demande de retrait impossible")
	}
	return utils.OK(c, p, fiber.StatusCreated)
}

// CallbackLigdicash godoc
// @Summary Webhook LigdiCash (public)
// @Tags paiements
// @Router /paiements/callback-ligdicash [post]
func CallbackLigdicash(c fiber.Ctx) error {
	brut := string(c.Body())
	// Journaliser le callback brut immédiatement (traçabilité litiges).
	config.DB.Create(&PaiementEvenement{Prestataire: PrestataireLigdicash, Source: "callback", Corps: brut})

	transactionID := extraireTransactionID(c, brut)
	// Répondre 200 immédiatement ; traitement en arrière-plan (jamais de confirm bloquant ici).
	if transactionID != "" {
		go TraiterCallbackLigdicash(transactionID)
	}
	return c.SendStatus(fiber.StatusOK)
}

// CallbackFusion godoc
// @Summary Webhook MoneyFusion (public)
// @Tags paiements
// @Router /paiements/callback-fusion [post]
func CallbackFusion(c fiber.Ctx) error {
	brut := string(c.Body())
	config.DB.Create(&PaiementEvenement{Prestataire: PrestataireFusionMoney, Source: "callback", Corps: brut})

	ref, token := extraireReferenceFusion(c, brut)
	if ref != "" || token != "" {
		go TraiterCallbackFusion(ref, token)
	}
	return c.SendStatus(fiber.StatusOK)
}

type entreeStatut struct {
	Statut string `json:"statut" validate:"required,oneof=reussi echoue rembourse"`
}

// ChangerStatut godoc
// @Summary Validation/échec/remboursement manuel (admin)
// @Tags paiements
// @Security BearerAuth
// @Router /paiements/{id}/statut [patch]
func ChangerStatut(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	adminID := auth.UtilisateurIDDe(c)
	var in entreeStatut
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	var p Paiement
	if err := config.DB.First(&p, "id = ?", id).Error; err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "paiement introuvable")
	}

	// Dépôt validé manuellement → crédit idempotent.
	if in.Statut == StatutReussi && p.Type == TypeDepot {
		if err := AppliquerReussiteDepot(id, p.Montant, "validation_manuelle"); err != nil {
			return utils.Erreur(c, fiber.StatusConflict, err.Error())
		}
		return utils.OK(c, fiber.Map{"statut": StatutReussi})
	}

	tampon := tempsreel.NouveauTampon()
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		references := []string{p.Reference, p.Reference + "-FRAIS"}
		switch {
		case in.Statut == StatutReussi && p.Type == TypeRetrait && p.Statut == StatutEnAttente:
			// Retrait effectué → les mouvements (retrait + frais) deviennent définitifs.
			if err := portefeuilles.ValiderRetrait(tx, p.Reference); err != nil {
				return err
			}
		case in.Statut == StatutEchoue && p.Type == TypeRetrait && p.Statut == StatutEnAttente:
			// Retrait échoué → recréditer montant + frais réservés.
			if err := portefeuilles.AnnulerRetrait(tx, p.UtilisateurID, p.Reference, p.Montant.Add(p.Frais)); err != nil {
				return err
			}
			references = append(references, p.Reference+"-REFUND")
		case in.Statut == StatutRembourse && p.Type == TypeDepot && p.Statut == StatutReussi:
			// Remboursement d'un dépôt déjà crédité → débit inverse.
			if err := portefeuilles.Debiter(tx, p.UtilisateurID, p.Montant, p.Reference+"-REVERSE", "Remboursement de dépôt"); err != nil {
				return err
			}
			references = append(references, p.Reference+"-REVERSE")
		}
		if err := tx.Model(&Paiement{}).Where("id = ?", id).Update("statut", in.Statut).Error; err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			AdministrateurID: &adminID, Action: "paiement:statut_" + in.Statut, TableCible: "paiements",
			IdentifiantCible: &id,
		})
		AjouterStatut(tampon, &p, in.Statut)
		portefeuilles.AjouterTransactionsReferences(tx, tampon, references...)
		portefeuilles.AjouterEtat(tx, tampon, p.UtilisateurID)
		return nil
	})
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "mise à jour impossible")
	}
	tampon.Diffuser()
	// Après le commit seulement : le joueur ne doit jamais être prévenu d'un virement
	// que la base pourrait encore annuler.
	NotifierIssueRetraitParCourriel(&p, in.Statut)
	return utils.OK(c, fiber.Map{"statut": in.Statut})
}

// Lister godoc
// @Summary Suivi des paiements (admin) — paginé, 10 par page, plus récents d'abord
// @Tags paiements
// @Security BearerAuth
// @Param page query int false "Page (défaut 1)"
// @Param taille query int false "Éléments par page (1..100, défaut 10)"
// @Param type query string false "depot | retrait"
// @Param statut query string false "en_attente | reussi | echoue | rembourse"
// @Success 200 {object} utils.Page[Paiement]
// @Router /paiements [get]
func Lister(c fiber.Ctx) error {
	page, taille, offset := utils.Pagination(c)
	q := config.DB.Model(&Paiement{})
	if t := c.Query("type"); t != "" {
		q = q.Where("type = ?", t)
	}
	if s := c.Query("statut"); s != "" {
		q = q.Where("statut = ?", s)
	}
	q = q.Session(&gorm.Session{}) // base réutilisable : un COUNT puis un SELECT paginé
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	liste := []Paiement{}
	if err := q.Order("date_creation DESC").Limit(taille).Offset(offset).Find(&liste).Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture impossible")
	}
	return utils.OK(c, utils.NouvellePage(liste, total, page, taille))
}

// extraireTransactionID cherche transaction_id dans le form (aplati) puis dans le JSON.
func extraireTransactionID(c fiber.Ctx, brut string) string {
	if v := c.FormValue("transaction_id"); v != "" {
		return v
	}
	if v := c.FormValue("custom_data[transaction_id]"); v != "" {
		return v
	}
	var corps struct {
		TransactionID string `json:"transaction_id"`
		CustomData    struct {
			TransactionID string `json:"transaction_id"`
		} `json:"custom_data"`
	}
	if err := json.Unmarshal([]byte(brut), &corps); err == nil {
		if corps.CustomData.TransactionID != "" {
			return corps.CustomData.TransactionID
		}
		return corps.TransactionID
	}
	return ""
}

// extraireReferenceFusion cherche NOTRE référence dans `personal_Info`, et à
// défaut le `tokenPay` du prestataire.
//
// `personal_Info` est le seul moyen fiable de retrouver notre paiement, mais il
// est renvoyé « tel quel » par MoneyFusion : rien ne garantit sa présence dans
// chaque événement. Le token, lui, est stocké sur la ligne à la création — il
// fait un repli sûr (skill FusionMoney §5).
func extraireReferenceFusion(c fiber.Ctx, brut string) (reference, tokenPay string) {
	var corps struct {
		PersonalInfo []struct {
			Reference string `json:"reference"`
		} `json:"personal_Info"`
		TokenPay string `json:"tokenPay"`
		Token    string `json:"token"`
	}
	if err := json.Unmarshal([]byte(brut), &corps); err == nil {
		if len(corps.PersonalInfo) > 0 {
			reference = corps.PersonalInfo[0].Reference
		}
		tokenPay = corps.TokenPay
		if tokenPay == "" {
			tokenPay = corps.Token
		}
	}
	if reference == "" {
		reference = c.FormValue("personal_Info[0][reference]")
	}
	if tokenPay == "" {
		tokenPay = c.FormValue("tokenPay")
	}
	return reference, tokenPay
}

// PrestatairePublic décrit un moyen de paiement réellement proposable au joueur.
type PrestatairePublic struct {
	Code    string `json:"code"`
	Libelle string `json:"libelle"`
	// NumeroRequis : MoneyFusion exige `numeroSend` à la création du paiement ;
	// LigdiCash collecte le numéro sur sa propre page.
	NumeroRequis bool `json:"numeroRequis"`
	// MontantMinimum : plancher IMPOSÉ PAR LA PASSERELLE, en francs entiers.
	// Sous ce seuil, la création est refusée par le prestataire et le joueur se
	// retrouverait avec un dépôt « en attente » que rien ne confirmera jamais :
	// les clients s'en servent pour valider avant l'envoi.
	MontantMinimum int64 `json:"montantMinimum"`
}

// montantMinimumPrestataire : plancher constaté auprès de chaque passerelle.
//
// MoneyFusion refuse la création sous 200 F (« Montant doit etre supérieur a
// 200 F » — 200 passe, 100 non, vérifié contre la vraie passerelle). Le
// plancher applicatif de Défis en Ligne (100 F) est plus bas : sans ce contrôle, un
// dépôt de 100 F par MoneyFusion partirait en silence dans le vide.
func montantMinimumPrestataire(code string) int64 {
	if code == PrestataireFusionMoney {
		return 200
	}
	return 100
}

// prestataireConfigure dit si les identifiants du prestataire sont réellement
// présents. Un prestataire activé mais non configuré crée un paiement que rien
// ne viendra jamais confirmer : le joueur attend un solde qui n'arrivera pas.
func prestataireConfigure(code string) bool {
	cfg := config.Cfg
	switch code {
	case PrestataireLigdicash:
		return cfg.LigdicashAPIKey != "" && cfg.LigdicashAPIToken != ""
	case PrestataireFusionMoney:
		return cfg.FusionMoneyAPIURL != ""
	}
	return false
}

// ListerPrestataires godoc
// @Summary Moyens de paiement disponibles (public) — activés ET configurés
// @Description Les clients n'affichent que cette liste : proposer un prestataire indisponible mène le joueur dans une impasse.
// @Tags paiements
// @Success 200 {array} PrestatairePublic
// @Router /paiements/prestataires [get]
func ListerPrestataires(c fiber.Ctx) error {
	catalogue := []PrestatairePublic{
		{Code: PrestataireLigdicash, Libelle: "LigdiCash", NumeroRequis: false,
			MontantMinimum: montantMinimumPrestataire(PrestataireLigdicash)},
		{Code: PrestataireFusionMoney, Libelle: "MoneyFusion", NumeroRequis: true,
			MontantMinimum: montantMinimumPrestataire(PrestataireFusionMoney)},
	}
	out := make([]PrestatairePublic, 0, len(catalogue))
	for _, p := range catalogue {
		if config.Cfg.PrestataireActif(p.Code) && prestataireConfigure(p.Code) {
			out = append(out, p)
		}
	}
	return utils.OK(c, out)
}

// Enregistrer monte les routes des paiements.
func Enregistrer(api fiber.Router) {
	// Webhooks publics (aucune authentification, réponse 200 immédiate).
	api.Post("/paiements/callback-ligdicash", CallbackLigdicash)
	api.Post("/paiements/callback-fusion", CallbackFusion)
	// Catalogue public des moyens de paiement, déclaré AVANT le groupe protégé :
	// Fiber parcourt la pile dans l'ordre (même schéma que jeux/plateformes).
	api.Get("/paiements/prestataires", ListerPrestataires)

	grp := api.Group("/paiements", auth.Connecte())
	// Le DÉPÔT reste ouvert même sans adresse confirmée : faire entrer de l'argent ne
	// présente pas le même risque, et bloquer un dépôt frustrerait le joueur pour rien.
	grp.Post("/depot", Depot)
	grp.Post("/retrait", auth.EmailConfirme(), Retrait)
	grp.Get("/", auth.AdminSeul(), Lister)
	grp.Patch("/:id/statut", auth.AdminSeul(), ChangerStatut)
}
