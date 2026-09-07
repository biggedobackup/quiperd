/** Module `plateformes` — catalogue public (classé par famille), gestion admin. */
import { createServerFn } from '@tanstack/react-start'
import { appelBackend, enResultat, type Resultat } from '@/server/http-client'
import { appelAdmin, jetonAdmin } from '@/server/session'
import type { StatutCatalogue } from '@/models/jeu'
import type { FamillePlateforme, Plateforme } from '@/models/plateforme'

export const listerPlateformes = createServerFn({ method: 'GET' })
  .inputValidator((d: { admin?: boolean } = {}) => d)
  .handler(async ({ data }) => {
    const jeton = data.admin ? jetonAdmin() : null
    return appelBackend<Plateforme[]>('/plateformes', { jeton })
  })

export const creerPlateforme = createServerFn({ method: 'POST' })
  .inputValidator((d: { nom: string; famille: FamillePlateforme; statut?: StatutCatalogue }) => d)
  .handler(async ({ data }): Promise<Resultat<Plateforme>> =>
    enResultat(appelAdmin<Plateforme>('/plateformes', { methode: 'POST', corps: data })),
  )

export const modifierPlateforme = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string; nom?: string; famille?: FamillePlateforme; statut?: StatutCatalogue }) => d)
  .handler(async ({ data }): Promise<Resultat<Plateforme>> => {
    const { id, ...champs } = data
    return enResultat(appelAdmin<Plateforme>(`/plateformes/${id}`, { methode: 'PATCH', corps: champs }))
  })

export const supprimerPlateforme = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<void>> =>
    enResultat(appelAdmin<void>(`/plateformes/${data.id}`, { methode: 'DELETE' })),
  )
