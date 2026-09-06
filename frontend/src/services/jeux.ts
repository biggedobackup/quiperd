/** Module `jeux` — catalogue public (classé par catégorie), gestion admin. */
import { createServerFn } from '@tanstack/react-start'
import { appelBackend, enResultat, type Resultat } from '@/server/http-client'
import { appelAdmin, jetonAdmin } from '@/server/session'
import type { CategorieJeu, Jeu, StatutCatalogue } from '@/models/jeu'

/** Public : jeux actifs. Avec le cookie admin présent, le backend renvoie aussi les inactifs. */
export const listerJeux = createServerFn({ method: 'GET' })
  .inputValidator((d: { admin?: boolean } = {}) => d)
  .handler(async ({ data }) => {
    const jeton = data.admin ? jetonAdmin() : null
    return appelBackend<Jeu[]>('/jeux', { jeton })
  })

export const creerJeu = createServerFn({ method: 'POST' })
  .inputValidator((d: { nom: string; categorie: CategorieJeu; statut?: StatutCatalogue }) => d)
  .handler(async ({ data }): Promise<Resultat<Jeu>> =>
    enResultat(appelAdmin<Jeu>('/jeux', { methode: 'POST', corps: data })),
  )

export const modifierJeu = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string; nom?: string; categorie?: CategorieJeu; statut?: StatutCatalogue }) => d)
  .handler(async ({ data }): Promise<Resultat<Jeu>> => {
    const { id, ...champs } = data
    return enResultat(appelAdmin<Jeu>(`/jeux/${id}`, { methode: 'PATCH', corps: champs }))
  })

export const supprimerJeu = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<void>> =>
    enResultat(appelAdmin<void>(`/jeux/${data.id}`, { methode: 'DELETE' })),
  )
