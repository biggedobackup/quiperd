/**
 * Session côté serveur : cookies HttpOnly (`qp_session` joueur, `qp_admin` administrateur),
 * lecture du jeton pour les appels backend. Le JWT n'est jamais lu ni manipulé côté client.
 *
 * Module SERVEUR UNIQUEMENT : importé exclusivement depuis des handlers de server functions
 * (`services/`, `session-fns.ts`) ou des routes serveur — jamais depuis un composant ni un
 * `beforeLoad` (voir `gardes.ts` pour la partie utilisable côté client).
 */
import { getRequest, getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { ErreurApi, appelBackend } from './http-client'

export const COOKIE_JOUEUR = 'qp_session'
export const COOKIE_ADMIN = 'qp_admin'
const DUREE_MAX_SECONDES = 72 * 3600 // alignée sur JWT_EXPIRATION_HEURES du backend

export type NomCookie = typeof COOKIE_JOUEUR | typeof COOKIE_ADMIN

/**
 * Attribut `Secure` des cookies : décidé par le schéma réellement vu par le visiteur, jamais par
 * `NODE_ENV` seul. Derrière un reverse proxy (Caddy, Cloudflare Tunnel) c'est `X-Forwarded-Proto`
 * qui fait foi : le même serveur peut être joint en HTTPS via le tunnel et en HTTP simple sur le
 * réseau local — un cookie `Secure` posé sur une visite HTTP serait refusé par le navigateur, donc
 * aucune connexion possible. À défaut d'en-tête, l'origine publique `SITE_URL` décide.
 */
function estSecurise(): boolean {
  try {
    const transmis = getRequestHeader('x-forwarded-proto')
    if (transmis) return transmis.split(',')[0]?.trim().toLowerCase() === 'https'
  } catch {
    // hors contexte de requête : on retombe sur la configuration
  }
  const site = process.env.SITE_URL
  if (site) return site.startsWith('https://')
  if (process.env.NODE_ENV === 'production') return true
  try {
    return new URL(getRequest().url).protocol === 'https:'
  } catch {
    return false
  }
}

/** Lit un cookie depuis un en-tête `Cookie` brut (routes serveur : la requête est passée en paramètre). */
export function lireCookieDepuis(enTeteCookie: string | null | undefined, nom: NomCookie): string | null {
  const brut = enTeteCookie
  if (!brut) return null
  for (const morceau of brut.split(';')) {
    const [cle, ...reste] = morceau.trim().split('=')
    if (cle === nom) {
      const valeur = reste.join('=')
      try {
        return decodeURIComponent(valeur)
      } catch {
        return valeur
      }
    }
  }
  return null
}

/** Lit un cookie de la requête courante (server functions). */
export function lireCookie(nom: NomCookie): string | null {
  return lireCookieDepuis(getRequestHeader('cookie'), nom)
}

/** Jeton (joueur ou admin selon `role`) pour une route serveur qui reçoit la `Request`. */
export function jetonDepuisRequete(request: Request, role: 'joueur' | 'admin'): string | null {
  return lireCookieDepuis(request.headers.get('cookie'), role === 'admin' ? COOKIE_ADMIN : COOKIE_JOUEUR)
}

export function ecrireCookie(nom: NomCookie, jeton: string, expirationIso?: string): void {
  let maxAge = DUREE_MAX_SECONDES
  if (expirationIso) {
    const delta = Math.floor((new Date(expirationIso).getTime() - Date.now()) / 1000)
    if (Number.isFinite(delta) && delta > 60) maxAge = delta
  }
  const attributs = [
    `${nom}=${encodeURIComponent(jeton)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax', // Lax et non Strict : retour depuis la page de paiement hébergée (return_url)
    `Max-Age=${maxAge}`,
  ]
  if (estSecurise()) attributs.push('Secure')
  setResponseHeader('Set-Cookie', attributs.join('; '))
}

export function supprimerCookie(nom: NomCookie): void {
  const attributs = [`${nom}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (estSecurise()) attributs.push('Secure')
  setResponseHeader('Set-Cookie', attributs.join('; '))
}

/** Jeton du joueur connecté (ou null). */
export function jetonJoueur(): string | null {
  return lireCookie(COOKIE_JOUEUR)
}

/** Jeton de l'administrateur connecté (ou null). */
export function jetonAdmin(): string | null {
  return lireCookie(COOKIE_ADMIN)
}

/** Jeton exigé pour un appel joueur : sans cookie → redirection vers la connexion. */
export function exigerJetonJoueur(): string {
  const jeton = jetonJoueur()
  if (!jeton) throw redirect({ to: '/connexion' })
  return jeton
}

export function exigerJetonAdmin(): string {
  const jeton = jetonAdmin()
  if (!jeton) throw redirect({ to: '/admin/connexion' })
  return jeton
}

/** Appel backend authentifié joueur ; un 401 supprime le cookie et redirige. */
export async function appelJoueur<T>(chemin: string, options: Parameters<typeof appelBackend>[1] = {}): Promise<T> {
  const jeton = exigerJetonJoueur()
  try {
    return await appelBackend<T>(chemin, { ...options, jeton })
  } catch (e) {
    if (e instanceof ErreurApi && e.statut === 401) {
      supprimerCookie(COOKIE_JOUEUR)
      throw redirect({ to: '/connexion' })
    }
    throw e
  }
}

/** Appel backend authentifié administrateur ; un 401 supprime le cookie et redirige. */
export async function appelAdmin<T>(chemin: string, options: Parameters<typeof appelBackend>[1] = {}): Promise<T> {
  const jeton = exigerJetonAdmin()
  try {
    return await appelBackend<T>(chemin, { ...options, jeton })
  } catch (e) {
    if (e instanceof ErreurApi && e.statut === 401) {
      supprimerCookie(COOKIE_ADMIN)
      throw redirect({ to: '/admin/connexion' })
    }
    throw e
  }
}
