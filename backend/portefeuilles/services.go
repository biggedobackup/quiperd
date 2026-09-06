package portefeuilles

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrSoldeInsuffisant est renvoyé (mappé en 422) quand un débit dépasse le solde disponible.
var ErrSoldeInsuffisant = errors.New("solde insuffisant")

func reference(prefixe string) string { return prefixe + "-" + uuid.NewString() }

// ObtenirOuCreerPortefeuille garantit l'existence du portefeuille d'un joueur.
func ObtenirOuCreerPortefeuille(tx *gorm.DB, userID uuid.UUID) (*Portefeuille, error) {
	var p Portefeuille
	err := tx.Where("utilisateur_id = ?", userID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		p = Portefeuille{UtilisateurID: userID, Devise: "XOF", SoldeDisponible: decimal.Zero, SoldeBloque: decimal.Zero}
		if err := tx.Create(&p).Error; err != nil {
			return nil, err
		}
		return &p, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// verrouiller charge un portefeuille avec SELECT ... FOR UPDATE (verrou de ligne).
func verrouiller(tx *gorm.DB, userID uuid.UUID) (*Portefeuille, error) {
	if _, err := ObtenirOuCreerPortefeuille(tx, userID); err != nil {
		return nil, err
	}
	var p Portefeuille
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("utilisateur_id = ?", userID).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func persister(tx *gorm.DB, p *Portefeuille) error {
	return tx.Model(&Portefeuille{}).Where("id = ?", p.ID).
		Updates(map[string]any{"solde_disponible": p.SoldeDisponible, "solde_bloque": p.SoldeBloque}).Error
}

// BloquerMise déplace `montant` de disponible vers bloqué et crée la mise + la transaction.
// Utilisé à la création d'un défi et quand un second joueur rejoint.
func BloquerMise(tx *gorm.DB, userID, defiID uuid.UUID, montant decimal.Decimal, devise string) (*Mise, error) {
	p, err := verrouiller(tx, userID)
	if err != nil {
		return nil, err
	}
	if p.SoldeDisponible.LessThan(montant) {
		return nil, ErrSoldeInsuffisant
	}
	p.SoldeDisponible = p.SoldeDisponible.Sub(montant)
	p.SoldeBloque = p.SoldeBloque.Add(montant)
	if err := persister(tx, p); err != nil {
		return nil, err
	}
	mise := Mise{DefiID: defiID, UtilisateurID: userID, Montant: montant, Devise: devise, Statut: MiseBloquee}
	if err := tx.Create(&mise).Error; err != nil {
		return nil, err
	}
	txp := TransactionPortefeuille{
		PortefeuilleID: p.ID, MiseID: &mise.ID, Type: TxMiseBloquee, Montant: montant,
		Statut: "valide", Reference: reference("MB"), Description: "Mise bloquée pour un défi",
	}
	if err := tx.Create(&txp).Error; err != nil {
		return nil, err
	}
	return &mise, nil
}

// ErrMiseDejaRendue est renvoyé quand la mise visée n'est plus `bloquee` : elle a déjà
// été rendue (ou réglée) et aucun mouvement d'argent n'est rejoué.
var ErrMiseDejaRendue = errors.New("mise déjà rendue ou réglée")

// CommissionSurMise applique la règle produit « toute mise rendue = mise × (1 − commission) » :
// commission = montant × taux (arrondie à 2 décimales), rendu = montant − commission.
func CommissionSurMise(montant, taux decimal.Decimal) (rendu, commission decimal.Decimal) {
	commission = montant.Mul(taux).Round(2)
	rendu = montant.Sub(commission)
	return rendu, commission
}

// rendreMise restitue une mise `bloquee` à son joueur, MOINS la commission de la plateforme
// (annulation, expiration, litige remboursé — tous les chemins passent ici) :
//   - `solde_bloque -= mise`, `solde_disponible += mise × (1 − taux)` ;
//   - mise → `remboursee` par transition atomique (`WHERE statut = bloquee`, RowsAffected) :
//     idempotence garantie même si deux appels concurrents ont lu la mise encore bloquée ;
//   - une transaction `remboursement` du montant net, libellée « (moins la commission) » ;
//   - une transaction `commission` (mise × taux, statut `valide`) — même mécanique de ledger que
//     ReglerEscrow : la ligne est informative (le joueur n'a jamais détenu la part prélevée) et
//     elle entre dans le KPI admin des commissions. Les deux lignes portent `mise_id` (et
//     `match_id` s'il existe) pour être distinguées des frais de retrait.
//
// Le portefeuille `p` doit déjà être verrouillé (SELECT ... FOR UPDATE) par l'appelant.
func rendreMise(tx *gorm.DB, p *Portefeuille, mise *Mise, taux decimal.Decimal, matchID *uuid.UUID, prefixe, motif string) (rendu, commission decimal.Decimal, err error) {
	rendu, commission = CommissionSurMise(mise.Montant, taux)

	res := tx.Model(&Mise{}).Where("id = ? AND statut = ?", mise.ID, MiseBloquee).Update("statut", MiseRemboursee)
	if res.Error != nil {
		return rendu, commission, res.Error
	}
	if res.RowsAffected == 0 {
		return rendu, commission, ErrMiseDejaRendue
	}

	p.SoldeBloque = p.SoldeBloque.Sub(mise.Montant)
	p.SoldeDisponible = p.SoldeDisponible.Add(rendu)
	if err = persister(tx, p); err != nil {
		return rendu, commission, err
	}

	miseID := mise.ID
	txRemb := TransactionPortefeuille{
		PortefeuilleID: p.ID, MiseID: &miseID, MatchID: matchID, Type: TxRemboursement, Montant: rendu,
		Statut: "valide", Reference: reference(prefixe),
		Description: fmt.Sprintf("Remboursement de mise (moins la commission) — %s, mise %s %s, commission %s %s",
			motif, mise.Montant.StringFixed(2), mise.Devise, commission.StringFixed(2), mise.Devise),
	}
	if err = tx.Create(&txRemb).Error; err != nil {
		return rendu, commission, err
	}
	txComm := TransactionPortefeuille{
		PortefeuilleID: p.ID, MiseID: &miseID, MatchID: matchID, Type: TxCommission, Montant: commission,
		Statut: "valide", Reference: reference("CM"),
		Description: "Commission de la plateforme sur la mise rendue — " + motif,
	}
	if err = tx.Create(&txComm).Error; err != nil {
		return rendu, commission, err
	}
	return rendu, commission, nil
}

// RembourserMise rend au joueur sa mise bloquée sur un défi (annulation par le créateur,
// expiration sans adversaire), moins la commission `commission_defi` : `taux` est lu par
// l'appelant via administration.CommissionActuelle (même convention que ReglerEscrow) et
// `motif` alimente les libellés du grand livre (« défi annulé », « défi expiré »).
// Renvoie le montant net crédité et la commission retenue.
func RembourserMise(tx *gorm.DB, defiID, userID uuid.UUID, taux decimal.Decimal, motif string) (rendu, commission decimal.Decimal, err error) {
	p, err := verrouiller(tx, userID)
	if err != nil {
		return decimal.Zero, decimal.Zero, err
	}
	var mise Mise
	if err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("defi_id = ? AND utilisateur_id = ? AND statut = ?", defiID, userID, MiseBloquee).
		First(&mise).Error; err != nil {
		return decimal.Zero, decimal.Zero, err
	}
	return rendreMise(tx, p, &mise, taux, nil, "RB", motif)
}

// MiseDuDefi renvoie la mise d'un joueur sur un défi, quel que soit son statut. Sert aux
// modules qui doivent retrouver les écritures de grand livre rattachées à cette mise pour
// les pousser en temps réel (defis : création, annulation, expiration).
func MiseDuDefi(db *gorm.DB, defiID, userID uuid.UUID) (*Mise, error) {
	var mise Mise
	if err := db.Where("defi_id = ? AND utilisateur_id = ?", defiID, userID).First(&mise).Error; err != nil {
		return nil, err
	}
	return &mise, nil
}

func trouver(liste []Portefeuille, userID uuid.UUID) *Portefeuille {
	for i := range liste {
		if liste[i].UtilisateurID == userID {
			return &liste[i]
		}
	}
	return nil
}

// ReglerEscrow applique le règlement d'un match terminé : commission prélevée,
// gain crédité au gagnant, mises marquées gagnée/perdue. Doit être appelé dans la
// même transaction que la transition atomique du statut du match (voir matchs/services.go).
func ReglerEscrow(tx *gorm.DB, defiID, matchID, gagnantID, perdantID uuid.UUID, montant, taux decimal.Decimal) (gain, commission decimal.Decimal, err error) {
	total := montant.Mul(decimal.NewFromInt(2))
	commission = total.Mul(taux).Round(2)
	gain = total.Sub(commission)

	if _, err = ObtenirOuCreerPortefeuille(tx, gagnantID); err != nil {
		return
	}
	if _, err = ObtenirOuCreerPortefeuille(tx, perdantID); err != nil {
		return
	}

	// Verrou des deux portefeuilles dans un ordre déterministe (ORDER BY id) : anti-interblocage.
	var portefeuilles []Portefeuille
	if err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("utilisateur_id IN ?", []uuid.UUID{gagnantID, perdantID}).
		Order("id").Find(&portefeuilles).Error; err != nil {
		return
	}
	pg := trouver(portefeuilles, gagnantID)
	pp := trouver(portefeuilles, perdantID)
	if pg == nil || pp == nil {
		err = fmt.Errorf("portefeuille introuvable pour le règlement")
		return
	}

	pg.SoldeBloque = pg.SoldeBloque.Sub(montant)
	pp.SoldeBloque = pp.SoldeBloque.Sub(montant)
	pg.SoldeDisponible = pg.SoldeDisponible.Add(gain)
	if err = persister(tx, pg); err != nil {
		return
	}
	if err = persister(tx, pp); err != nil {
		return
	}

	if err = tx.Model(&Mise{}).Where("defi_id = ? AND utilisateur_id = ?", defiID, gagnantID).
		Update("statut", MiseGagnee).Error; err != nil {
		return
	}
	if err = tx.Model(&Mise{}).Where("defi_id = ? AND utilisateur_id = ?", defiID, perdantID).
		Update("statut", MisePerdue).Error; err != nil {
		return
	}

	mID := matchID
	txGain := TransactionPortefeuille{
		PortefeuilleID: pg.ID, MatchID: &mID, Type: TxGain, Montant: gain,
		Statut: "valide", Reference: reference("GN"), Description: "Gain du match (2 mises − commission)",
	}
	if err = tx.Create(&txGain).Error; err != nil {
		return
	}
	txComm := TransactionPortefeuille{
		PortefeuilleID: pg.ID, MatchID: &mID, Type: TxCommission, Montant: commission,
		Statut: "valide", Reference: reference("CM"), Description: "Commission de la plateforme",
	}
	if err = tx.Create(&txComm).Error; err != nil {
		return
	}
	return gain, commission, nil
}

// rendreLesDeuxMises restitue en une seule transaction la mise bloquée de chacun des deux
// joueurs d'un match, chacune MOINS la commission. Socle commun du remboursement arbitral
// (RemboursementCroise) et du partage d'un match nul (PartagerEscrow) :
//   - les deux portefeuilles sont verrouillés dans un ordre déterministe (ORDER BY id,
//     comme ReglerEscrow : anti-interblocage) ;
//   - chaque ligne `mises` passe de `bloquee` à `remboursee` par transition atomique ;
//   - les écritures du grand livre portent `mise_id` ET `match_id` ;
//   - tout ou rien : si une des deux mises n'est plus `bloquee`, l'erreur fait annuler la
//     transaction de l'appelant — jamais de restitution partielle.
//
// Renvoie le montant net rendu à CHAQUE joueur et la commission TOTALE retenue par la
// plateforme (somme des deux commissions).
func rendreLesDeuxMises(tx *gorm.DB, defiID, matchID, joueur1, joueur2 uuid.UUID, taux decimal.Decimal, prefixe, motif string) (rendu, commissionTotale decimal.Decimal, err error) {
	rendu, commissionTotale = decimal.Zero, decimal.Zero
	joueurs := []uuid.UUID{joueur1, joueur2}
	for _, u := range joueurs {
		if _, err = ObtenirOuCreerPortefeuille(tx, u); err != nil {
			return
		}
	}
	var comptes []Portefeuille
	if err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("utilisateur_id IN ?", joueurs).
		Order("id").Find(&comptes).Error; err != nil {
		return
	}
	mID := matchID
	for _, u := range joueurs {
		p := trouver(comptes, u)
		if p == nil {
			err = fmt.Errorf("portefeuille introuvable pour %s", u)
			return
		}
		var mise Mise
		if err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("defi_id = ? AND utilisateur_id = ? AND statut = ?", defiID, u, MiseBloquee).
			First(&mise).Error; err != nil {
			err = fmt.Errorf("mise bloquée introuvable pour le joueur %s : %w", u, err)
			return
		}
		net, commission, e := rendreMise(tx, p, &mise, taux, &mID, prefixe, motif)
		if e != nil {
			err = e
			return
		}
		rendu = net
		commissionTotale = commissionTotale.Add(commission)
	}
	return rendu, commissionTotale, nil
}

// RemboursementCroise rend leur mise aux deux joueurs d'un match annulé par décision
// arbitrale (litige → « remboursement »), chacune MOINS la commission (`taux` lu par
// l'appelant via administration.CommissionActuelle). Le montant rendu est celui de la ligne
// `mises` de chaque joueur (source de vérité de l'escrow), pas une valeur passée en paramètre.
// Renvoie le net crédité à chaque joueur et la commission totale retenue.
func RemboursementCroise(tx *gorm.DB, defiID, matchID, joueur1, joueur2 uuid.UUID, taux decimal.Decimal) (rendu, commission decimal.Decimal, err error) {
	return rendreLesDeuxMises(tx, defiID, matchID, joueur1, joueur2, taux, "RC", "litige : match annulé")
}

// PartagerEscrow solde un match nul par un partage : chaque joueur récupère
// mise × (1 − taux) sur son solde disponible, la plateforme garde 2 × mise × taux.
// La commission est TOUJOURS prélevée (règle produit : toute mise rendue = mise × (1 − commission)).
// Aucun gagnant n'est désigné, les deux mises passent en `remboursee`.
//
// Doit être appelé dans la même transaction que la transition atomique du statut du match
// (nul_en_attente -> termine), exactement comme ReglerEscrow. Renvoie le montant net rendu
// à chaque joueur et la commission totale conservée par la plateforme.
func PartagerEscrow(tx *gorm.DB, defiID, matchID, joueur1, joueur2 uuid.UUID, taux decimal.Decimal) (rendu, commission decimal.Decimal, err error) {
	return rendreLesDeuxMises(tx, defiID, matchID, joueur1, joueur2, taux, "PT", "match nul : partage de l'escrow")
}

// Crediter ajoute un montant au solde disponible (dépôt confirmé).
func Crediter(tx *gorm.DB, userID uuid.UUID, montant decimal.Decimal, ref, description string) error {
	if ref == "" {
		ref = reference("DP")
	}
	return CrediterType(tx, userID, montant, TxDepot, ref, description)
}

// CrediterType ajoute un montant au solde disponible avec le type de mouvement
// indiqué (depot, remboursement…).
func CrediterType(tx *gorm.DB, userID uuid.UUID, montant decimal.Decimal, typ, ref, description string) error {
	p, err := verrouiller(tx, userID)
	if err != nil {
		return err
	}
	p.SoldeDisponible = p.SoldeDisponible.Add(montant)
	if err := persister(tx, p); err != nil {
		return err
	}
	txp := TransactionPortefeuille{
		PortefeuilleID: p.ID, Type: typ, Montant: montant, Statut: "valide",
		Reference: ref, Description: description,
	}
	return tx.Create(&txp).Error
}

// DebiterRetrait réserve montant + frais sur le solde disponible pour une demande
// de retrait (jamais servi par le solde bloqué). Les mouvements `retrait` et
// `commission` (frais) sont créés en statut en_attente jusqu'à l'issue du retrait.
func DebiterRetrait(tx *gorm.DB, userID uuid.UUID, montant, frais decimal.Decimal, ref, description string) error {
	total := montant.Add(frais)
	p, err := verrouiller(tx, userID)
	if err != nil {
		return err
	}
	if p.SoldeDisponible.LessThan(total) {
		return ErrSoldeInsuffisant
	}
	p.SoldeDisponible = p.SoldeDisponible.Sub(total)
	if err := persister(tx, p); err != nil {
		return err
	}
	txp := TransactionPortefeuille{
		PortefeuilleID: p.ID, Type: TxRetrait, Montant: montant, Statut: "en_attente",
		Reference: ref, Description: description,
	}
	if err := tx.Create(&txp).Error; err != nil {
		return err
	}
	if frais.GreaterThan(decimal.Zero) {
		txf := TransactionPortefeuille{
			PortefeuilleID: p.ID, Type: TxCommission, Montant: frais, Statut: "en_attente",
			Reference: ref + "-FRAIS", Description: "Frais de retrait",
		}
		if err := tx.Create(&txf).Error; err != nil {
			return err
		}
	}
	return nil
}

// ValiderRetrait rend définitifs les mouvements d'un retrait effectué (statut valide).
func ValiderRetrait(tx *gorm.DB, ref string) error {
	return tx.Model(&TransactionPortefeuille{}).
		Where("reference IN ?", []string{ref, ref + "-FRAIS"}).
		Update("statut", "valide").Error
}

// AnnulerRetrait annule les mouvements d'un retrait échoué et recrédite le total
// réservé (montant + frais) en remboursement.
func AnnulerRetrait(tx *gorm.DB, userID uuid.UUID, ref string, total decimal.Decimal) error {
	if err := tx.Model(&TransactionPortefeuille{}).
		Where("reference IN ?", []string{ref, ref + "-FRAIS"}).
		Update("statut", "annule").Error; err != nil {
		return err
	}
	return CrediterType(tx, userID, total, TxRemboursement, ref+"-REFUND", "Retrait échoué — remboursement (frais inclus)")
}

// Debiter retire un montant du solde disponible (retrait). Refusé si insuffisant —
// jamais servi par le solde bloqué.
func Debiter(tx *gorm.DB, userID uuid.UUID, montant decimal.Decimal, ref, description string) error {
	p, err := verrouiller(tx, userID)
	if err != nil {
		return err
	}
	if p.SoldeDisponible.LessThan(montant) {
		return ErrSoldeInsuffisant
	}
	p.SoldeDisponible = p.SoldeDisponible.Sub(montant)
	if err := persister(tx, p); err != nil {
		return err
	}
	if ref == "" {
		ref = reference("RT")
	}
	txp := TransactionPortefeuille{
		PortefeuilleID: p.ID, Type: TxRetrait, Montant: montant, Statut: "valide",
		Reference: ref, Description: description,
	}
	return tx.Create(&txp).Error
}

// LirePortefeuille renvoie le portefeuille d'un joueur (lecture simple).
func LirePortefeuille(userID uuid.UUID, db *gorm.DB) (*Portefeuille, error) {
	return ObtenirOuCreerPortefeuille(db, userID)
}

// ListerTransactions renvoie l'historique paginé d'un portefeuille.
func ListerTransactions(db *gorm.DB, userID uuid.UUID, limite, decalage int) ([]TransactionPortefeuille, error) {
	p, err := ObtenirOuCreerPortefeuille(db, userID)
	if err != nil {
		return nil, err
	}
	var txs []TransactionPortefeuille
	err = db.Where("portefeuille_id = ?", p.ID).
		Order("date_creation DESC").Limit(limite).Offset(decalage).Find(&txs).Error
	return txs, err
}
