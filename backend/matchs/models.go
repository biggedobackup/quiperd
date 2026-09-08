package matchs

import (
	"time"

	"defisenligne/backend/utils"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Statuts de match — machine à états du parcours joueur :
//
//	en_cours ──(1 déclaration)──► en_cours + échéance de confirmation
//	   │                              │
//	   │                              ├─ confirmation / déclaration concordante ─► termine (règlement immédiat)
//	   │                              ├─ déclarations divergentes ──────────────► preuve_requise
//	   │                              ├─ nul déclaré des deux côtés ────────────► nul_en_attente
//	   │                              └─ échéance expirée ──────────────────────► termine (abandon)
//	preuve_requise ──(preuves déposées ou échéance expirée)──► litige ──(arbitrage)──► termine
//	nul_en_attente ──(rejouer × 2)──► en_cours (manche + 1)
//	nul_en_attente ──(choix opposés ou échéance expirée)──► termine (partage)
//
// `verification` ne fait plus partie du parcours joueur : deux déclarations concordantes
// règlent le match IMMÉDIATEMENT, sans preuve ni arbitre, quel que soit le montant. Le
// statut reste défini pour les lignes historiques et pour la validation administrative
// (POST /matchs/:id/validation), qui continue de fonctionner.
const (
	StatutEnCours       = "en_cours"
	StatutPreuveRequise = "preuve_requise"
	StatutNulEnAttente  = "nul_en_attente"
	StatutVerification  = "verification"
	StatutLitige        = "litige"
	StatutTermine       = "termine"
)

// StatutsActifs liste les statuts pour lesquels de l'argent est encore bloqué en escrow
// (un compte ne peut pas être supprimé, un match ne peut pas être oublié).
func StatutsActifs() []string {
	return []string{StatutEnCours, StatutPreuveRequise, StatutNulEnAttente, StatutVerification, StatutLitige}
}

// Types d'échéance posés sur un match (colonne `echeance_type`, aussi le champ `type`
// de l'événement temps réel match.chrono).
const (
	EcheanceConfirmation = "confirmation" // le second joueur doit confirmer ou contredire
	EcheancePreuve       = "preuve"       // les deux joueurs doivent déposer leur preuve
	EcheanceChoixNul     = "choix_nul"    // chaque joueur doit choisir rejouer ou partager
)

// Choix possibles après un match nul déclaré des deux côtés.
const (
	ChoixRejouer  = "rejouer"
	ChoixPartager = "partager"
)

// MatchDefi — match réel entre deux joueurs (table 6).
// Le montant de mise est dénormalisé ici pour le règlement de l'escrow sans
// dépendre du package defis (évite un cycle d'import defis <-> matchs).
type MatchDefi struct {
	utils.ModeleBase
	DefiID uuid.UUID `gorm:"type:uuid;index" json:"defiId"`
	// Noms de colonnes explicites : GORM dériverait `joueur1_id` / `score_joueur1`,
	// alors que le modèle de données (§7, table 6) impose `joueur_1_id` / `score_joueur_1`,
	// noms utilisés par les requêtes SQL brutes (litiges, scores).
	Joueur1ID    uuid.UUID       `gorm:"column:joueur_1_id;type:uuid;index" json:"joueur1Id"`
	Joueur2ID    uuid.UUID       `gorm:"column:joueur_2_id;type:uuid;index" json:"joueur2Id"`
	ScoreJoueur1 *int            `gorm:"column:score_joueur_1" json:"scoreJoueur1,omitempty"`
	ScoreJoueur2 *int            `gorm:"column:score_joueur_2" json:"scoreJoueur2,omitempty"`
	GagnantID    *uuid.UUID      `gorm:"type:uuid" json:"gagnantId,omitempty"`
	PerdantID    *uuid.UUID      `gorm:"type:uuid" json:"perdantId,omitempty"`
	MontantMise  decimal.Decimal `gorm:"type:numeric(15,2)" json:"montantMise"`
	Devise       string          `gorm:"type:varchar(10);default:'XOF'" json:"devise"`
	Statut       string          `gorm:"type:varchar(30);default:'en_cours';index" json:"statut"`
	// Manche compte les rejeux d'un nul partagé : chaque « rejouer » accepté par les deux
	// joueurs incrémente la manche SANS aucun mouvement d'argent (l'escrow reste bloqué).
	// Les déclarations et les choix de nul sont datés par manche.
	Manche int `gorm:"default:1;not null" json:"manche"`
	// Echeance / EcheanceType portent le chrono en cours (confirmation, preuve, choix_nul).
	// Le client les lit au chargement de la page et les égrène sans appel réseau ; le
	// serveur les republie en direct via match.chrono.
	Echeance     *time.Time `json:"echeance,omitempty"`
	EcheanceType string     `gorm:"type:varchar(20)" json:"echeanceType,omitempty"`
	DateDebut    *time.Time `json:"dateDebut,omitempty"`
	DateFin      *time.Time `json:"dateFin,omitempty"`
}

func (MatchDefi) TableName() string { return "matchs" }

// ResultatDeclare — déclaration d'un joueur après le match (table 8).
// La clé unique porte la manche : après un « rejouer », chaque joueur redéclare le
// score de la nouvelle manche sans que l'historique de la précédente soit détruit.
type ResultatDeclare struct {
	utils.ModeleBase
	MatchID          uuid.UUID  `gorm:"type:uuid;index:idx_decl_match_user,unique,priority:1" json:"matchId"`
	UtilisateurID    uuid.UUID  `gorm:"type:uuid;index:idx_decl_match_user,unique,priority:2" json:"utilisateurId"`
	Manche           int        `gorm:"default:1;not null;index:idx_decl_match_user,unique,priority:3" json:"manche"`
	ScorePour        int        `json:"scorePour"`
	ScoreContre      int        `json:"scoreContre"`
	GagnantDeclareID *uuid.UUID `gorm:"type:uuid" json:"gagnantDeclareId,omitempty"`
	Commentaire      string     `gorm:"type:text" json:"commentaire"`
	DateDeclaration  time.Time  `gorm:"autoCreateTime" json:"dateDeclaration"`
}

func (ResultatDeclare) TableName() string { return "resultats_declares" }

// EstNul indique que la déclaration annonce une égalité (aucun gagnant désigné).
func (r ResultatDeclare) EstNul() bool { return r.GagnantDeclareID == nil }

// ChoixNul — choix d'un joueur après un match nul déclaré des deux côtés : rejouer la
// manche (sans mouvement d'argent) ou partager l'escrow. Une ligne par joueur et par
// manche ; le partage est appliqué dès que les choix sont opposés ou que l'échéance passe.
type ChoixNul struct {
	utils.ModeleBase
	MatchID       uuid.UUID `gorm:"type:uuid;index:idx_choix_nul_match_user,unique,priority:1" json:"matchId"`
	UtilisateurID uuid.UUID `gorm:"type:uuid;index:idx_choix_nul_match_user,unique,priority:2" json:"utilisateurId"`
	Manche        int       `gorm:"default:1;not null;index:idx_choix_nul_match_user,unique,priority:3" json:"manche"`
	Choix         string    `gorm:"type:varchar(20)" json:"choix"`
	DateChoix     time.Time `gorm:"autoCreateTime" json:"dateChoix"`
}

func (ChoixNul) TableName() string { return "choix_nuls" }
