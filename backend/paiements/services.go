package paiements

import (
	"errors"
	"time"

	"defisenligne/backend/administration"
	"defisenligne/backend/auth"
	"defisenligne/backend/config"
	"defisenligne/backend/courriel"
	"defisenligne/backend/jobs"
	"defisenligne/backend/notifications"
	"defisenligne/backend/portefeuilles"
	"defisenligne/backend/tempsreel"
	"defisenligne/backend/utils"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func reference() string { return "PAY-" + uuid.NewString() }

// Deposer crée un dépôt et initie le paiement chez le prestataire.
// Renvoie le paiement et, si le prestataire est configuré, l'URL de paiement hébergée.
func Deposer(userID uuid.UUID, montant decimal.Decimal, prestataire, nomClient, email, numero string) (*Paiement, string, error) {
	if montant.LessThanOrEqual(decimal.Zero) {
		return nil, "", errors.New("montant invalide")
	}
	p := &Paiement{
		UtilisateurID: userID, Type: TypeDepot, Prestataire: prestataire,
		Montant: montant, Devise: "XOF", Reference: reference(), Statut: StatutEnAttente,
	}
	if err := config.DB.Create(p).Error; err != nil {
		return nil, "", err
	}

	var urlPaiement, token string
	var err error
	switch prestataire {
	case PrestataireLigdicash:
		urlPaiement, token, err = CreerFactureLigdicash(p, nomClient, email)
	case PrestataireFusionMoney:
		urlPaiement, token, err = CreerPaiementFusion(p, nomClient, numero)
	default:
		err = errors.New("prestataire inconnu")
	}
	if err != nil {
		// On conserve le paiement en_attente (validable manuellement) et on journalise.
		if utils.Log != nil {
			utils.Log.Warn("création paiement prestataire échouée", zap.Error(err), zap.String("ref", p.Reference))
		}
		return p, "", err
	}
	config.DB.Model(p).Update("reference_prestataire", token)
	p.ReferencePrestataire = token

	// La ligne est committée : diffusion immédiate sur le salon privé du joueur.
	PublierStatut(p, p.Statut)

	// Polling de secours : 1er contrôle à +2 min si aucun callback (skill).
	jobs.EnfilerPaiementReverif(p.ID.String(), 1, 2*time.Minute)
	return p, urlPaiement, nil
}

// Retirer réserve immédiatement montant + frais de retrait sur le solde disponible
// (jamais sur le solde bloqué) et crée une demande de retrait en attente de
// traitement/validation. Les frais (configurations_financieres.frais_retrait) ne
// sont acquis à la plateforme que si le retrait réussit ; un retrait échoué
// rembourse montant + frais.
func Retirer(userID uuid.UUID, montant decimal.Decimal, prestataire, numero string) (*Paiement, error) {
	if montant.LessThanOrEqual(decimal.Zero) {
		return nil, errors.New("montant invalide")
	}
	var p *Paiement
	tampon := tempsreel.NouveauTampon()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		frais := montant.Mul(administration.FraisRetrait(tx)).Round(2)
		pai := &Paiement{
			UtilisateurID: userID, Type: TypeRetrait, Prestataire: prestataire,
			Montant: montant, Frais: frais, Devise: "XOF", Reference: reference(), Statut: StatutEnAttente,
		}
		if err := tx.Create(pai).Error; err != nil {
			return err
		}
		if err := portefeuilles.DebiterRetrait(tx, userID, montant, frais, pai.Reference, "Retrait "+prestataire+" vers "+numero); err != nil {
			return err
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &userID, Action: "paiement:retrait_demande", TableCible: "paiements",
			IdentifiantCible: &pai.ID, Nouvelle: map[string]any{"montant": montant, "frais": frais, "numero": numero},
		})
		AjouterStatut(tampon, pai, pai.Statut)
		AjouterATraiter(tampon, pai)
		portefeuilles.AjouterTransactionsReferences(tx, tampon, pai.Reference, pai.Reference+"-FRAIS")
		portefeuilles.AjouterEtat(tx, tampon, userID)
		p = pai
		return nil
	})
	if errors.Is(err, portefeuilles.ErrSoldeInsuffisant) {
		return nil, portefeuilles.ErrSoldeInsuffisant
	}
	// Remontée telle quelle : le contrôleur en fait un message distinct du solde insuffisant.
	if errors.Is(err, portefeuilles.ErrDepotNonJoue) {
		return nil, portefeuilles.ErrDepotNonJoue
	}
	if err != nil {
		return nil, err
	}
	tampon.Diffuser()
	// Accusé de réception au joueur (enfilé : le SMTP ne retarde pas la réponse HTTP).
	// Le numéro Mobile Money n'est jamais repris en entier dans le message.
	AccuserRetraitParCourriel(p, numero)
	return p, nil
}

