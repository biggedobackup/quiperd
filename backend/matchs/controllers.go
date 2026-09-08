package matchs

import (
	"errors"

	"defisenligne/backend/auth"
	"defisenligne/backend/config"
	"defisenligne/backend/tempsreel"
	"defisenligne/backend/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Lister godoc
// @Summary Mes matchs (tableau, ?statut=en_cours|preuve_requise|nul_en_attente|litige|termine) ; admin ?tous=1 : page utils.Page[MatchEnrichi] (10/page, ?page&taille)
// @Tags matchs
// @Security BearerAuth
// @Param statut query string false "en_cours | preuve_requise | nul_en_attente | litige | termine (verification : lignes historiques)"
// @Param tous query int false "Admin : 1 = tous les matchs, réponse paginée"
// @Param page query int false "Admin (?tous=1) : page, défaut 1"
// @Param taille query int false "Admin (?tous=1) : éléments par page, 1..100, défaut 10"
// @Success 200 {array} MatchEnrichi
// @Router /matchs [get]
func Lister(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	if auth.EstAdmin(c) && c.Query("tous") == "1" {
		// Administration : tous les matchs, enveloppe paginée (charte API).
		page, taille, offset := utils.Pagination(c)
		liste, total, err := ListerTous(config.DB, c.Query("statut"), taille, offset)
		if err != nil {
			return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des matchs impossible")
		}
		return utils.OK(c, utils.NouvellePage(liste, total, page, taille))
	}
	liste, err := ListerPourJoueur(config.DB, userID, c.Query("statut"), false)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture des matchs impossible")
	}
	return utils.OK(c, liste)
}

// Detail godoc
// @Summary Détail d'un match (libellés joueurs/jeu/plateforme + déclarations + choix de nul)
// @Tags matchs
// @Security BearerAuth
// @Router /matchs/{id} [get]
func Detail(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	m, err := ChargerEnrichi(config.DB, id)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	userID := auth.UtilisateurIDDe(c)
	if !auth.EstAdmin(c) && !m.EstParticipant(userID) {
		return utils.Erreur(c, fiber.StatusForbidden, "ce match ne vous concerne pas")
	}
	// Toutes les manches sont renvoyées (chaque ligne porte sa `manche`) : le client
	// filtre sur match.manche pour l'état courant et garde l'historique des rejeux.
	decls := []ResultatDeclare{}
	config.DB.Where("match_id = ?", id).Order("manche ASC, date_declaration ASC").Find(&decls)
	choix := []ChoixNul{}
	config.DB.Where("match_id = ?", id).Order("manche ASC, date_choix ASC").Find(&choix)
	return utils.OK(c, fiber.Map{"match": m, "declarations": decls, "choixNuls": choix})
}

// entreeDeclaration : une déclaration de fin de match, la même pour TOUS les jeux.
//
// Le joueur désigne l'issue — `gagne`, `perdu` ou `nul` — et rien d'autre. Un score chiffré
// n'aurait de sens que sur une partie du catalogue (un combat, une course ou une partie de
// cartes n'en produit pas), et le demander obligeait le joueur à inventer un « 1-0 » ; une
// forme unique évite au passage d'avoir à deviner, écran par écran, ce que le jeu attend.
// Qui tient à noter le score de sa partie l'écrit dans le commentaire libre.
type entreeDeclaration struct {
	Resultat    string `json:"resultat" validate:"required,oneof=gagne perdu nul"`
	Commentaire string `json:"commentaire"`
}

// scores traduit l'issue déclarée en couple (pour, contre).
//
// Toute la machine à états — concordance, confirmation en miroir, match nul — continue de
// raisonner sur des nombres ; un seul endroit connaît la traduction. Ces 1-0 / 0-1 / 0-0 sont
// une convention interne : aucun écran, aucune notification ne les montre au joueur.
func (in entreeDeclaration) scores() (pour, contre int) {
	switch in.Resultat {
	case "gagne":
		return 1, 0
	case "perdu":
		return 0, 1
	default:
		return 0, 0
	}
}

// Declarer godoc
// @Summary Déclarer l'issue d'un match — gagne, perdu ou nul (première déclaration : chrono de confirmation ; seconde : règlement immédiat, nul ou désaccord)
// @Tags matchs
// @Security BearerAuth
// @Router /matchs/{id}/declaration [post]
func Declarer(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)
	var in entreeDeclaration
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	pour, contre := in.scores()

	return executerSurMatch(c, id, func(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi) error {
		return EnregistrerDeclaration(tx, tampon, m, userID, pour, contre, in.Commentaire)
	})
}

