/** Module `paiements` — dépôt, retrait (joueur) ; suivi et validation manuelle (admin). */
import { createServerFn } from '@tanstack/react-start'
import { appelBackend, enResultat, requete, type Resultat } from '@/server/http-client'
import { appelAdmin, appelJoueur } from '@/server/session'
import { TAILLE_PAGE_ADMIN, type Page } from '@/models/pagination'
import type { DemandeDepot, DemandeRetrait, Paiement, PrestatairePublic, ReponseDepot, StatutPaiement } from '@/models/paiement'

/**
 * `GET /api/paiements/prestataires` (public) — les seuls moyens de paiement que le
 * backend acceptera. Ne jamais proposer au joueur un prestataire codé en dur côté
 * client : une passerelle non configurée renvoie 400 et le joueur ne comprend pas.
 */
export const listerPrestataires = createServerFn({ method: 'GET' })
  .handler(async () => appelBackend<PrestatairePublic[]>('/paiements/prestataires'))

export const deposer = createServerFn({ method: 'POST' })
  .inputValidator((d: DemandeDepot) => d)
  .handler(async ({ data }): Promise<Resultat<ReponseDepot>> =>
    enResultat(appelJoueur<ReponseDepot>('/paiements/depot', { methode: 'POST', corps: data })),
  )

export const retirer = createServerFn({ method: 'POST' })
  .inputValidator((d: DemandeRetrait) => d)
  .handler(async ({ data }): Promise<Resultat<Paiement>> =>
    enResultat(appelJoueur<Paiement>('/paiements/retrait', { methode: 'POST', corps: data })),
  )

/** `GET /api/paiements?page=&taille=10` (admin) — enveloppe paginée, triée par date décroissante. */
export const listerPaiements = createServerFn({ method: 'GET' })
  .inputValidator((d: { type?: string; statut?: string; page?: number } = {}) => d)
  .handler(async ({ data }) =>
    appelAdmin<Page<Paiement>>(
      `/paiements${requete({ type: data.type, statut: data.statut, page: data.page ?? 1, taille: TAILLE_PAGE_ADMIN })}`,
    ),
  )

export const changerStatutPaiement = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string; statut: Extract<StatutPaiement, 'reussi' | 'echoue' | 'rembourse'> }) => d)
  .handler(async ({ data }): Promise<Resultat<{ statut: string }>> =>
    enResultat(
      appelAdmin<{ statut: string }>(`/paiements/${data.id}/statut`, {
        methode: 'PATCH',
        corps: { statut: data.statut },
      }),
    ),
  )