// destinataire renvoie l'adresse et le pseudo d'un joueur, ou deux chaînes vides si le
// compte est introuvable (aucun e-mail n'est alors envoyé).
func destinataire(userID uuid.UUID) (email, pseudo string) {
	u, err := auth.TrouverUtilisateur(userID)
	if err != nil {
		return "", ""
	}
	return u.Email, u.NomUtilisateur
}

// AccuserRetraitParCourriel envoie l'accusé de demande de retrait : montant reçu, frais,
// total débité et numéro Mobile Money masqué (4 derniers chiffres seulement).
func AccuserRetraitParCourriel(p *Paiement, numero string) {
	if p == nil {
		return
	}
	email, pseudo := destinataire(p.UtilisateurID)
	if email == "" {
		return
	}
	courriel.Enfiler(email, courriel.MessageRetraitDemande(pseudo,
		p.Montant.StringFixed(2), p.Frais.StringFixed(2), p.Montant.Add(p.Frais).StringFixed(2),
		p.Devise, courriel.MasquerNumero(numero)))
}

// NotifierIssueRetraitParCourriel prévient le joueur du sort de son virement :
// `reussi` (somme envoyée) ou `echoue` (montant ET frais recrédités sur le portefeuille).
func NotifierIssueRetraitParCourriel(p *Paiement, statut string) {
	if p == nil || p.Type != TypeRetrait {
		return
	}
	email, pseudo := destinataire(p.UtilisateurID)
	if email == "" {
		return
	}
	montant := p.Montant.StringFixed(2)
	frais := p.Frais.StringFixed(2)
	switch statut {
	case StatutReussi:
		courriel.Enfiler(email, courriel.MessageRetraitReussi(pseudo, montant, frais, p.Devise))
	case StatutEchoue:
		courriel.Enfiler(email, courriel.MessageRetraitEchoue(pseudo, montant, frais,
			p.Montant.Add(p.Frais).StringFixed(2), p.Devise))
	}
}

// AppliquerReussiteDepot crédite le portefeuille une seule fois (idempotent).
// paidEffectif = montant réellement payé (ligdicash: amount ; fusion: Montant+frais ;
// validation admin: montant attendu). Refuse le crédit en cas d'écart de montant.
func AppliquerReussiteDepot(paiementID uuid.UUID, paidEffectif decimal.Decimal, operateur string) error {
	tampon := tempsreel.NouveauTampon()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// Idempotence : transition atomique en_attente -> reussi.
		res := tx.Model(&Paiement{}).
			Where("id = ? AND type = ? AND statut = ? AND traite = false", paiementID, TypeDepot, StatutEnAttente).
			Updates(map[string]any{"traite": true, "statut": StatutReussi, "operateur": operateur})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil // déjà traité
		}
		var p Paiement
		if err := tx.First(&p, "id = ?", paiementID).Error; err != nil {
			return err
		}
		// Contrôle de cohérence du montant (tolérance 1 unité).
		if paidEffectif.LessThan(p.Montant.Sub(decimal.NewFromInt(1))) {
			if utils.Log != nil {
				utils.Log.Warn("écart de montant sur dépôt — crédit refusé",
					zap.String("ref", p.Reference), zap.String("attendu", p.Montant.String()),
					zap.String("recu", paidEffectif.String()))
			}
			return errors.New("écart de montant détecté")
		}
		if err := portefeuilles.Crediter(tx, p.UtilisateurID, p.Montant, p.Reference, "Dépôt confirmé ("+p.Prestataire+")"); err != nil {
			return err
		}
		_ = notifications.Creer(tx, p.UtilisateurID, "Dépôt confirmé",
			"Votre dépôt a été crédité sur votre portefeuille.", notifications.TypePaiementConfirme, tampon)
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &p.UtilisateurID, Action: "paiement:depot_reussi", TableCible: "paiements",
			IdentifiantCible: &p.ID,
		})
		AjouterStatut(tampon, &p, StatutReussi)
		portefeuilles.AjouterTransactionsReferences(tx, tampon, p.Reference)
		portefeuilles.AjouterEtat(tx, tampon, p.UtilisateurID)
		return nil
	})
	if err != nil {
		return err
	}
	tampon.Diffuser()
	return nil
}

