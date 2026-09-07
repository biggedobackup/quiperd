/**
 * Contrat des événements temps réel — miroir exact de `backend/tempsreel/evenements.go`.
 * Toute modification doit être faite des DEUX côtés dans le même commit.
 *
 * Le serveur pousse ; le client ne redemande jamais périodiquement. Un seul
 * `invalidateQueries` est autorisé à la (re)connexion du socket : c'est une
 * resynchronisation après coupure, pas du rafraîchissement cyclique.
 */
import type { DefiListe } from '@/models/defi'
import type { MatchEnrichi } from '@/models/match'
import type { Notification } from '@/models/notification'
import type { TransactionPortefeuille } from '@/models/transaction-portefeuille'

/** Salons d'abonnement. Un salon interdit est refusé par le serveur, jamais silencieux. */
export const salons = {
  defisPublics: 'public:defis',
  admin: 'admin',
  utilisateur: (id: string) => `utilisateur:${id}`,
  match: (id: string) => `match:${id}`,
} as const

/** Échéance posée par le serveur, égrenée côté client (aucun appel réseau). */
export type TypeChrono = 'confirmation' | 'preuve' | 'choix_nul'

export type ChoixNul = 'rejouer' | 'partager'

/**
 * Charge utile par événement. `EvenementTempsReel` est l'union discriminée
 * consommée par le routeur d'événements : un `switch` dessus est exhaustif.
 */
export interface ChargesTempsReel {
  // Connexion (émis par le hub).
  // `connexion.refusee` ne ferme PAS le socket : il signale un ticket invalide, expiré ou déjà
  // consommé, puis `connexion.prete` suit avec le rôle « visiteur ». Au client de redemander un ticket.
  // `abonnement.confirme` répond à `abonner` ET à `desabonner` : `salons` est la liste COMPLÈTE des
  // salons de la connexion après l'action, `refuses` ceux que cette requête s'est vu refuser.
  'connexion.prete': { utilisateurId?: string; role: 'joueur' | 'admin' | 'visiteur'; salons: string[] }
  'connexion.refusee': { raison: string }
  'abonnement.confirme': { salons: string[]; refuses: string[] }

  // Défis
  'defi.cree': DefiListe
  'defi.rejoint': { defiId: string; matchId: string }
  'defi.annule': { defiId: string }
  'defi.expire': { defiId: string }

  // Matchs
  'match.cree': MatchEnrichi
  // Émis par le hub : action `presence` du client, et `present: false` quand la DERNIÈRE connexion
  // d'un joueur quitte le salon du match (onglet fermé), sinon la pastille « en ligne » de
  // l'adversaire resterait allumée indéfiniment.
  'match.presence': { utilisateurId: string; present: boolean; surLaPage: boolean }
  'match.score_propose': {
    matchId: string
    manche: number
    declarant: string
    scorePour: number
    scoreContre: number
    echeanceConfirmation: string
  }
  // Gagnant, perdant et scores sont facultatifs : le serveur les omet quand ils ne sont pas
  // encore déterminés. Toujours vérifier leur présence avant de les écrire dans le cache.
  'match.score_confirme': {
    matchId: string
    manche: number
    gagnantId?: string
    perdantId?: string
    scoreJoueur1?: number
    scoreJoueur2?: number
  }
  'match.desaccord': { matchId: string; manche: number; echeancePreuve: string }
  'match.nul': { matchId: string; manche: number; echeanceChoix: string }
  'match.nul_choix': { matchId: string; manche: number; utilisateurId: string; choix: ChoixNul }
  'match.rejoue': { matchId: string; manche: number }
  'match.partage': { matchId: string; rendu: string; commission: string }
  'match.preuve_envoyee': { matchId: string; utilisateurId: string; preuveId: string; type: string }
  'match.litige_ouvert': { matchId: string; litigeId: string; motif: string }
  'match.litige_resolu': { matchId: string; litigeId: string; decision: string }
  'match.termine': MatchEnrichi & { gain: string; commission: string }
  'match.chrono': { matchId: string; manche: number; type: TypeChrono; echeance: string }
  'match.abandon': { matchId: string; gagnantId: string; motif: string }

  // Compte joueur
  // `soldeNonJoue` / `soldeRetirable` voyagent avec les deux soldes : un dépôt confirmé ou une
  // mise bloquée change le plafond de retrait autant que le solde lui-même.
  'portefeuille.maj': { soldeDisponible: string; soldeBloque: string; soldeNonJoue: string; soldeRetirable: string; devise: string }
  'transaction.creee': TransactionPortefeuille
  'paiement.statut': { paiementId: string; type: string; statut: string; montant: string; devise: string }
  'notification.nouvelle': Notification

  // Administration
  'admin.litige_ouvert': { litigeId: string; matchId: string; motif: string }
  'admin.paiement_a_traiter': { paiementId: string; type: string; montant: string; utilisateurId: string }
  'admin.preuve_a_verifier': { preuveId: string; matchId: string }
  // Compteurs du tableau de bord, en valeurs ABSOLUES. Les décomptes sont des nombres, les
  // montants des chaînes décimales (`shopspring/decimal` côté Go) : le client fusionne champ
  // par champ, ce qui corrige au passage toute dérive d'un compteur ajusté localement.
  'admin.kpi': Record<string, number | string>

  // Global
  'compteur.en_ligne': { joueursEnLigne: number }
}

export type NomEvenement = keyof ChargesTempsReel

/** Enveloppe reçue sur le socket. */
export type EvenementTempsReel = {
  [N in NomEvenement]: { evenement: N; salon?: string; horodatage: string; charge: ChargesTempsReel[N] }
}[NomEvenement]

/** Messages envoyés par le client au serveur. */
export type ActionClient =
  | { action: 'abonner'; salons: string[] }
  | { action: 'desabonner'; salons: string[] }
  | { action: 'presence'; salon: string; surLaPage: boolean }
  | { action: 'ping' }
