package portefeuilles

import (
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"quiperd/backend/tempsreel"
)

// ChargeMaj est la charge utile de l'événement portefeuille.maj : le solde d'un joueur
// après un mouvement. Diffusé UNIQUEMENT sur le salon privé de ce joueur (donnée d'argent).
type ChargeMaj struct {
	SoldeDisponible decimal.Decimal `json:"soldeDisponible"`
	SoldeBloque     decimal.Decimal `json:"soldeBloque"`
	// Poussés avec les deux autres : un dépôt confirmé, une mise bloquée ou un défi annulé
	// changent la part non jouée, donc le plafond de retrait. Sans eux, l'écran du joueur
	// afficherait un solde à jour et un plafond périmé — le pire des deux mondes.
	SoldeNonJoue   decimal.Decimal `json:"soldeNonJoue"`
	SoldeRetirable decimal.Decimal `json:"soldeRetirable"`
	Devise         string          `json:"devise"`
}

// transactionAvecProprietaire est une ligne de grand livre jointe à son propriétaire,
// pour savoir sur quel salon privé publier transaction.creee. Lecture seule.
type transactionAvecProprietaire struct {
	TransactionPortefeuille
	UtilisateurID uuid.UUID `gorm:"column:utilisateur_id" json:"-"`
}

// AjouterEtat met en tampon un portefeuille.maj par joueur (salon privé de chacun).
// À appeler DANS la transaction, après le mouvement : le tampon ne diffuse qu'après commit.
func AjouterEtat(tx *gorm.DB, tampon *tempsreel.Tampon, utilisateurs ...uuid.UUID) {
	if tampon == nil {
		return
	}
	vus := map[uuid.UUID]bool{}
	for _, u := range utilisateurs {
		if u == uuid.Nil || vus[u] {
			continue
		}
		vus[u] = true
		var p Portefeuille
		if err := tx.Where("utilisateur_id = ?", u).First(&p).Error; err != nil {
			continue
		}
		tampon.Ajouter(tempsreel.EvtPortefeuilleMaj, ChargeMaj{
			SoldeDisponible: p.SoldeDisponible, SoldeBloque: p.SoldeBloque,
			SoldeNonJoue: p.SoldeNonJoue, SoldeRetirable: p.SoldeRetirable(), Devise: p.Devise,
		}, tempsreel.SalonUtilisateur(u))
	}
}

// ajouterTransactions met en tampon un transaction.creee par ligne trouvée, sur le salon
// privé du propriétaire du portefeuille concerné.
func ajouterTransactions(tx *gorm.DB, tampon *tempsreel.Tampon, filtre func(*gorm.DB) *gorm.DB) {
	if tampon == nil {
		return
	}
	q := tx.Table("transactions_portefeuilles t").
		Select("t.*, p.utilisateur_id").
		Joins("JOIN portefeuilles p ON p.id = t.portefeuille_id")
	lignes := []transactionAvecProprietaire{}
	if err := filtre(q).Order("t.date_creation ASC").Scan(&lignes).Error; err != nil {
		return
	}
	for _, l := range lignes {
		tampon.Ajouter(tempsreel.EvtTransactionCreee, l.TransactionPortefeuille,
			tempsreel.SalonUtilisateur(l.UtilisateurID))
	}
}

// AjouterTransactionsMatch met en tampon toutes les écritures de grand livre rattachées à
// un match (gain, commission, remboursement de partage). À appeler juste après le règlement,
// dans la même transaction.
func AjouterTransactionsMatch(tx *gorm.DB, tampon *tempsreel.Tampon, matchID uuid.UUID) {
	ajouterTransactions(tx, tampon, func(q *gorm.DB) *gorm.DB {
		return q.Where("t.match_id = ?", matchID)
	})
}

// AjouterTransactionsMise met en tampon les écritures rattachées à une mise (blocage,
// remboursement de défi annulé ou expiré).
func AjouterTransactionsMise(tx *gorm.DB, tampon *tempsreel.Tampon, miseID uuid.UUID) {
	ajouterTransactions(tx, tampon, func(q *gorm.DB) *gorm.DB {
		return q.Where("t.mise_id = ?", miseID)
	})
}

// AjouterTransactionsReferences met en tampon les écritures portant l'une des références
// fournies (dépôt confirmé, retrait demandé, retrait annulé).
func AjouterTransactionsReferences(tx *gorm.DB, tampon *tempsreel.Tampon, references ...string) {
	if len(references) == 0 {
		return
	}
	ajouterTransactions(tx, tampon, func(q *gorm.DB) *gorm.DB {
		return q.Where("t.reference IN ?", references)
	})
}

// AjouterMiseEtEtat est le raccourci du parcours défi : les écritures d'une mise puis le
// solde du joueur.
func AjouterMiseEtEtat(tx *gorm.DB, tampon *tempsreel.Tampon, miseID uuid.UUID, utilisateurs ...uuid.UUID) {
	AjouterTransactionsMise(tx, tampon, miseID)
	AjouterEtat(tx, tampon, utilisateurs...)
}
