// Package tempsreel diffuse en direct les changements d'état de la plateforme
// (défis, matchs, portefeuille, notifications, arbitrage) aux clients connectés
// en WebSocket. Il ne contient AUCUNE règle métier : les modules métier appellent
// Publier après avoir commité leur transaction.
//
// Règle d'import : tempsreel n'importe que config et utils. Les modules métier
// importent tempsreel (jamais l'inverse) — même discipline que le package jobs,
// ce qui garantit l'absence de cycle.
package tempsreel

import (
	"fmt"

	"github.com/google/uuid"
)

// ─── Salons ────────────────────────────────────────────────────────────────────
//
// Un salon est une chaîne d'abonnement. Un client ne reçoit que les événements
// des salons auxquels il est abonné ET auxquels sa session lui donne droit :
//   - SalonDefisPublics : ouvert à tous, y compris aux visiteurs non connectés ;
//   - SalonUtilisateur  : réservé à l'utilisateur lui-même (données d'argent) ;
//   - SalonMatch        : réservé aux deux joueurs du match et aux administrateurs ;
//   - SalonAdmin        : réservé aux administrateurs.
//
// Toute charge utile envoyée sur un salon public ne doit contenir que des données
// déjà publiques (celles de GET /api/defis/ouverts) — jamais un solde, un e-mail
// ni un identifiant de transaction.
const (
	SalonDefisPublics = "public:defis"
	SalonAdmin        = "admin"
)

// SalonUtilisateur est le salon privé d'un joueur ou d'un administrateur.
func SalonUtilisateur(id uuid.UUID) string { return "utilisateur:" + id.String() }

// SalonMatch est le salon des deux joueurs d'un match (les administrateurs y sont admis).
func SalonMatch(id uuid.UUID) string { return "match:" + id.String() }