// Confirmer godoc
// @Summary Confirmer le score proposé par l'adversaire — le serveur inscrit la déclaration miroir (aucun chiffre envoyé par le client) et règle le match
// @Tags matchs
// @Security BearerAuth
// @Router /matchs/{id}/confirmation [post]
func Confirmer(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)
	return executerSurMatch(c, id, func(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi) error {
		return ConfirmerScore(tx, tampon, m, userID)
	})
}

type entreeChoixNul struct {
	Choix string `json:"choix" validate:"required,oneof=rejouer partager"`
}

// ChoisirApresNul godoc
// @Summary Après un nul déclaré des deux côtés : rejouer (si les DEUX l'acceptent, aucun mouvement d'argent) ou partager (chacun mise × (1 − commission))
// @Tags matchs
// @Security BearerAuth
// @Router /matchs/{id}/choix-nul [post]
func ChoisirApresNul(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	userID := auth.UtilisateurIDDe(c)
	var in entreeChoixNul
	if err := c.Bind().Body(&in); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "corps de requête invalide")
	}
	if d := utils.Valider(in); d != nil {
		return utils.ErreurValidation(c, "validation échouée", d)
	}
	return executerSurMatch(c, id, func(tx *gorm.DB, tampon *tempsreel.Tampon, m *MatchDefi) error {
		return EnregistrerChoixNul(tx, tampon, m, userID, in.Choix)
	})
}

// refusMetier énumère les REFUS de la machine à états : ils décrivent un état du match
// incompatible avec l'action demandée, sont sans gravité et se lisent tels quels par le
// joueur (409). Toute erreur absente de cette liste est un incident serveur, jamais un
// conflit — c'est ce qui distingue « vous avez déjà déclaré » d'une panne de base.
var refusMetier = []error{
	ErrPasEnCours, ErrDejaDeclare, ErrRienAConfirmer,
	ErrPasEnNul, ErrDejaChoisi, ErrEtatIncoherent,
}

func estRefusMetier(err error) bool {
	for _, refus := range refusMetier {
		if errors.Is(err, refus) {
			return true
		}
	}
	return false
}

// executerSurMatch applique une action de la machine à états : verrou de la ligne match,
// action dans une transaction, diffusion temps réel APRÈS le commit (jamais avant), puis
// renvoi de l'état à jour du match.
func executerSurMatch(c fiber.Ctx, id uuid.UUID, action func(*gorm.DB, *tempsreel.Tampon, *MatchDefi) error) error {
	tampon := tempsreel.NouveauTampon()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		m, err := ChargerVerrouille(tx, id)
		if err != nil {
			return err
		}
		return action(tx, tampon, m)
	})
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	case errors.Is(err, ErrNonParticipant):
		return utils.Erreur(c, fiber.StatusForbidden, ErrNonParticipant.Error())
	case estRefusMetier(err):
		return utils.Erreur(c, fiber.StatusConflict, err.Error())
	case err != nil:
		// Panne base, contrainte violée, incohérence interne : c'est un défaut du serveur.
		// La renvoyer en 409 ferait croire au joueur qu'il lui suffit de recharger, et
		// masquerait l'incident dans les journaux comme dans les recettes.
		utils.Log.Error("action sur match impossible",
			zap.String("matchId", id.String()), zap.Error(err))
		return utils.Erreur(c, fiber.StatusInternalServerError, "action impossible sur ce match")
	}
	tampon.Diffuser()
	m, err := Charger(config.DB, id)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	return utils.OK(c, m)
}

// Valider godoc
// @Summary Valider un match (admin) — règlement de l'escrow d'une ligne en vérification ou d'un match en litige dont le gagnant est désigné
// @Tags matchs
// @Security BearerAuth
// @Router /matchs/{id}/validation [post]
func Valider(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	arbitre := auth.UtilisateurIDDe(c)
	m, err := ValiderMatch(id, &arbitre)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return utils.Erreur(c, fiber.StatusNotFound, "match introuvable")
	}
	if err != nil {
		return utils.Erreur(c, fiber.StatusConflict, err.Error())
	}
	return utils.OK(c, m)
}

// Enregistrer monte les routes des matchs.
func Enregistrer(api fiber.Router) {
	grp := api.Group("/matchs", auth.Connecte())
	grp.Get("/", Lister)
	grp.Get("/:id", Detail)
	grp.Post("/:id/declaration", Declarer)
	grp.Post("/:id/confirmation", Confirmer)
	grp.Post("/:id/choix-nul", ChoisirApresNul)
	grp.Post("/:id/validation", auth.AdminSeul(), Valider)
}
