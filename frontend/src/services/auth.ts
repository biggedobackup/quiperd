/**
 * Module `auth` — connexion joueur ET administrateur (deux routes, deux cookies),
 * inscription, déconnexion, mot de passe. Pose/supprime les cookies via server/session.ts.
 */
import { createServerFn } from '@tanstack/react-start'
import { appelBackend, enResultat, type Resultat } from '@/server/http-client'
import {
  COOKIE_ADMIN,
  COOKIE_JOUEUR,
  appelAdmin,
  appelJoueur,
  ecrireCookie,
  jetonAdmin,
  jetonJoueur,
  supprimerCookie,
} from '@/server/session'
import type { Administrateur, Utilisateur } from '@/models/utilisateur'

export interface Identifiants {
  email: string
  motDePasse: string
}

export interface DonneesInscription {
  nomUtilisateur: string
  email: string
  motDePasse: string
  telephone?: string
  pays?: string
}

interface ReponseConnexionJoueur {
  utilisateur: Utilisateur
  jeton: string
  expiration: string
}

interface ReponseConnexionAdmin {
  administrateur: Administrateur
  jeton: string
  expiration: string
}

export const connexionJoueur = createServerFn({ method: 'POST' })
  .inputValidator((d: Identifiants) => d)
  .handler(async ({ data }): Promise<Resultat<Utilisateur>> => {
    const r = await enResultat(appelBackend<ReponseConnexionJoueur>('/auth/connexion', { methode: 'POST', corps: data }))
    if (!r.ok) return r
    ecrireCookie(COOKIE_JOUEUR, r.donnees.jeton, r.donnees.expiration)
    return { ok: true, donnees: r.donnees.utilisateur }
  })

export const inscription = createServerFn({ method: 'POST' })
  .inputValidator((d: DonneesInscription) => d)
  .handler(async ({ data }): Promise<Resultat<Utilisateur>> => {
    const r = await enResultat(appelBackend<ReponseConnexionJoueur>('/auth/inscription', { methode: 'POST', corps: data }))
    if (!r.ok) return r
    ecrireCookie(COOKIE_JOUEUR, r.donnees.jeton, r.donnees.expiration)
    return { ok: true, donnees: r.donnees.utilisateur }
  })

export const connexionAdmin = createServerFn({ method: 'POST' })
  .inputValidator((d: Identifiants) => d)
  .handler(async ({ data }): Promise<Resultat<Administrateur>> => {
    const r = await enResultat(
      appelBackend<ReponseConnexionAdmin>('/auth/admin/connexion', { methode: 'POST', corps: data }),
    )
    if (!r.ok) return r
    ecrireCookie(COOKIE_ADMIN, r.donnees.jeton, r.donnees.expiration)
    return { ok: true, donnees: r.donnees.administrateur }
  })

/** Déconnexion joueur : invalide la session Redis côté backend puis efface le cookie. */
export const deconnexionJoueur = createServerFn({ method: 'POST' }).handler(async () => {
  const jeton = jetonJoueur()
  if (jeton) {
    try {
      await appelBackend('/auth/deconnexion', { methode: 'POST', jeton })
    } catch {
      // le cookie est effacé quoi qu'il arrive
    }
  }
  supprimerCookie(COOKIE_JOUEUR)
  return { deconnecte: true }
})

export const deconnexionAdmin = createServerFn({ method: 'POST' }).handler(async () => {
  const jeton = jetonAdmin()
  if (jeton) {
    try {
      await appelBackend('/auth/deconnexion', { methode: 'POST', jeton })
    } catch {
      // idem
    }
  }
  supprimerCookie(COOKIE_ADMIN)
  return { deconnecte: true }
})

export const motDePasseOublie = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<Resultat<{ message: string }>> =>
    enResultat(appelBackend<{ message: string }>('/auth/mot-de-passe-oublie', { methode: 'POST', corps: data })),
  )

export const reinitialiserMotDePasse = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; nouveauMotDePasse: string }) => d)
  .handler(async ({ data }): Promise<Resultat<{ message: string }>> =>
    enResultat(
      appelBackend<{ message: string }>('/auth/reinitialisation-mot-de-passe', { methode: 'POST', corps: data }),
    ),
  )

/**
 * Confirmation de l'adresse e-mail par le code à 6 chiffres reçu par courriel.
 * `400` code faux ou expiré (le corps peut porter `essaisRestants`), `409` adresse déjà
 * confirmée, `429` trop d'essais — l'écran traduit chacun de ces cas en français.
 */
export const confirmerEmail = createServerFn({ method: 'POST' })
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ data }): Promise<Resultat<{ emailVerifie: boolean }>> =>
    enResultat(
      appelJoueur<{ emailVerifie: boolean }>('/auth/verification-email', { methode: 'POST', corps: { code: data.code } }),
    ),
  )

/**
 * Renvoi du code de confirmation. `prochainEnvoiDans` (secondes) borne le prochain envoi ;
 * un `429` signale qu'un code est parti il y a moins d'une minute. Le compte à rebours de
 * l'écran est purement client : il n'interroge jamais l'API pour savoir où il en est.
 */
export const renvoyerCodeEmail = createServerFn({ method: 'POST' }).handler(
  async (): Promise<Resultat<{ envoye: boolean; prochainEnvoiDans?: number }>> =>
    enResultat(
      appelJoueur<{ envoye: boolean; prochainEnvoiDans?: number }>('/auth/verification-email/renvoyer', {
        methode: 'POST',
        corps: {},
      }),
    ),
)

export interface ChangementMotDePasse {
  motDePasseActuel: string
  nouveauMotDePasse: string
  role: 'joueur' | 'admin'
}

export const changerMotDePasse = createServerFn({ method: 'POST' })
  .inputValidator((d: ChangementMotDePasse) => d)
  .handler(async ({ data }): Promise<Resultat<{ message: string }>> => {
    const corps = { motDePasseActuel: data.motDePasseActuel, nouveauMotDePasse: data.nouveauMotDePasse }
    const appel = data.role === 'admin' ? appelAdmin : appelJoueur
    return enResultat(appel<{ message: string }>('/auth/changer-mot-de-passe', { methode: 'POST', corps }))
  })
