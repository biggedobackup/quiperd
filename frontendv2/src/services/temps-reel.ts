/**
 * Module `temps-reel` — accès du navigateur au hub WebSocket du backend.
 *
 * Le JWT vit dans un cookie `HttpOnly` : le navigateur ne le lit jamais et ne connaît pas
 * `API_BASE_URL`. Une balise WebSocket ne peut pas non plus porter d'en-tête `Authorization`.
 * D'où le ticket : cette server function relit le cookie, demande au backend un ticket
 * aléatoire à usage unique (TTL 60 s, `POST /api/temps-reel/ticket`) et renvoie au client
 * l'URL PUBLIQUE du hub plus ce ticket. Le client ouvre `wss://…/temps-reel?ticket=…`.
 *
 * Un visiteur non connecté n'a pas de ticket : il se connecte en visiteur et n'obtient que
 * les salons publics (`public:defis`).
 */
import { createServerFn } from '@tanstack/react-start'
import { API_BASE_URL, appelBackend } from '@/server/http-client'
import { jetonAdmin, jetonJoueur } from '@/server/session'

/** Rôle annoncé par le serveur à l'ouverture du socket (le hub reste l'autorité). */
export type RoleTempsReel = 'joueur' | 'admin' | 'visiteur'

/** Espace dont on veut le ticket : `auto` prend le cookie joueur, à défaut le cookie admin. */
export type EspaceTempsReel = 'auto' | 'joueur' | 'admin'

/** Réponse des deux server functions : tout ce qu'il faut au navigateur pour ouvrir le socket. */
export interface AccesTempsReel {
  /** URL WebSocket publique du hub, sans ticket (`ws://` ou `wss://`). */
  url: string
  /** Ticket à usage unique, `null` pour un visiteur non connecté. */
  ticket: string | null
  /** Date ISO d'expiration du ticket (indicative : le client en redemande un à chaque tentative). */
  expiration: string | null
  role: RoleTempsReel
}

/** Chemin du hub, ajouté à `API_BASE_URL` quand `WS_PUBLIC_URL` n'est pas configurée. */
const CHEMIN_HUB = '/temps-reel'

/** `http://` → `ws://`, `https://` → `wss://` ; toute autre forme est laissée telle quelle. */
function versWebSocket(url: string): string {
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`
  return url
}

/**
 * URL publique du hub. `WS_PUBLIC_URL` fait foi en production (le navigateur passe par le
 * reverse proxy, pas par l'adresse interne du conteneur) ; à défaut elle est déduite de
 * `API_BASE_URL`, qui se termine déjà par `/api`.
 *
 * Fonction NON exportée : elle lit `process.env` et ne doit exister que côté serveur.
 */
function urlHubTempsReel(): string {
  const configuree = process.env.WS_PUBLIC_URL?.trim()
  if (configuree) return versWebSocket(configuree.replace(/\/+$/, ''))
  return `${versWebSocket(API_BASE_URL)}${CHEMIN_HUB}`
}

/** Forme tolérée de `POST /api/temps-reel/ticket` (le backend peut dater ou compter en secondes). */
interface ReponseTicket {
  ticket?: string
  valeur?: string
  expiration?: string
  expireDans?: number
}

function expirationIso(reponse: ReponseTicket): string | null {
  if (reponse.expiration) return reponse.expiration
  if (typeof reponse.expireDans === 'number' && Number.isFinite(reponse.expireDans)) {
    return new Date(Date.now() + reponse.expireDans * 1000).toISOString()
  }
  return null
}

/**
 * Ticket d'accès au hub pour l'utilisateur du cookie courant.
 *
 * Ne lève jamais et ne redirige jamais : sans cookie, avec un cookie expiré ou si la route
 * backend est indisponible, elle renvoie un accès visiteur (`ticket: null`). Une coupure du
 * temps réel ne doit pas casser l'écran qui l'utilise.
 */
export const obtenirTicketTempsReel = createServerFn({ method: 'POST' })
  .inputValidator((d: { espace?: EspaceTempsReel } = {}) => d)
  .handler(async ({ data }): Promise<AccesTempsReel> => {
    const url = urlHubTempsReel()
    const visiteur: AccesTempsReel = { url, ticket: null, expiration: null, role: 'visiteur' }

    const espace = data.espace ?? 'auto'
    const joueur = espace === 'admin' ? null : jetonJoueur()
    const admin = espace === 'joueur' ? null : jetonAdmin()
    const jeton = joueur ?? admin
    if (!jeton) return visiteur
    const role: RoleTempsReel = joueur ? 'joueur' : 'admin'

    try {
      const reponse = await appelBackend<ReponseTicket>('/temps-reel/ticket', { methode: 'POST', jeton })
      const ticket = reponse.ticket ?? reponse.valeur ?? null
      if (!ticket) return visiteur
      return { url, ticket, expiration: expirationIso(reponse), role }
    } catch {
      // Backend injoignable, jeton expiré, route absente : on dégrade en visiteur plutôt que
      // de faire échouer le rendu. Le client réessaiera à la prochaine tentative de connexion.
      return visiteur
    }
  })

/** URL publique du hub pour un visiteur non connecté (site vitrine) — aucun ticket. */
export const urlTempsReelPublique = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ url: string }> => ({ url: urlHubTempsReel() }),
)
