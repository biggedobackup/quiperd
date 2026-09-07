import type { ResultatDeclare } from './resultat-declare'

/**
 * Table `matchs` (§7.6). `montantMise` est dénormalisé depuis le défi.
 *
 * Machine à états du parcours joueur (miroir de `backend/matchs/models.go`) :
 *
 *   en_cours ──(1re déclaration)──► en_cours + échéance de confirmation
 *      ├─ confirmation / déclaration identique ─► termine (règlement immédiat, sans preuve)
 *      ├─ déclarations divergentes ────────────► preuve_requise ─► litige ─► termine
 *      ├─ nul déclaré des deux côtés ──────────► nul_en_attente ─► en_cours (manche + 1) | termine (partage)
 *      └─ échéance dépassée ───────────────────► termine (abandon : victoire au déclarant)
 *
 * `verification` ne fait PLUS partie du parcours joueur : deux déclarations concordantes
 * règlent le match immédiatement, quel que soit le montant. Le statut reste déclaré ici
 * parce que des lignes historiques y sont encore, et que l'administration peut toujours
 * les régler à la main — l'affichage ne doit jamais casser dessus.
 */
export type StatutMatch = 'en_cours' | 'preuve_requise' | 'nul_en_attente' | 'verification' | 'litige' | 'termine'

/**
 * Type de chrono en cours sur le match (colonne `echeance_type`, et champ `type` de
 * l'événement `match.chrono`). `declaration` fait partie du contrat temps réel gelé même si
 * le backend ne pose aujourd'hui que les trois autres.
 */
/** Les trois seuls chronos posés par le backend (`backend/matchs/models.go`). */
export type TypeEcheanceMatch = 'confirmation' | 'preuve' | 'choix_nul'

export interface MatchDefi {
  id: string
  dateCreation: string
  defiId: string
  joueur1Id: string
  joueur2Id: string
  scoreJoueur1?: number
  scoreJoueur2?: number
  gagnantId?: string
  perdantId?: string
  montantMise: string
  devise: string
  statut: StatutMatch
  /**
   * Numéro de manche : chaque « rejouer » accepté par les deux joueurs l'incrémente SANS
   * aucun mouvement d'argent. Les déclarations et les choix de nul sont datés par manche.
   * Absent des lignes créées avant l'introduction du rejeu : lire `match.manche ?? 1`.
   */
  manche?: number
  /** Échéance du chrono courant, posée par le serveur (ISO). Égrenée côté client. */
  echeance?: string
  echeanceType?: TypeEcheanceMatch | ''
  dateDebut?: string
  dateFin?: string
}

/** `GET /api/matchs` et `GET /api/matchs/:id` : match + libellés joints. */
export interface MatchEnrichi extends MatchDefi {
  joueur1Nom: string
  joueur2Nom: string
  /** Chemin de la photo de profil ; chaîne vide si le joueur n'en a pas. */
  joueur1Photo: string
  joueur2Photo: string
  jeuNom: string
  plateformeNom: string
}

/** Choix d'un joueur après un match nul déclaré des deux côtés. */
export type ChoixNulValeur = 'rejouer' | 'partager'

/** Table `choix_nuls` : une ligne par joueur et par manche. */
export interface ChoixNulMatch {
  id: string
  dateCreation: string
  matchId: string
  utilisateurId: string
  manche?: number
  choix: ChoixNulValeur
  dateChoix: string
}

/** Réponse de `GET /api/matchs/:id` — toutes les manches confondues. */
export interface DetailMatch {
  match: MatchEnrichi
  declarations: ResultatDeclare[]
  /** Absent des réponses des versions antérieures du backend : lire `?? []`. */
  choixNuls?: ChoixNulMatch[]
}


/**
 * Corps de `POST /matchs/:id/declaration`. Une seule forme, pour tous les jeux : le joueur
 * désigne l'issue de sa partie. Aucun score chiffré n'est demandé nulle part — qui tient à
 * noter le sien l'écrit dans le commentaire libre.
 */
export interface Declaration {
  resultat: ResultatDeclarable
  commentaire?: string
}

/** Issue d'un match, du point de vue du déclarant. */
export type ResultatDeclarable = 'gagne' | 'perdu' | 'nul'

/** Numéro de manche d'une ligne (match, déclaration, choix) — 1 par défaut. */
export function numeroManche(valeur: { manche?: number } | null | undefined): number {
  return valeur?.manche ?? 1
}
