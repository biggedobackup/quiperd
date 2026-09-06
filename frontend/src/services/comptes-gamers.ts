/** Module `comptes_gamers` — identifiants du joueur par jeu/plateforme (propriétaire uniquement). */
import { createServerFn } from '@tanstack/react-start'
import { enResultat, type Resultat } from '@/server/http-client'
import { appelJoueur } from '@/server/session'
import type { CompteGamer } from '@/models/compte-gamer'

export const listerComptesGamers = createServerFn({ method: 'GET' }).handler(async () =>
  appelJoueur<CompteGamer[]>('/comptes-gamers'),
)

export interface DonneesCompteGamer {
  jeuId: string
  plateformeId: string
  identifiantJoueur: string
  nomAffichage?: string
}

export const creerCompteGamer = createServerFn({ method: 'POST' })
  .inputValidator((d: DonneesCompteGamer) => d)
  .handler(async ({ data }): Promise<Resultat<CompteGamer>> =>
    enResultat(appelJoueur<CompteGamer>('/comptes-gamers', { methode: 'POST', corps: data })),
  )

export const modifierCompteGamer = createServerFn({ method: 'POST' })
  .inputValidator((d: Partial<DonneesCompteGamer> & { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<CompteGamer>> => {
    const { id, ...champs } = data
    return enResultat(appelJoueur<CompteGamer>(`/comptes-gamers/${id}`, { methode: 'PATCH', corps: champs }))
  })

export const supprimerCompteGamer = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<void>> =>
    enResultat(appelJoueur<void>(`/comptes-gamers/${data.id}`, { methode: 'DELETE' })),
  )
