package matchs

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"quiperd/backend/utils"
)

// Statuts de match.
const (
	StatutEnCours      = "en_cours"
	StatutVerification = "verification"
	StatutLitige       = "litige"
	StatutTermine      = "termine"
)

// MatchDefi — match réel entre deux joueurs (table 6).
// Le montant de mise est dénormalisé ici pour le règlement de l'escrow sans
// dépendre du package defis (évite un cycle d'import defis <-> matchs).
type MatchDefi struct {
	utils.ModeleBase
	DefiID       uuid.UUID       `gorm:"type:uuid;index" json:"defiId"`
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
	DateDebut    *time.Time      `json:"dateDebut,omitempty"`
	DateFin      *time.Time      `json:"dateFin,omitempty"`
}

func (MatchDefi) TableName() string { return "matchs" }

// ResultatDeclare — déclaration d'un joueur après le match (table 8).
type ResultatDeclare struct {
	utils.ModeleBase
	MatchID          uuid.UUID  `gorm:"type:uuid;index:idx_decl_match_user,unique,priority:1" json:"matchId"`
	UtilisateurID    uuid.UUID  `gorm:"type:uuid;index:idx_decl_match_user,unique,priority:2" json:"utilisateurId"`
	ScorePour        int        `json:"scorePour"`
	ScoreContre      int        `json:"scoreContre"`
	GagnantDeclareID *uuid.UUID `gorm:"type:uuid" json:"gagnantDeclareId,omitempty"`
	Commentaire      string     `gorm:"type:text" json:"commentaire"`
	DateDeclaration  time.Time  `gorm:"autoCreateTime" json:"dateDeclaration"`
}

func (ResultatDeclare) TableName() string { return "resultats_declares" }
