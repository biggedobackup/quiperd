/**
 * En-têtes de sécurité du site, posés à chaque rendu serveur.
 *
 * La politique de sécurité du contenu est **à nonce** : un jeton aléatoire est tiré
 * pour chaque requête, transmis au routeur (`ssr.nonce`) qui l'appose sur les scripts
 * qu'il injecte, et repris dans l'en-tête. Aucune exception `unsafe-inline` ni
 * `unsafe-eval` sur les scripts : un script injecté par une faille d'affichage n'a pas
 * le nonce du moment, donc ne s'exécute pas.
 *
 * Deux assouplissements assumés, tous deux sans exécution de code :
 *
 *   - `style-src`/`style-src-attr 'unsafe-inline'`. Le rendu serveur de React écrit de
 *     vrais attributs `style="…"`, et surtout la bibliothèque de notifications
 *     (`sonner`) injecte sa feuille de style au démarrage sans accepter de nonce : sous
 *     une règle stricte, l'application des styles est bloquée et les notifications
 *     s'affichent de travers. Un style ne peut pas exécuter de code — la directive qui
 *     compte contre l'injection de script, `script-src`, reste, elle, sans la moindre
 *     exception. Pour fermer aussi celle-ci, il faudrait extraire la CSS de `sonner`
 *     dans un fichier servi par `'self'`.
 *   - `img-src … https:` : la photo de profil est une adresse fournie par le joueur.
 *
 * `frame-src` autorise nommément les pages de paiement hébergées : c'est la fenêtre de
 * paiement affichée dans la plateforme. Toute autre origine encadrée est refusée.
 */
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHost, getRequestProtocol, setResponseHeader } from '@tanstack/react-start/server'
import { API_BASE_URL } from './http-client'

/** Origines des pages de paiement hébergées, seules autorisées dans un cadre. */
const ORIGINES_PAIEMENT = ['https://payin.moneyfusion.net', 'https://pay.moneyfusion.net', 'https://app.ligdicash.com']

/**
 * Origines que le navigateur peut joindre : le site lui-même, et le hub temps réel.
 * Ce dernier est sur l'origine du site en production (le proxy route `/api/temps-reel`),
 * mais sur celle de l'API en développement — d'où la même déduction que
 * `services/temps-reel.ts`, faite ici sans importer ce module (server functions).
 */
function originesConnexion(hote: string | undefined, securise: boolean): string[] {
  const origines = new Set<string>()
  if (hote) origines.add(`${securise ? 'wss' : 'ws'}://${hote}`)

  // `API_BASE_URL` porte déjà sa valeur par défaut de développement : c'est l'origine
  // que le navigateur joint réellement pour le socket quand il n'y a pas de proxy.
  const brute = process.env.WS_PUBLIC_URL?.trim() || API_BASE_URL
  if (brute) {
    try {
      const u = new URL(brute)
      const schemeWs = u.protocol === 'https:' ? 'wss:' : 'ws:'
      origines.add(`${schemeWs}//${u.host}`)
      origines.add(`${u.protocol}//${u.host}`)
    } catch {
      // adresse mal formée : on s'en tient à l'origine du site
    }
  }
  return [...origines]
}

function politique(nonce: string, connexions: string[], securise: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${connexions.join(' ')}`.trim(),
    `frame-src ${ORIGINES_PAIEMENT.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ]
  // `upgrade-insecure-requests` uniquement derrière HTTPS : le même serveur est servi en
  // HTTP simple sur le réseau local, où cette directive rendrait toutes les ressources
  // injoignables.
  if (securise) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

/** Nonce aléatoire de 128 bits, encodé en base64 (`crypto` est natif côté serveur). */
function nouveauNonce(): string {
  const octets = new Uint8Array(16)
  crypto.getRandomValues(octets)
  return btoa(String.fromCharCode(...octets))
}

/**
 * Pose les en-têtes de sécurité et renvoie le nonce à donner au routeur.
 * Côté client, ne fait rien et renvoie `undefined` : le corps serveur est retiré du
 * paquet envoyé au navigateur.
 */
export const preparerEntetesSecurite = createIsomorphicFn()
  .server((): string | undefined => {
    try {
      const nonce = nouveauNonce()
      const hote = getRequestHost()
      const securise = getRequestProtocol() === 'https'
      setResponseHeader('Content-Security-Policy', politique(nonce, originesConnexion(hote, securise), securise))
      setResponseHeader('X-Content-Type-Options', 'nosniff')
      setResponseHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
      setResponseHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://payin.moneyfusion.net")',
      )
      setResponseHeader('Cross-Origin-Opener-Policy', 'same-origin')
      setResponseHeader('X-Frame-Options', 'SAMEORIGIN')
      if (securise) setResponseHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
      return nonce
    } catch {
      // Hors contexte de requête (build, préchauffage) : pas d'en-tête, pas de nonce.
      return undefined
    }
  })
  .client((): string | undefined => undefined)
