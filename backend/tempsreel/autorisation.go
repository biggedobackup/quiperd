package tempsreel

import (
	"strings"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"defisenligne/backend/config"
)

// Préfixes des salons paramétrés (cf. SalonUtilisateur / SalonMatch).
const (
	prefixeSalonUtilisateur = "utilisateur:"
	prefixeSalonMatch       = "match:"
)

func estSalonMatch(salon string) bool { return strings.HasPrefix(salon, prefixeSalonMatch) }

// autoriserSalon décide si la session (utilisateur + rôle) a le droit de
// s'abonner au salon demandé. Le contrôle est refait à CHAQUE abonnement :
// un client ne gagne jamais un salon en le redemandant.
//
//   - public:defis      → tout le monde, visiteurs compris ;
//   - admin             → administrateurs seulement ;
//   - utilisateur:<id>  → uniquement l'utilisateur <id> lui-même ;
//   - match:<id>        → les deux joueurs du match, ou un administrateur ;
//   - tout le reste     → refusé (aucun salon « inventé » n'est accepté).
func autoriserSalon(utilisateurID uuid.UUID, role, salon string) bool {
	switch {
	case salon == SalonDefisPublics:
		return true

	case salon == SalonAdmin:
		return role == RoleAdmin

	case strings.HasPrefix(salon, prefixeSalonUtilisateur):
		if utilisateurID == uuid.Nil {
			return false
		}
		id, err := uuid.Parse(strings.TrimPrefix(salon, prefixeSalonUtilisateur))
		return err == nil && id == utilisateurID

	case estSalonMatch(salon):
		matchID, err := uuid.Parse(strings.TrimPrefix(salon, prefixeSalonMatch))
		if err != nil {
			return false
		}
		if role == RoleAdmin {
			return true
		}
		if utilisateurID == uuid.Nil {
			return false
		}
		return estJoueurDuMatch(matchID, utilisateurID)

	default:
		return false
	}
}

// estJoueurDuMatch interroge directement la table `matchs` : le paquet tempsreel
// n'importe aucun module métier (règle d'import), la vérification passe donc par
// une requête SQL brute. Les colonnes sont celles de l'annexe du skill backend
// (`joueur_1_id`, `joueur_2_id`) — surtout pas les noms dérivés par GORM.
func estJoueurDuMatch(matchID, utilisateurID uuid.UUID) bool {
	if config.DB == nil {
		return false
	}
	var nombre int64
	err := config.DB.Raw(
		`SELECT COUNT(1) FROM matchs WHERE id = ? AND (joueur_1_id = ? OR joueur_2_id = ?)`,
		matchID, utilisateurID, utilisateurID,
	).Scan(&nombre).Error
	if err != nil {
		journaliser("temps réel: vérification d'appartenance au match impossible",
			zap.String("match", matchID.String()), zap.Error(err))
		return false
	}
	return nombre > 0
}
