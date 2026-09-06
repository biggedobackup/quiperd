/** Module `litiges` — mes litiges (joueur), tous les litiges et décision arbitrale (admin). */
import { createServerFn } from '@tanstack/react-start'
import { enResultat, requete, type Resultat } from '@/server/http-client'
import { appelAdmin, appelJoueur } from '@/server/session'
import { TAILLE_PAGE_ADMIN, type Page } from '@/models/pagination'
import type { DecisionArbitrale, Litige } from '@/models/litige'
import type { RoleAppel } from './matchs'

/** Mes litiges (joueur : tableau). En rôle admin, préférer `listerLitigesAdmin` (paginé). */
export const listerLitiges = createServerFn({ method: 'GET' })
  .inputValidator((d: { role?: RoleAppel } = {}) => d)
  .handler(async ({ data }) => {
    if (data.role === 'admin') {
      // Compatibilité (détail de litige) : la liste admin est paginée côté API ; l'enveloppe est aplatie si elle est renvoyée.
      const r = await appelAdmin<Litige[] | Page<Litige>>(`/litiges${requete({ tous: true, taille: 100 })}`)
      return Array.isArray(r) ? r : r.elements
    }
    return appelJoueur<Litige[]>('/litiges')
  })

/** `GET /api/litiges?tous=1&page=&taille=10` (admin) — enveloppe paginée, triée par date décroissante. */
export const listerLitigesAdmin = createServerFn({ method: 'GET' })
  .inputValidator((d: { page?: number } = {}) => d)
  .handler(async ({ data }) =>
    appelAdmin<Page<Litige>>(`/litiges${requete({ tous: true, page: data.page ?? 1, taille: TAILLE_PAGE_ADMIN })}`),
  )

export const deciderLitige = createServerFn({ method: 'POST' })
  .inputValidator((d: DecisionArbitrale & { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<{ statut: string; decision: string }>> => {
    const { id, ...corps } = data
    return enResultat(
      appelAdmin<{ statut: string; decision: string }>(`/litiges/${id}`, { methode: 'PATCH', corps }),
    )
  })
