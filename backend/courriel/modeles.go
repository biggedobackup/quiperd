package courriel

import (
	"fmt"
	"html"
	"strings"
)

// Charte des e-mails QUI PERD — miroir du système de design du frontend :
// fond blanc, texte noir, un seul accent vert, aucun dégradé, aucune image externe
// (pas de pixel espion, rien à charger : le message s'affiche même hors ligne), une
// seule colonne de 600 px maximum pour rester lisible sur téléphone.
const (
	couleurEncre  = "#0e0f12" // noir : texte et bordures
	couleurVolt   = "#22c55e" // vert : accent, encadré du code
	couleurGain   = "#15803d" // vert foncé : lisible sur blanc
	couleurFondOK = "#e9f9ef" // vert très clair : fond d'encadré
	couleurGris   = "#f4f4f5" // surface discrète
	couleurTrait  = "#e4e4e7" // séparateurs
	couleurMuet   = "#6b7280" // texte secondaire
)

// gabarit habille un contenu HTML : en-tête « QUI PERD », corps, pied de page.
// Aucun style externe (les clients de messagerie ignorent <style>), tout est en ligne.
func gabarit(titre, contenu string) string {
	return `<div style="margin:0;padding:24px 12px;background-color:#ffffff;">` +
		`<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:` + couleurEncre + `;">` +
		`<div style="background-color:` + couleurEncre + `;color:#ffffff;padding:16px 20px;font-weight:700;letter-spacing:1px;font-size:18px;">QUI&nbsp;PERD</div>` +
		`<div style="border:1px solid ` + couleurTrait + `;border-top:none;padding:24px 20px;">` +
		`<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:` + couleurEncre + `;">` + html.EscapeString(titre) + `</h1>` +
		contenu +
		`</div>` +
		`<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:` + couleurMuet + `;">` +
		`Message automatique de la plateforme QUI PERD — merci de ne pas y répondre.` +
		`</p>` +
		`</div></div>`
}

func paragraphe(texte string) string {
	return `<p style="margin:0 0 14px;">` + html.EscapeString(texte) + `</p>`
}

// bouton rend un lien cliquable en pavé vert à texte noir (jamais de dégradé).
// L'URL complète est répétée en dessous : certains clients n'affichent pas les liens.
func bouton(libelle, lien string) string {
	l := html.EscapeString(lien)
	return `<p style="margin:0 0 14px;">` +
		`<a href="` + l + `" style="display:inline-block;background-color:` + couleurVolt + `;color:` + couleurEncre +
		`;text-decoration:none;font-weight:700;padding:12px 20px;border:2px solid ` + couleurEncre + `;">` +
		html.EscapeString(libelle) + `</a></p>` +
		`<p style="margin:0 0 14px;font-size:13px;word-break:break-all;color:` + couleurMuet + `;">` + l + `</p>`
}

