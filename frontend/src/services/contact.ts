/**
 * Module `contact` — envoi public d'un message (« Nous contacter »), liste paginée, lecture,
 * traitement (statut, note interne) et suppression côté admin.
 * Les options TanStack Query et les clés de cache du module vivent ici (`clesContact`).
 */
import { createServerFn } from '@tanstack/react-start'
import { queryOptions } from '@tanstack/react-query'
import { appelBackend, enResultat, requete, type Resultat } from '@/server/http-client'
import { appelAdmin, jetonJoueur } from '@/server/session'
import type { MessageContact, ModificationMessageContact, NouveauMessageContact, StatutContact } from '@/models/contact'
import { TAILLE_PAGE_ADMIN, type Page } from '@/models/pagination'

/**
 * Public : `POST /api/contact`. Si un cookie joueur est présent, le jeton est transmis pour que
 * le backend rattache le message au compte (`utilisateurId`). Un jeton périmé ne doit jamais
 * bloquer un formulaire public : sur 401, l'envoi est retenté en anonyme.
 */
export const envoyerMessageContact = createServerFn({ method: 'POST' })
  .inputValidator((d: NouveauMessageContact) => d)
  .handler(async ({ data }): Promise<Resultat<MessageContact>> => {
    const jeton = jetonJoueur()
    const resultat = await enResultat(appelBackend<MessageContact>('/contact', { methode: 'POST', corps: data, jeton }))
    if (!resultat.ok && resultat.statut === 401 && jeton) {
      return enResultat(appelBackend<MessageContact>('/contact', { methode: 'POST', corps: data }))
    }
    return resultat
  })

/** Admin : liste paginée (10 par page, du plus récent au plus ancien) ; `statut` vide = tous. */
export const listerMessagesContact = createServerFn({ method: 'GET' })
  .inputValidator((d: { page?: number; statut?: StatutContact | '' } = {}) => d)
  .handler(async ({ data }) =>
    appelAdmin<Page<MessageContact>>(
      `/contact${requete({ page: data.page ?? 1, taille: TAILLE_PAGE_ADMIN, statut: data.statut })}`,
    ),
  )

export const detailMessageContact = createServerFn({ method: 'GET' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => appelAdmin<MessageContact>(`/contact/${data.id}`))

export const modifierMessageContact = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string } & ModificationMessageContact) => d)
  .handler(async ({ data }): Promise<Resultat<MessageContact>> => {
    const { id, ...champs } = data
    return enResultat(appelAdmin<MessageContact>(`/contact/${id}`, { methode: 'PATCH', corps: champs }))
  })

export const supprimerMessageContact = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<void>> =>
    enResultat(appelAdmin<void>(`/contact/${data.id}`, { methode: 'DELETE' })),
  )

/* ------------------------------------------------------------------ Cache TanStack Query */

/** Clés du module — `clesContact.tous` invalide listes et détails après chaque mutation. */
export const clesContact = {
  tous: ['admin', 'contact'] as const,
  liste: (page: number, statut: string) => ['admin', 'contact', 'liste', page, statut] as const,
  detail: (id: string) => ['admin', 'contact', 'detail', id] as const,
}

export const optionsMessagesContact = (page = 1, statut: StatutContact | '' = '') =>
  queryOptions({
    queryKey: clesContact.liste(page, statut),
    queryFn: () => listerMessagesContact({ data: { page, statut } }),
  })

export const optionsDetailMessageContact = (id: string) =>
  queryOptions({
    queryKey: clesContact.detail(id),
    queryFn: () => detailMessageContact({ data: { id } }),
  })
