/**
 * Server functions de session : seules fonctions de `server/` appelables depuis le client
 * (elles deviennent des appels RPC). Le code serveur (cookies, backend) reste dans les handlers.
 */
import { createServerFn } from '@tanstack/react-start'
import { ErreurApi, appelBackend } from './http-client'
import { COOKIE_ADMIN, COOKIE_JOUEUR, jetonAdmin, jetonJoueur, supprimerCookie } from './session'
import type { Administrateur, SessionCourante, Utilisateur } from '@/models/utilisateur'

export interface SessionJoueur {
  role: 'joueur'
  utilisateur: Utilisateur
}

export interface SessionAdmin {
  role: 'admin'
  administrateur: Administrateur
}

/** Session joueur courante, `null` si absente ou invalide (le cookie invalide est effacé). */
export const obtenirSessionJoueur = createServerFn({ method: 'GET' }).handler(async (): Promise<SessionJoueur | null> => {
  const jeton = jetonJoueur()
  if (!jeton) return null
  try {
    const moi = await appelBackend<SessionCourante>('/auth/moi', { jeton })
    if (moi.role !== 'joueur') return null
    return { role: 'joueur', utilisateur: moi.utilisateur }
  } catch (e) {
    if (e instanceof ErreurApi && (e.statut === 401 || e.statut === 404)) {
      supprimerCookie(COOKIE_JOUEUR)
      return null
    }
    throw e
  }
})

/** Session administrateur courante, `null` si absente ou invalide. */
export const obtenirSessionAdmin = createServerFn({ method: 'GET' }).handler(async (): Promise<SessionAdmin | null> => {
  const jeton = jetonAdmin()
  if (!jeton) return null
  try {
    const moi = await appelBackend<SessionCourante>('/auth/moi', { jeton })
    if (moi.role !== 'admin') return null
    return { role: 'admin', administrateur: moi.administrateur }
  } catch (e) {
    if (e instanceof ErreurApi && (e.statut === 401 || e.statut === 404)) {
      supprimerCookie(COOKIE_ADMIN)
      return null
    }
    throw e
  }
})

/** Origine publique du site (Open Graph, liens absolus) — lue côté serveur, jamais `process` côté client. */
export const obtenirSiteUrl = createServerFn({ method: 'GET' }).handler(async () => process.env.SITE_URL ?? 'http://localhost:3000')
