/**
 * Module `utilisateurs` — admin : liste paginée, détail, création, modification, suppression logique,
 * statut (suspension) ; joueur : mise à jour de son profil.
 */
import { createServerFn } from '@tanstack/react-start'
import { enResultat, requete, type Resultat } from '@/server/http-client'
import { appelAdmin, appelJoueur } from '@/server/session'
import { TAILLE_PAGE_ADMIN, type Page } from '@/models/pagination'
import type { Portefeuille } from '@/models/portefeuille'
import type {
  DetailUtilisateur,
  ModificationUtilisateurAdmin,
  NouvelUtilisateurAdmin,
  StatutUtilisateur,
  Utilisateur,
} from '@/models/utilisateur'

/** `GET /api/utilisateurs?page=&taille=10` (admin) — enveloppe paginée, triée par date décroissante. */
export const listerUtilisateurs = createServerFn({ method: 'GET' })
  .inputValidator((d: { recherche?: string; statut?: string; page?: number } = {}) => d)
  .handler(async ({ data }) =>
    appelAdmin<Page<Utilisateur>>(
      `/utilisateurs${requete({ recherche: data.recherche, statut: data.statut, page: data.page ?? 1, taille: TAILLE_PAGE_ADMIN })}`,
    ),
  )

/**
 * `GET /api/utilisateurs/:id` (admin) — utilisateur + portefeuille éventuel. Les deux formes de
 * réponse (`{ ...utilisateur, portefeuille }` ou `{ utilisateur, portefeuille }`) sont ramenées à la première.
 */
export const detailUtilisateur = createServerFn({ method: 'GET' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<DetailUtilisateur> => {
    const r = await appelAdmin<DetailUtilisateur | { utilisateur: Utilisateur; portefeuille?: Portefeuille }>(`/utilisateurs/${data.id}`)
    return 'utilisateur' in r ? { ...r.utilisateur, portefeuille: r.portefeuille } : r
  })

/** `POST /api/utilisateurs` (admin) → 201. Les `details` de validation sont reportés champ par champ. */
export const creerUtilisateur = createServerFn({ method: 'POST' })
  .inputValidator((d: NouvelUtilisateurAdmin) => d)
  .handler(async ({ data }): Promise<Resultat<Utilisateur>> =>
    enResultat(appelAdmin<Utilisateur>('/utilisateurs', { methode: 'POST', corps: data })),
  )

/** `PATCH /api/utilisateurs/:id` (admin) — n'envoyer que les champs modifiés. */
export const modifierUtilisateur = createServerFn({ method: 'POST' })
  .inputValidator((d: ModificationUtilisateurAdmin & { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<Utilisateur>> => {
    const { id, ...champs } = data
    return enResultat(appelAdmin<Utilisateur>(`/utilisateurs/${id}`, { methode: 'PATCH', corps: champs }))
  })

/**
 * `DELETE /api/utilisateurs/:id` (admin) → 204 : suppression logique (statut `supprime`, e-mail et pseudo
 * anonymisés) ; 409 `{ erreur }` si le joueur a une mise bloquée, un défi ouvert ou un match en cours.
 */
export const supprimerUtilisateur = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<void>> =>
    enResultat(appelAdmin<void>(`/utilisateurs/${data.id}`, { methode: 'DELETE' })),
  )

export interface ModificationProfil {
  id: string
  nomUtilisateur?: string
  telephone?: string
  photoProfil?: string
  pays?: string
}

export const modifierProfil = createServerFn({ method: 'POST' })
  .inputValidator((d: ModificationProfil) => d)
  .handler(async ({ data }): Promise<Resultat<Utilisateur>> => {
    const { id, ...champs } = data
    return enResultat(appelJoueur<Utilisateur>(`/utilisateurs/${id}`, { methode: 'PATCH', corps: champs }))
  })

export const changerStatutUtilisateur = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string; statut: Extract<StatutUtilisateur, 'actif' | 'suspendu'> }) => d)
  .handler(async ({ data }): Promise<Resultat<{ statut: string }>> =>
    enResultat(
      appelAdmin<{ statut: string }>(`/utilisateurs/${data.id}/statut`, {
        methode: 'PATCH',
        corps: { statut: data.statut },
      }),
    ),
  )
