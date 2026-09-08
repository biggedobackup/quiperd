// Package classement produit le tableau des meilleurs joueurs, dérivé des matchs
// réellement terminés et des gains réellement crédités — aucune donnée n'est stockée
// pour ce classement, il est recalculé à la lecture.
//
// L'écran « Classement » de l'application mobile en est le seul consommateur pour le
// moment ; l'endpoint est public (comme le catalogue) afin qu'un visiteur puisse voir
// le haut du tableau, et il ajoute la ligne du joueur connecté quand un jeton est
// présent — sans quoi un joueur classé 32e n'aurait aucun moyen de se situer.
package classement

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"defisenligne/backend/auth"
	"defisenligne/backend/config"
	"defisenligne/backend/utils"
)

// Périodes acceptées par `?periode=`. Elles bornent la date de FIN du match : un match
// commencé la semaine dernière et réglé aujourd'hui compte pour la semaine en cours,
// ce qui est bien ce qu'un joueur attend d'un classement hebdomadaire.
const (
	PeriodeGeneral = "general"
	PeriodeMois    = "mois"
	PeriodeSemaine = "semaine"
)

// Ligne est une entrée du classement. `gains` est la somme des transactions de type
// `gain` (l'argent réellement crédité), pas le total des mises engagées.
type Ligne struct {
	Rang           int             `json:"rang"`
	UtilisateurID  uuid.UUID       `json:"utilisateurId"`
	NomUtilisateur string          `json:"nomUtilisateur"`
	PhotoProfil    string          `json:"photoProfil"`
	Pays           string          `json:"pays"`
	Matchs         int             `json:"matchs"`
	Victoires      int             `json:"victoires"`
	Gains          decimal.Decimal `json:"gains"`
	Devise         string          `json:"devise"`
}

// Reponse : le haut du tableau, et la ligne du joueur connecté s'il n'y figure pas déjà.
type Reponse struct {
	Periode  string  `json:"periode"`
	Elements []Ligne `json:"elements"`
	Moi      *Ligne  `json:"moi,omitempty"`
}

// debutPeriode renvoie la borne basse de la période, ou le zéro time pour « général ».
func debutPeriode(periode string) time.Time {
	maintenant := time.Now().UTC()
	switch periode {
	case PeriodeSemaine:
		// Semaine ISO : lundi 00:00 UTC. `Weekday()` vaut 0 le dimanche, qu'on ramène à 7.
		jour := int(maintenant.Weekday())
		if jour == 0 {
			jour = 7
		}
		debut := maintenant.AddDate(0, 0, -(jour - 1))
		return time.Date(debut.Year(), debut.Month(), debut.Day(), 0, 0, 0, 0, time.UTC)
	case PeriodeMois:
		return time.Date(maintenant.Year(), maintenant.Month(), 1, 0, 0, 0, 0, time.UTC)
	default:
		return time.Time{}
	}
}

func normaliserPeriode(valeur string) string {
	switch valeur {
	case PeriodeMois, PeriodeSemaine:
		return valeur
	default:
		return PeriodeGeneral
	}
}

// requete assemble le classement en une seule passe SQL : les matchs terminés de la
// période sont dépliés côté joueur 1 puis joueur 2 (UNION ALL), agrégés par joueur, et
// joints aux gains crédités sur la même période. Faire cela en Go demanderait de
// rapatrier tous les matchs de la plateforme à chaque ouverture de l'écran.
const requete = `
WITH bornes AS (SELECT CAST(? AS timestamptz) AS depuis),
participations AS (
    SELECT m.joueur_1_id AS utilisateur_id,
           CASE WHEN m.gagnant_id = m.joueur_1_id THEN 1 ELSE 0 END AS victoire
      FROM matchs m, bornes b
     WHERE m.statut = 'termine' AND m.date_fin IS NOT NULL
       AND (b.depuis IS NULL OR m.date_fin >= b.depuis)
    UNION ALL
    SELECT m.joueur_2_id AS utilisateur_id,
           CASE WHEN m.gagnant_id = m.joueur_2_id THEN 1 ELSE 0 END AS victoire
      FROM matchs m, bornes b
     WHERE m.statut = 'termine' AND m.date_fin IS NOT NULL
       AND (b.depuis IS NULL OR m.date_fin >= b.depuis)
),
totaux AS (
    SELECT utilisateur_id, COUNT(*) AS matchs, SUM(victoire) AS victoires
      FROM participations
     GROUP BY utilisateur_id
),
gains AS (
    SELECT p.utilisateur_id, COALESCE(SUM(t.montant), 0) AS gains
      FROM transactions_portefeuilles t
      JOIN portefeuilles p ON p.id = t.portefeuille_id, bornes b
     WHERE t.type = 'gain' AND t.statut = 'valide'
       AND (b.depuis IS NULL OR t.date_creation >= b.depuis)
     GROUP BY p.utilisateur_id
)
SELECT u.id AS utilisateur_id, u.nom_utilisateur, u.photo_profil, u.pays,
       t.matchs, t.victoires, COALESCE(g.gains, 0) AS gains,
       COALESCE(pf.devise, 'XOF') AS devise
  FROM totaux t
  JOIN utilisateurs u ON u.id = t.utilisateur_id
  LEFT JOIN gains g ON g.utilisateur_id = t.utilisateur_id
  LEFT JOIN portefeuilles pf ON pf.utilisateur_id = t.utilisateur_id
 WHERE u.statut <> 'supprime'
 ORDER BY gains DESC, t.victoires DESC, t.matchs ASC, u.nom_utilisateur ASC`