// ─── Événements ────────────────────────────────────────────────────────────────
//
// Nom en `objet.action`, en français, aligné sur le vocabulaire du produit.
// Chaque constante est documentée par le salon qui la porte et la forme de sa charge.
const (
	// -- Connexion (émis par le hub lui-même, jamais par le métier) --

	// EvtConnexionPrete confirme l'ouverture du socket.
	// Salon : la connexion elle-même. Charge : {utilisateurId?, role, salons[]}.
	EvtConnexionPrete = "connexion.prete"
	// EvtConnexionRefusee signale un ticket invalide, expiré ou déjà consommé. La connexion
	// n'est PAS fermée : elle bascule en visiteur (salons publics seulement) et EvtConnexionPrete
	// suit immédiatement avec le rôle "visiteur". Au client de redemander un ticket s'il en veut un.
	// Charge : {raison}.
	EvtConnexionRefusee = "connexion.refusee"
	// EvtAbonnementConfirme répond à une action "abonner".
	// Charge : {salons[], refuses[]}.
	EvtAbonnementConfirme = "abonnement.confirme"

	// -- Défis (salon public:defis, + salon utilisateur du créateur) --

	// EvtDefiCree : un défi ouvert vient d'être créé. Charge : DefiListe (mêmes
	// champs que GET /api/defis/ouverts, libellés joints compris).
	EvtDefiCree = "defi.cree"
	// EvtDefiRejoint : le défi n'est plus ouvert, un adversaire l'a pris.
	// Charge : {defiId, matchId}. Les clients le retirent de la liste ouverte.
	EvtDefiRejoint = "defi.rejoint"
	// EvtDefiAnnule : annulé par son créateur. Charge : {defiId}.
	EvtDefiAnnule = "defi.annule"
	// EvtDefiExpire : expiré sans adversaire, publié par le worker Asynq.
	// Charge : {defiId}.
	EvtDefiExpire = "defi.expire"

	// -- Matchs (salon match:<id> + salon utilisateur de chaque joueur) --

	// EvtMatchCree : le match démarre. Charge : MatchEnrichi.
	EvtMatchCree = "match.cree"
	// EvtMatchPresence : un participant ouvre ou quitte la page du match. Émis par le hub
	// lui-même, à partir de l'action client "presence" et lors du départ du salon — la
	// DERNIÈRE connexion d'un joueur qui quitte le salon émet present=false, sans quoi la
	// pastille "en ligne" de l'adversaire resterait allumée indéfiniment.
	// Charge : {utilisateurId, present, surLaPage}.
	EvtMatchPresence = "match.presence"
	// EvtMatchScorePropose : un joueur a déclaré son score, l'autre doit confirmer
	// ou proposer un autre score. Charge : {matchId, manche, declarant, scorePour,
	// scoreContre, echeanceConfirmation}.
	EvtMatchScorePropose = "match.score_propose"
	// EvtMatchScoreConfirme : les deux déclarations concordent, le match est réglé
	// immédiatement. Charge : {matchId, manche, gagnantId?, perdantId?, scoreJoueur1?,
	// scoreJoueur2?} — les quatre derniers champs sont omis tant qu'ils ne sont pas déterminés.
	EvtMatchScoreConfirme = "match.score_confirme"
	// EvtMatchDesaccord : déclarations divergentes, preuves exigées des deux côtés.
	// Charge : {matchId, manche, echeancePreuve}.
	EvtMatchDesaccord = "match.desaccord"
	// EvtMatchNul : les deux joueurs déclarent un nul, chacun doit choisir entre
	// rejouer et partager. Charge : {matchId, manche, echeanceChoix}.
	EvtMatchNul = "match.nul"
	// EvtMatchNulChoix : un joueur a fait son choix, l'autre le voit en direct.
	// Charge : {matchId, manche, utilisateurId, choix}.
	EvtMatchNulChoix = "match.nul_choix"
	// EvtMatchRejoue : nouvelle manche, scores et déclarations remis à zéro, escrow
	// inchangé. Charge : {matchId, manche}.
	EvtMatchRejoue = "match.rejoue"
	// EvtMatchPartage : nul soldé par un partage. Charge : {matchId, rendu, commission}.
	EvtMatchPartage = "match.partage"
	// EvtMatchPreuveEnvoyee : un participant a téléversé une preuve.
	// Charge : {matchId, utilisateurId, preuveId, type}.
	EvtMatchPreuveEnvoyee = "match.preuve_envoyee"
	// EvtMatchLitigeOuvert. Charge : {matchId, litigeId, motif}.
	EvtMatchLitigeOuvert = "match.litige_ouvert"
	// EvtMatchLitigeResolu. Charge : {matchId, litigeId, decision}.
	EvtMatchLitigeResolu = "match.litige_resolu"
	// EvtMatchTermine : état final. Charge : MatchEnrichi + {gain, commission}.
	EvtMatchTermine = "match.termine"
	// EvtMatchChrono : le serveur pose ou déplace une échéance, le client l'égrène.
	// Charge : {matchId, manche, type, echeance}. `type` ∈ confirmation|preuve|choix_nul.
	EvtMatchChrono = "match.chrono"
	// EvtMatchAbandon : l'échéance a expiré, victoire au joueur qui avait déclaré.
	// Charge : {matchId, gagnantId, motif}.
	EvtMatchAbandon = "match.abandon"

	// -- Compte joueur (salon utilisateur:<id> uniquement) --

	// EvtPortefeuilleMaj : nouveau solde. Charge : {soldeDisponible, soldeBloque, devise}.
	EvtPortefeuilleMaj = "portefeuille.maj"
	// EvtTransactionCreee : nouvelle ligne de grand livre. Charge : TransactionPortefeuille.
	EvtTransactionCreee = "transaction.creee"
	// EvtPaiementStatut : dépôt ou retrait ayant changé d'état (webhook Mobile Money).
	// Charge : {paiementId, type, statut, montant, devise}.
	EvtPaiementStatut = "paiement.statut"
	// EvtNotificationNouvelle : notification in-app. Charge : Notification.
	EvtNotificationNouvelle = "notification.nouvelle"

	// -- Administration (salon admin) --

	// EvtAdminLitigeOuvert. Charge : {litigeId, matchId, motif}.
	EvtAdminLitigeOuvert = "admin.litige_ouvert"
	// EvtAdminPaiementATraiter. Charge : {paiementId, type, montant, utilisateurId}.
	EvtAdminPaiementATraiter = "admin.paiement_a_traiter"
	// EvtAdminPreuveAVerifier. Charge : {preuveId, matchId}.
	EvtAdminPreuveAVerifier = "admin.preuve_a_verifier"
	// EvtAdminKpi : compteurs du tableau de bord ayant bougé. Charge : partielle,
	// seuls les compteurs modifiés (fusion côté client).
	EvtAdminKpi = "admin.kpi"

	// -- Global (salon public:defis, tous clients) --

	// EvtCompteurEnLigne : nombre de connexions actives, débattu (au plus une fois
	// toutes les 5 s). Charge : {joueursEnLigne}.
	EvtCompteurEnLigne = "compteur.en_ligne"
)

// Enveloppe est le message envoyé au client. `Charge` est toujours un objet JSON.
type Enveloppe struct {
	Evenement  string `json:"evenement"`
	Salon      string `json:"salon,omitempty"`
	Horodatage string `json:"horodatage"`
	Charge     any    `json:"charge,omitempty"`
}

// String rend une enveloppe lisible dans les journaux.
func (e Enveloppe) String() string { return fmt.Sprintf("%s → %s", e.Evenement, e.Salon) }
