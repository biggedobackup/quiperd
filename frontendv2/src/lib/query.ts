/**
 * Clés TanStack Query — une seule source, organisée par module backend.
 * Chaque mutation invalide la famille concernée (`cles.defis.tous`…).
 */
import type { FiltresDefis, FiltresDefisPublics } from '@/models/defi'

export const cles = {
  session: ['session'] as const,
  sessionAdmin: ['session', 'admin'] as const,
  jeux: ['jeux'] as const,
  plateformes: ['plateformes'] as const,
  regles: ['regles-financieres'] as const,
  defis: {
    tous: ['defis'] as const,
    /** Liste publique (site vitrine), sans jeton. */
    ouverts: (filtres: FiltresDefisPublics = {}) => ['defis', 'ouverts', filtres] as const,
    liste: (filtres: FiltresDefis = {}) => ['defis', 'liste', filtres] as const,
    mes: ['defis', 'mes'] as const,
    detail: (id: string) => ['defis', 'detail', id] as const,
  },
  matchs: {
    tous: ['matchs'] as const,
    liste: (statut?: string) => ['matchs', 'liste', statut ?? 'tous'] as const,
    /** Liste admin paginée (`?tous=1`) — sous la famille `matchs` pour être invalidée avec elle. */
    pageAdmin: (statut: string, page: number) => ['matchs', 'admin', { statut: statut || 'tous', page }] as const,
    detail: (id: string) => ['matchs', 'detail', id] as const,
    preuves: (id: string) => ['matchs', 'detail', id, 'preuves'] as const,
  },
  portefeuille: {
    tous: ['portefeuille'] as const,
    solde: ['portefeuille', 'solde'] as const,
    transactions: (page: number) => ['portefeuille', 'transactions', page] as const,
  },
  litiges: {
    tous: ['litiges'] as const,
    liste: (tous: boolean) => ['litiges', tous ? 'tous' : 'mes'] as const,
    /** Liste admin paginée (`?tous=1`). */
    pageAdmin: (page: number) => ['litiges', 'admin', { page }] as const,
  },
  notifications: ['notifications'] as const,
  comptesGamers: ['comptes-gamers'] as const,
  admin: {
    statistiques: ['admin', 'statistiques'] as const,
    // Listes paginées : la page fait partie de la clé, la famille `*Tous` invalide toutes les pages.
    utilisateurs: (recherche: string, statut: string, page = 1) => ['admin', 'utilisateurs', 'liste', { recherche, statut, page }] as const,
    utilisateur: (id: string) => ['admin', 'utilisateurs', 'detail', id] as const,
    utilisateursTous: ['admin', 'utilisateurs'] as const,
    paiements: (type: string, statut: string, page = 1) => ['admin', 'paiements', { type, statut, page }] as const,
    paiementsTous: ['admin', 'paiements'] as const,
    configurations: ['admin', 'configurations'] as const,
    journal: (action: string, page = 1) => ['admin', 'journal', { action, page }] as const,
    journalTous: ['admin', 'journal'] as const,
  },
}