// Lister godoc
// @Summary Classement des joueurs (public)
// @Description Classement par gains crédités sur la période. `moi` n'est renseigné que si un jeton joueur est présent ET que le joueur ne figure pas déjà dans `elements`.
// @Tags classement
// @Param periode query string false "general (défaut), mois ou semaine"
// @Param limite query int false "Nombre de lignes renvoyées (1..100, défaut 50)"
// @Success 200 {object} Reponse
// @Router /classement [get]
func Lister(c fiber.Ctx) error {
	periode := normaliserPeriode(c.Query("periode"))
	limite, _ := strconv.Atoi(c.Query("limite", "50"))
	if limite <= 0 || limite > 100 {
		limite = 50
	}

	var depuis *time.Time
	if d := debutPeriode(periode); !d.IsZero() {
		depuis = &d
	}

	lignes, err := classementDeLaPeriode(periode, depuis)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "lecture du classement impossible")
	}

	reponse := Reponse{Periode: periode, Elements: lignes}

	// Ligne du joueur connecté : utile seulement s'il est hors du haut de tableau renvoyé.
	if moiID := auth.UtilisateurIDDe(c); moiID != uuid.Nil {
		for i := range lignes {
			if lignes[i].UtilisateurID == moiID {
				if i >= limite {
					ligne := lignes[i]
					reponse.Moi = &ligne
				}
				break
			}
		}
	}

	if len(reponse.Elements) > limite {
		reponse.Elements = reponse.Elements[:limite]
	}
	return utils.OK(c, reponse)
}

// dureeCacheClassement : le classement est le même pour tout le monde et n'a aucun
// besoin d'être à la seconde près. Une minute suffit à ce qu'un joueur voie sa
// progression après un match, et évite de refaire l'agrégat à chaque visiteur.
const dureeCacheClassement = 60 * time.Second

func cleCacheClassement(periode string) string { return "classement:" + periode }

// classementDeLaPeriode renvoie le tableau complet, depuis Redis quand il y est.
//
// La requête agrège TOUS les matchs terminés et TOUTES les transactions de gain :
// son coût grandit avec l'historique, pas avec le nombre de lignes affichées. La
// mettre en cache une minute est ce qui empêche le classement de devenir la page
// la plus lourde du site le jour où il y aura cent mille matchs. La ligne « moi »
// est calculée après coup, à partir du même tableau : elle ne dépend d'aucune
// requête supplémentaire, donc le cache reste commun à tous les visiteurs.
func classementDeLaPeriode(periode string, depuis *time.Time) ([]Ligne, error) {
	ctx, annuler := context.WithTimeout(context.Background(), 2*time.Second)
	defer annuler()
	cle := cleCacheClassement(periode)

	if brut, err := config.Redis.Get(ctx, cle).Bytes(); err == nil && len(brut) > 0 {
		var lignes []Ligne
		if json.Unmarshal(brut, &lignes) == nil {
			return lignes, nil
		}
	}

	lignes := []Ligne{}
	if err := config.DB.Raw(requete, depuis).Scan(&lignes).Error; err != nil {
		return nil, err
	}
	for i := range lignes {
		lignes[i].Rang = i + 1
	}
	if brut, err := json.Marshal(lignes); err == nil {
		config.Redis.Set(ctx, cle, brut, dureeCacheClassement)
	}
	return lignes, nil
}

// Enregistrer monte la route publique du classement. `auth.Optionnel()` : un visiteur
// voit le tableau, un joueur connecté y trouve en plus sa propre ligne.
func Enregistrer(api fiber.Router) {
	api.Get("/classement", auth.Optionnel(), Lister)
}
