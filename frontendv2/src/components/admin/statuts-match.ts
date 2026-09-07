/**
 * Filtres de statut de match propres à l'administration.
 *
 * Les LIBELLÉS et les couleurs ne sont pas redéfinis ici : ils viennent de `lib/statuts.ts`,
 * source unique du projet, qui décrit désormais les deux statuts nés de la nouvelle machine
 * à états (`backend/matchs/models.go`) :
 *   - `preuve_requise` : déclarations divergentes, les deux joueurs doivent produire une
 *     preuve ; le litige n'est ouvert qu'ensuite (ou à l'expiration de l'échéance) ;
 *   - `nul_en_attente` : nul déclaré des deux côtés, chaque joueur choisit rejouer ou
 *     partager ; sans accord, partage automatique à l'échéance.
 * Et `verification`, sorti du parcours joueur, ne subsiste que sur les lignes historiques et
 * pour la validation manuelle `POST /matchs/:id/validation`.
 *
 * Ce module ne porte que ce qui est spécifique au tableau admin : l'ordre des onglets, le
 * libellé « Tous » du filtre vide et la phrase qui dit à l'arbitre ce qu'il a à faire.
 */
import { decrireStatut } from '@/lib/statuts'

/** Onglets de la liste admin, dans l'ordre du parcours ; `''` = tous les statuts. */
export const STATUTS_MATCH_ADMIN = [
  '',
  'en_cours',
  'preuve_requise',
  'nul_en_attente',
  'litige',
  'verification',
  'termine',
] as const

export type StatutMatchAdmin = (typeof STATUTS_MATCH_ADMIN)[number]

/** Libellé d'onglet ; `''` devient « Tous ». Tout le reste vient de `lib/statuts.ts`. */
export function libelleStatutMatch(valeur: string): string {
  return valeur === '' ? 'Tous' : decrireStatut('match', valeur).libelle
}

/** Ce que l'administrateur doit faire — ou ne pas faire — dans chaque état. */
export const AIDE_STATUT_MATCH: Record<string, string> = {
  '': 'Tous les matchs, du plus récent au plus ancien.',
  en_cours: 'Match en jeu ou en attente de confirmation du second joueur : rien à faire, le règlement est automatique.',
  preuve_requise: 'Déclarations divergentes : les deux joueurs doivent envoyer une preuve. Le litige s’ouvre ensuite tout seul.',
  nul_en_attente: 'Nul déclaré des deux côtés : chaque joueur choisit rejouer ou partager. Sans accord, le partage est automatique.',
  litige: 'En attente d’arbitrage : la décision se rend depuis l’écran Litiges.',
  verification: 'Anciennes lignes en vérification manuelle : la validation règle le match et paie le gagnant.',
  termine: 'Match réglé, escrow soldé.',
}