// tableauMontants rend une petite table à deux colonnes (libellé / montant).
func tableauMontants(lignes [][2]string) string {
	var b strings.Builder
	b.WriteString(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:15px;">`)
	for i, l := range lignes {
		fond := ""
		gras := ""
		if i == len(lignes)-1 {
			fond = `background-color:` + couleurGris + `;`
			gras = `font-weight:700;`
		}
		b.WriteString(`<tr>` +
			`<td style="` + fond + `padding:8px 10px;border-bottom:1px solid ` + couleurTrait + `;">` + html.EscapeString(l[0]) + `</td>` +
			`<td style="` + fond + gras + `padding:8px 10px;border-bottom:1px solid ` + couleurTrait + `;text-align:right;white-space:nowrap;">` + html.EscapeString(l[1]) + `</td>` +
			`</tr>`)
	}
	b.WriteString(`</table>`)
	return b.String()
}

func bonjour(pseudo string) string {
	if strings.TrimSpace(pseudo) == "" {
		return "Bonjour,"
	}
	return "Bonjour " + pseudo + ","
}

// ─── Confirmation de l'adresse e-mail ─────────────────────────────────────────

// MessageVerification porte le code à 6 chiffres de confirmation d'inscription.
// Le code n'existe que dans ce message et dans Redis : il n'est jamais journalisé
// ni renvoyé dans une réponse HTTP.
func MessageVerification(pseudo, code string, minutes int) Message {
	texte := fmt.Sprintf(`%s

Bienvenue sur QUI PERD.

Votre code de confirmation est : %s

Saisissez-le dans l'application pour confirmer votre adresse e-mail. Ce code est
valable %d minutes et ne peut servir qu'une seule fois.

Tant que votre adresse n'est pas confirmée, vous pouvez déposer de l'argent mais pas
créer ni rejoindre un défi, ni demander un retrait.

Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.

— L'équipe QUI PERD`, bonjour(pseudo), code, minutes)

	contenu := paragraphe(bonjour(pseudo)) +
		paragraphe("Bienvenue sur QUI PERD. Voici votre code de confirmation :") +
		`<p style="margin:0 0 16px;text-align:center;">` +
		`<span style="display:inline-block;background-color:` + couleurFondOK + `;border:2px solid ` + couleurEncre +
		`;color:` + couleurEncre + `;font-size:30px;font-weight:700;letter-spacing:8px;padding:14px 20px;font-family:'Courier New',Courier,monospace;">` +
		html.EscapeString(code) + `</span></p>` +
		paragraphe(fmt.Sprintf("Saisissez-le dans l'application pour confirmer votre adresse. Il est valable %d minutes et ne sert qu'une fois.", minutes)) +
		paragraphe("Tant que votre adresse n'est pas confirmée, vous pouvez déposer de l'argent mais pas créer ni rejoindre un défi, ni demander un retrait.") +
		`<p style="margin:0;font-size:14px;color:` + couleurMuet + `;">Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.</p>`

	return Message{Sujet: "Votre code de confirmation QUI PERD", Texte: texte, HTML: gabarit("Confirmez votre adresse e-mail", contenu)}
}

// ─── Réinitialisation de mot de passe ─────────────────────────────────────────

// MessageMotDePasseOublie porte le lien de réinitialisation. La réponse HTTP de
// POST /auth/mot-de-passe-oublie reste volontairement identique que le compte existe
// ou non : seul le titulaire de la boîte reçoit ce message.
func MessageMotDePasseOublie(pseudo, lien string, minutes int) Message {
	texte := fmt.Sprintf(`%s

Vous avez demandé la réinitialisation de votre mot de passe QUI PERD.

Ouvrez ce lien pour choisir un nouveau mot de passe :
%s

Le lien est valable %d minutes et ne peut servir qu'une seule fois. Toutes vos
sessions seront fermées après le changement.

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de
passe actuel reste valable.

— L'équipe QUI PERD`, bonjour(pseudo), lien, minutes)

	contenu := paragraphe(bonjour(pseudo)) +
		paragraphe("Vous avez demandé la réinitialisation de votre mot de passe QUI PERD.") +
		bouton("Choisir un nouveau mot de passe", lien) +
		paragraphe(fmt.Sprintf("Ce lien est valable %d minutes et ne sert qu'une fois. Toutes vos sessions seront fermées après le changement.", minutes)) +
		`<p style="margin:0;font-size:14px;color:` + couleurMuet + `;">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.</p>`

	return Message{Sujet: "Réinitialisation de votre mot de passe QUI PERD", Texte: texte, HTML: gabarit("Réinitialisation de mot de passe", contenu)}
}

// ─── Retraits ─────────────────────────────────────────────────────────────────

// MessageRetraitDemande accuse réception d'une demande de retrait : montant reçu par le
// joueur, frais prélevés en plus, total débité du solde disponible et numéro Mobile Money
// masqué (seuls les 4 derniers chiffres apparaissent).
func MessageRetraitDemande(pseudo, montant, frais, total, devise, numeroMasque string) Message {
	texte := fmt.Sprintf(`%s

Votre demande de retrait a bien été enregistrée.

Montant que vous recevrez : %s %s
Frais de retrait          : %s %s
Total débité de votre solde : %s %s
Numéro Mobile Money       : %s

Le virement est en cours de traitement. Vous recevrez un message dès qu'il aura
abouti. En cas d'échec, la totalité (montant + frais) est recréditée sur votre
portefeuille.

— L'équipe QUI PERD`, bonjour(pseudo), montant, devise, frais, devise, total, devise, numeroMasque)

	contenu := paragraphe(bonjour(pseudo)) +
		paragraphe("Votre demande de retrait a bien été enregistrée.") +
		tableauMontants([][2]string{
			{"Montant que vous recevrez", montant + " " + devise},
			{"Frais de retrait", frais + " " + devise},
			{"Numéro Mobile Money", numeroMasque},
			{"Total débité de votre solde", total + " " + devise},
		}) +
		paragraphe("Le virement est en cours de traitement. Vous recevrez un message dès qu'il aura abouti.") +
		`<p style="margin:0;font-size:14px;color:` + couleurMuet + `;">En cas d'échec, la totalité (montant + frais) est recréditée sur votre portefeuille.</p>`

	return Message{Sujet: "Votre demande de retrait QUI PERD", Texte: texte, HTML: gabarit("Demande de retrait enregistrée", contenu)}
}

// MessageRetraitReussi confirme que le virement Mobile Money est parti.
func MessageRetraitReussi(pseudo, montant, frais, devise string) Message {
	texte := fmt.Sprintf(`%s

Votre retrait a été effectué.

Montant envoyé : %s %s
Frais retenus  : %s %s

La somme est en route vers votre compte Mobile Money. Le délai de mise à disposition
dépend de votre opérateur.

— L'équipe QUI PERD`, bonjour(pseudo), montant, devise, frais, devise)

	contenu := paragraphe(bonjour(pseudo)) +
		`<p style="margin:0 0 14px;color:` + couleurGain + `;font-weight:700;">Votre retrait a été effectué.</p>` +
		tableauMontants([][2]string{
			{"Montant envoyé", montant + " " + devise},
			{"Frais retenus", frais + " " + devise},
		}) +
		paragraphe("La somme est en route vers votre compte Mobile Money. Le délai de mise à disposition dépend de votre opérateur.")

	return Message{Sujet: "Votre retrait QUI PERD a été effectué", Texte: texte, HTML: gabarit("Retrait effectué", contenu)}
}

// MessageRetraitEchoue annonce l'échec du virement ET le recrédit intégral
// (montant + frais) : les frais ne sont acquis à la plateforme que si le retrait a
// réellement eu lieu.
func MessageRetraitEchoue(pseudo, montant, frais, total, devise string) Message {
	texte := fmt.Sprintf(`%s

Votre retrait n'a pas pu être effectué.

Montant demandé : %s %s
Frais réservés  : %s %s
Recrédité sur votre portefeuille : %s %s

La totalité, frais compris, a été recréditée sur votre solde disponible : vous ne
perdez rien. Vous pouvez relancer une demande de retrait quand vous le souhaitez.

— L'équipe QUI PERD`, bonjour(pseudo), montant, devise, frais, devise, total, devise)

	contenu := paragraphe(bonjour(pseudo)) +
		paragraphe("Votre retrait n'a pas pu être effectué.") +
		tableauMontants([][2]string{
			{"Montant demandé", montant + " " + devise},
			{"Frais réservés", frais + " " + devise},
			{"Recrédité sur votre portefeuille", total + " " + devise},
		}) +
		`<p style="margin:0 0 14px;color:` + couleurGain + `;font-weight:700;">La totalité, frais compris, a été recréditée sur votre solde disponible : vous ne perdez rien.</p>` +
		paragraphe("Vous pouvez relancer une demande de retrait quand vous le souhaitez.")

	return Message{Sujet: "Votre retrait QUI PERD n'a pas abouti", Texte: texte, HTML: gabarit("Retrait non abouti", contenu)}
}

// MasquerNumero ne conserve que les 4 derniers chiffres d'un numéro Mobile Money :
// un e-mail intercepté ne doit pas livrer le numéro complet du joueur.
func MasquerNumero(numero string) string {
	chiffres := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, numero)
	if len(chiffres) < 4 {
		return "•••• ••••"
	}
	return "•••• " + chiffres[len(chiffres)-4:]
}