// AppliquerEchecDepot marque un dépôt échoué (idempotent), sur constat du
// prestataire uniquement — jamais sur la seule foi d'un webhook.
//
// Aucun mouvement d'argent : rien n'avait été crédité, et rien n'a été prélevé
// sur le portefeuille au moment du dépôt. Ce qui compte ici est de PRÉVENIR le
// joueur : sans cela, un paiement refusé laisse une ligne « en attente » pour
// toujours et le joueur guette un solde qui n'arrivera jamais.
func AppliquerEchecDepot(paiementID uuid.UUID, motif string) error {
	tampon := tempsreel.NouveauTampon()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// Même transition atomique que la réussite : deux webhooks simultanés ne
		// produisent qu'une notification.
		res := tx.Model(&Paiement{}).
			Where("id = ? AND type = ? AND statut = ? AND traite = false", paiementID, TypeDepot, StatutEnAttente).
			Updates(map[string]any{"traite": true, "statut": StatutEchoue})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil // déjà traité
		}
		var p Paiement
		if err := tx.First(&p, "id = ?", paiementID).Error; err != nil {
			return err
		}
		_ = notifications.Creer(tx, p.UtilisateurID, "Dépôt échoué",
			"Aucun montant n'a été débité. Vérifiez votre solde Mobile Money, puis réessayez.",
			notifications.TypePaiementEchoue, tampon)
		administration.Journaliser(tx, administration.ParamsAudit{
			UtilisateurID: &p.UtilisateurID, Action: "paiement:depot_echoue", TableCible: "paiements",
			IdentifiantCible: &p.ID, Nouvelle: map[string]any{"motif": motif},
		})
		AjouterStatut(tampon, &p, StatutEchoue)
		return nil
	})
	if err != nil {
		return err
	}
	tampon.Diffuser()
	return nil
}

// appliquerEtatPrestataire traduit l'état constaté chez le prestataire en
// transition côté plateforme, et dit si le dépôt est clos.
//
// `pending` et `no paid` ne CLÔTURENT rien : la page de paiement peut encore
// être honorée, un paiement tardif reste valide (skill FusionMoney §3 et §4).
func appliquerEtatPrestataire(p *Paiement) (clos bool) {
	switch p.Prestataire {
	case PrestataireLigdicash:
		statut, amount, op, err := ConfirmerLigdicash(p.ReferencePrestataire)
		if err != nil {
			return false
		}
		switch statut {
		case "completed":
			_ = AppliquerReussiteDepot(p.ID, decimal.NewFromFloat(amount), op)
			return true
		case "notcompleted":
			_ = AppliquerEchecDepot(p.ID, "ligdicash: notcompleted")
			return true
		}
	case PrestataireFusionMoney:
		statut, montant, frais, op, err := VerifierFusion(p.ReferencePrestataire)
		if err != nil {
			return false
		}
		switch statut {
		case "paid":
			// `Montant` est NET des frais : le montant réellement payé par le
			// joueur est la somme des deux (skill FusionMoney §3).
			_ = AppliquerReussiteDepot(p.ID, decimal.NewFromFloat(montant+frais), op)
			return true
		case "failure":
			_ = AppliquerEchecDepot(p.ID, "moneyfusion: failure")
			return true
		}
	}
	return false
}

// Reverifier est appelé par le worker (polling de secours). Interroge le
// prestataire ; crédite si payé, marque échoué si refusé, se replanifie tant
// que le paiement reste en attente.
func Reverifier(paiementID uuid.UUID, tentative int) {
	var p Paiement
	if err := config.DB.First(&p, "id = ?", paiementID).Error; err != nil {
		return
	}
	if p.Statut != StatutEnAttente || p.Traite {
		return
	}
	if p.ReferencePrestataire == "" {
		return
	}

	if appliquerEtatPrestataire(&p) {
		return
	}

	// Toujours en attente → replanifier (max 10 tentatives, intervalle 30 s).
	if tentative < 10 {
		jobs.EnfilerPaiementReverif(p.ID.String(), tentative+1, 30*time.Second)
	}
}

// TraiterCallbackLigdicash traite un callback (déjà journalisé) en arrière-plan.
// Le callback ne dit RIEN de l'état : il ne fait que déclencher la vérification.
func TraiterCallbackLigdicash(transactionID string) {
	id, err := uuid.Parse(transactionID)
	if err != nil {
		return
	}
	var p Paiement
	if err := config.DB.First(&p, "id = ?", id).Error; err != nil {
		return
	}
	if p.ReferencePrestataire == "" || p.Traite {
		return
	}
	appliquerEtatPrestataire(&p)
}

// TraiterCallbackFusion traite un webhook MoneyFusion (déjà journalisé).
//
// MoneyFusion envoie plusieurs notifications pour une même transaction (pending
// répété, puis completed/cancelled) : l'idempotence est assurée en aval par la
// transition atomique du paiement. On ne croit jamais l'événement sur parole,
// on interroge `paiementNotif` (skill FusionMoney §4).
//
// [refInterne] est notre référence, lue dans `personal_Info` ; [tokenPay] sert
// de repli quand le prestataire ne la renvoie pas.
func TraiterCallbackFusion(refInterne, tokenPay string) {
	var p Paiement
	requete := config.DB.Where("prestataire = ?", PrestataireFusionMoney)
	switch {
	case refInterne != "":
		requete = requete.Where("reference = ?", refInterne)
	case tokenPay != "":
		requete = requete.Where("reference_prestataire = ?", tokenPay)
	default:
		return
	}
	if err := requete.First(&p).Error; err != nil {
		return
	}
	if p.ReferencePrestataire == "" || p.Traite {
		return
	}
	appliquerEtatPrestataire(&p)
}
