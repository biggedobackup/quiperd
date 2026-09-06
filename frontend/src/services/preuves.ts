/**
 * Module `preuves` — liste et vérification. L'upload (progression) et le téléchargement
 * (balise média) passent par les routes serveur `src/routes/api/…` (pont authentifié).
 */
import { createServerFn } from '@tanstack/react-start'
import { enResultat, type Resultat } from '@/server/http-client'
import { appelAdmin, appelJoueur } from '@/server/session'
import type { PreuveMatch, StatutPreuve } from '@/models/preuve-match'
import type { RoleAppel } from './matchs'

export const listerPreuves = createServerFn({ method: 'GET' })
  .inputValidator((d: { matchId: string; role?: RoleAppel }) => d)
  .handler(async ({ data }) => {
    const appel = data.role === 'admin' ? appelAdmin : appelJoueur
    return appel<PreuveMatch[]>(`/matchs/${data.matchId}/preuves`)
  })

export const verifierPreuve = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string; statut: Extract<StatutPreuve, 'validee' | 'rejetee'>; motifRejet?: string }) => d)
  .handler(async ({ data }): Promise<Resultat<{ statut: string }>> =>
    enResultat(
      appelAdmin<{ statut: string }>(`/preuves/${data.id}`, {
        methode: 'PATCH',
        corps: { statut: data.statut, motifRejet: data.motifRejet ?? '' },
      }),
    ),
  )

/** URL (origine frontend) à donner aux balises <img>/<video> : la route serveur relaie le fichier. */
export function urlFichierPreuve(preuveId: string, role: RoleAppel = 'joueur'): string {
  return `/api/preuves/${preuveId}/fichier?role=${role}`
}
