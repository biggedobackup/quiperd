/** Module `matchs` — mes matchs, détail, déclaration de score, validation (admin), litige. */
import { createServerFn } from '@tanstack/react-start'
import { enResultat, requete, type Resultat } from '@/server/http-client'
import { appelAdmin, appelJoueur } from '@/server/session'
import { TAILLE_PAGE_ADMIN, type Page } from '@/models/pagination'
import type { Litige } from '@/models/litige'
import type { Declaration, DetailMatch, MatchEnrichi } from '@/models/match'

export type RoleAppel = 'joueur' | 'admin'

/** Mes matchs (joueur : tableau). En rôle admin, préférer `listerMatchsAdmin` (paginé). */
export const listerMatchs = createServerFn({ method: 'GET' })
  .inputValidator((d: { statut?: string; role?: RoleAppel } = {}) => d)
  .handler(async ({ data }) => {
    if (data.role === 'admin') {
      // Compatibilité : la liste admin est paginée côté API ; l'enveloppe est aplatie si elle est renvoyée.
      const r = await appelAdmin<MatchEnrichi[] | Page<MatchEnrichi>>(`/matchs${requete({ tous: true, statut: data.statut, taille: 100 })}`)
      return Array.isArray(r) ? r : r.elements
    }
    return appelJoueur<MatchEnrichi[]>(`/matchs${requete({ statut: data.statut })}`)
  })

/** `GET /api/matchs?tous=1&page=&taille=10` (admin) — enveloppe paginée, triée par date décroissante. */
export const listerMatchsAdmin = createServerFn({ method: 'GET' })
  .inputValidator((d: { statut?: string; page?: number } = {}) => d)
  .handler(async ({ data }) =>
    appelAdmin<Page<MatchEnrichi>>(
      `/matchs${requete({ tous: true, statut: data.statut, page: data.page ?? 1, taille: TAILLE_PAGE_ADMIN })}`,
    ),
  )

export const detailMatch = createServerFn({ method: 'GET' })
  .inputValidator((d: { id: string; role?: RoleAppel }) => d)
  .handler(async ({ data }) => {
    const appel = data.role === 'admin' ? appelAdmin : appelJoueur
    return appel<DetailMatch>(`/matchs/${data.id}`)
  })

export const declarerScore = createServerFn({ method: 'POST' })
  .inputValidator((d: Declaration & { matchId: string }) => d)
  .handler(async ({ data }): Promise<Resultat<MatchEnrichi>> => {
    const { matchId, ...corps } = data
    return enResultat(appelJoueur<MatchEnrichi>(`/matchs/${matchId}/declaration`, { methode: 'POST', corps }))
  })

export const validerMatch = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<MatchEnrichi>> =>
    enResultat(appelAdmin<MatchEnrichi>(`/matchs/${data.id}/validation`, { methode: 'POST' })),
  )

export const ouvrirLitige = createServerFn({ method: 'POST' })
  .inputValidator((d: { matchId: string; motif: string }) => d)
  .handler(async ({ data }): Promise<Resultat<Litige>> =>
    enResultat(
      appelJoueur<Litige>(`/matchs/${data.matchId}/litige`, { methode: 'POST', corps: { motif: data.motif } }),
    ),
  )
