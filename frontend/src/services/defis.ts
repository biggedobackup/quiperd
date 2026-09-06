/** Module `defis` — liste publique des défis ouverts, liste joueur, mes défis, détail, création, rejoindre, annulation. */
import { createServerFn } from '@tanstack/react-start'
import { appelBackend, enResultat, requete, type Resultat } from '@/server/http-client'
import { appelJoueur } from '@/server/session'
import type { Defi, DefiListe, DetailDefi, FiltresDefis, FiltresDefisPublics, NouveauDefi } from '@/models/defi'
import type { MatchEnrichi } from '@/models/match'

/** Public (site vitrine) : défis ouverts en attente d'un adversaire — aucun jeton requis. */
export const listerDefisOuverts = createServerFn({ method: 'GET' })
  .inputValidator((d: FiltresDefisPublics = {}) => d)
  .handler(async ({ data }) =>
    appelBackend<DefiListe[]>(
      `/defis/ouverts${requete({ categorie: data.categorie, famille: data.famille, jeu: data.jeu, plateforme: data.plateforme, miseMax: data.miseMax })}`,
    ),
  )

export const listerDefis = createServerFn({ method: 'GET' })
  .inputValidator((d: FiltresDefis = {}) => d)
  .handler(async ({ data }) =>
    appelJoueur<DefiListe[]>(
      `/defis${requete({ categorie: data.categorie, famille: data.famille, jeu: data.jeu, plateforme: data.plateforme, miseMax: data.miseMax, mes: data.mes })}`,
    ),
  )

export const detailDefi = createServerFn({ method: 'GET' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => appelJoueur<DetailDefi>(`/defis/${data.id}`))

export const creerDefi = createServerFn({ method: 'POST' })
  .inputValidator((d: NouveauDefi) => d)
  .handler(async ({ data }): Promise<Resultat<Defi>> =>
    enResultat(appelJoueur<Defi>('/defis', { methode: 'POST', corps: data })),
  )

export const rejoindreDefi = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<MatchEnrichi>> =>
    enResultat(appelJoueur<MatchEnrichi>(`/defis/${data.id}/rejoindre`, { methode: 'POST' })),
  )

export const annulerDefi = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<void>> =>
    enResultat(appelJoueur<void>(`/defis/${data.id}`, { methode: 'DELETE' })),
  )
