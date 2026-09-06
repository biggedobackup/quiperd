/**
 * Client HTTP de base vers le backend Go — exécuté uniquement côté serveur (server functions
 * et routes serveur). Le navigateur ne connaît jamais API_BASE_URL ni le jeton.
 */
export const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080/api').replace(/\/$/, '')

/** Erreur normalisée de la charte API : `{ "erreur": "…", "details"?: { champ: message } }`. */
export class ErreurApi extends Error {
  readonly statut: number
  readonly details?: Record<string, string>

  constructor(statut: number, message: string, details?: Record<string, string>) {
    super(message)
    this.name = 'ErreurApi'
    this.statut = statut
    this.details = details
  }
}

export type Methode = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface OptionsAppel {
  methode?: Methode
  corps?: unknown
  jeton?: string | null
  formData?: FormData
  enTetes?: Record<string, string>
}

/**
 * Appelle le backend et renvoie le JSON typé. Lève `ErreurApi` sur tout statut ≥ 400,
 * avec le message lisible renvoyé par le backend (jamais un message technique).
 */
export async function appelBackend<T>(chemin: string, options: OptionsAppel = {}): Promise<T> {
  const enTetes: Record<string, string> = { Accept: 'application/json', ...options.enTetes }
  if (options.jeton) enTetes.Authorization = `Bearer ${options.jeton}`

  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.corps !== undefined) {
    enTetes['Content-Type'] = 'application/json'
    body = JSON.stringify(options.corps)
  }

  let reponse: Response
  try {
    reponse = await fetch(`${API_BASE_URL}${chemin}`, {
      method: options.methode ?? 'GET',
      headers: enTetes,
      body,
    })
  } catch {
    throw new ErreurApi(503, 'Le serveur QUI PERD est injoignable. Réessayez dans un instant.')
  }

  if (reponse.status === 204) return undefined as T

  const texte = await reponse.text()
  let json: unknown = null
  if (texte) {
    try {
      json = JSON.parse(texte)
    } catch {
      json = null
    }
  }

  if (!reponse.ok) {
    const corpsErreur = (json ?? {}) as { erreur?: string; details?: Record<string, string> }
    throw new ErreurApi(
      reponse.status,
      corpsErreur.erreur ?? messageParDefaut(reponse.status),
      corpsErreur.details,
    )
  }
  return json as T
}

function messageParDefaut(statut: number): string {
  switch (statut) {
    case 401:
      return 'Session expirée, reconnectez-vous.'
    case 403:
      return 'Action non autorisée.'
    case 404:
      return 'Ressource introuvable.'
    case 409:
      return 'Conflit : cette action n’est plus possible.'
    case 422:
      return 'Solde insuffisant.'
    default:
      return `Erreur ${statut} du serveur.`
  }
}

/**
 * Résultat sérialisable renvoyé par les server functions mutantes : les erreurs traversent
 * la frontière serveur → client avec leur statut et leurs détails de validation.
 */
export type Resultat<T> =
  | { ok: true; donnees: T }
  | { ok: false; statut: number; message: string; details?: Record<string, string> }

export async function enResultat<T>(promesse: Promise<T>): Promise<Resultat<T>> {
  try {
    return { ok: true, donnees: await promesse }
  } catch (e) {
    if (e instanceof ErreurApi) {
      return { ok: false, statut: e.statut, message: e.message, details: e.details }
    }
    throw e
  }
}

/** Construit une query-string en ignorant les valeurs vides. */
export function requete(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur === undefined || valeur === null || valeur === '' || valeur === false) continue
    q.set(cle, valeur === true ? '1' : String(valeur))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}
