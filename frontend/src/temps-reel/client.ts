/**
 * Client temps réel — une seule connexion WebSocket par onglet, en dehors de React.
 *
 * Principes :
 *  - **Singleton par onglet** : tous les écrans partagent le même socket, multiplexé par salons.
 *  - **File d'abonnements** : un écran peut demander un salon avant que le socket soit ouvert.
 *    L'intention est conservée (compteur de références par salon) et rejouée à chaque ouverture.
 *  - **Ticket neuf à chaque tentative** : le ticket est à usage unique et expire en 60 s, donc
 *    on rappelle la server function avant CHAQUE connexion, jamais un ticket mémorisé.
 *  - **Reconnexion à backoff exponentiel** 1 s → 30 s avec gigue, relancée immédiatement quand
 *    le navigateur repasse en ligne ou que l'onglet redevient visible.
 *  - **Aucun rendu serveur** : côté serveur `obtenirClientTempsReel()` renvoie un client inerte
 *    (toutes les méthodes sont des no-op) — aucun socket, aucun état partagé entre requêtes SSR.
 *
 * Aucune dépendance npm : `WebSocket` natif uniquement.
 */
import type { ActionClient, EvenementTempsReel } from './evenements'
import { obtenirTicketTempsReel, type AccesTempsReel, type EspaceTempsReel, type RoleTempsReel } from '@/services/temps-reel'

export type { EspaceTempsReel, RoleTempsReel }

/** État de la connexion tel qu'affiché par l'indicateur « direct ». */
export type EtatConnexion = 'connecte' | 'connexion' | 'hors_ligne'

export type EcouteurEvenement = (evenement: EvenementTempsReel) => void
export type EcouteurEtat = (etat: EtatConnexion) => void
export type EcouteurInstantane = (instantane: InstantaneTempsReel) => void

/**
 * Photo de l'état du client, référentiellement stable tant que rien ne change
 * (consommée telle quelle par `useSyncExternalStore`).
 */
export interface InstantaneTempsReel {
  etat: EtatConnexion
  /** Raccourci de `etat === 'connecte'`. */
  connecte: boolean
  /** Rôle confirmé par le hub à l'ouverture (`connexion.prete`). */
  role: RoleTempsReel
  /**
   * Identité confirmée par le hub (`connexion.prete`), `null` pour un visiteur. Elle sert à
   * détecter qu'une connexion ou une déconnexion a eu lieu dans l'onglet alors que le socket
   * était déjà ouvert : le socket resterait sinon lié à l'ancienne session et n'apporterait
   * plus aucun événement privé jusqu'au prochain rechargement complet.
   */
  utilisateurId: string | null
  /** Dernier `compteur.en_ligne` reçu, `null` tant que le serveur n'en a poussé aucun. */
  joueursEnLigne: number | null
  /** Tentatives de reconnexion consécutives (0 dès qu'une connexion aboutit). */
  tentatives: number
  /**
   * Numéro de session : 0 tant qu'aucune connexion n'a abouti, puis +1 à CHAQUE ouverture.
   * C'est ce compteur que `useResynchronisation` observe pour invalider les requêtes.
   */
  generation: number
}

export interface ClientTempsReel {
  /** Prend une référence sur la connexion (compteur) et connecte au besoin. No-op en SSR. */
  demarrer(): void
  /** Relâche une référence ; à zéro, le socket est fermé proprement. */
  arreter(): void
  /**
   * Abonne un écouteur à une liste de salons. Une liste VIDE = écouteur global : il reçoit
   * tous les événements du socket sans demander de salon (utilisé par `useEvenement`).
   * Renvoie la fonction de désabonnement.
   */
  sabonner(salons: readonly string[], ecouteur: EcouteurEvenement): () => void
  /** Signale au serveur que l'utilisateur est (ou n'est plus) sur la page d'un salon. */
  envoyerPresence(salon: string, surLaPage: boolean): void
  etat(): EtatConnexion
  instantane(): InstantaneTempsReel
  /** Abonnement aux changements d'état de connexion uniquement. */
  surEtat(ecouteur: EcouteurEtat): () => void
  /** Abonnement à toute modification de l'instantané (état, rôle, compteur, génération). */
  surInstantane(ecouteur: EcouteurInstantane): () => void
  /** Espace dont on demande le ticket ; `auto` déduit joueur/admin du chemin courant. */
  definirEspace(espace: EspaceTempsReel): void
  /**
   * Reconnecte si l'espace effectif a changé depuis l'ouverture du socket. À appeler à chaque
   * changement de route : un administrateur qui passe de l'espace joueur à l'espace admin sans
   * recharger garderait sinon un socket de joueur, à qui le salon `admin` est refusé — son
   * tableau de bord resterait muet jusqu'au prochain rechargement complet.
   */
  verifierEspace(): void
  /**
   * Reconnecte si le socket n'est pas lié à l'utilisateur attendu. À appeler depuis les coquilles
   * joueur et admin, qui savent QUI est connecté : une connexion, une inscription ou un changement
   * de compte se fait par navigation interne, sans recharger la page — le socket resterait alors
   * celui du visiteur (ou du compte précédent) et n'apporterait plus aucun événement privé.
   * Passer `null` pour un visiteur. Ne force qu'UNE tentative par identité attendue, afin de ne
   * jamais boucler si le serveur renvoie durablement une autre session.
   */
  verifierIdentite(utilisateurIdAttendu: string | null): void
  /** Force une tentative immédiate (bouton « Reconnecter » de l'indicateur). */
  reconnecterMaintenant(): void
}

/** Délais de reconnexion : 1 s doublé à chaque échec, plafonné à 30 s, ± 30 % de gigue. */
const DELAI_MIN = 1_000
const DELAI_MAX = 30_000
/** Au-delà de ce nombre d'échecs consécutifs, l'interface annonce « Hors ligne ». */
const SEUIL_HORS_LIGNE = 4
/** Ping applicatif : le hub ferme au bout de 60 s sans signe de vie. */
const PERIODE_PING = 25_000

const INSTANTANE_INITIAL: InstantaneTempsReel = Object.freeze({
  etat: 'hors_ligne' as EtatConnexion,
  connecte: false,
  role: 'visiteur' as RoleTempsReel,
  utilisateurId: null,
  joueursEnLigne: null,
  tentatives: 0,
  generation: 0,
})

/** Instantané neutre du rendu serveur — constante figée, donc pas de différence d'hydratation. */
export function instantaneServeur(): InstantaneTempsReel {
  return INSTANTANE_INITIAL
}

interface Abonnement {
  salons: readonly string[]
  ecouteur: EcouteurEvenement
}

function creerClient(): ClientTempsReel {
  let socket: WebSocket | null = null
  let demarrages = 0
  let tentatives = 0
  let generation = 0
  let connexionEnCours = false
  let espaceDemande: EspaceTempsReel = 'auto'
  // Espace réellement utilisé pour le ticket du socket courant. Il sert à détecter qu'une
  // navigation a changé d'espace : le socket doit alors être rouvert avec le bon rôle.
  let espaceConnecte: EspaceTempsReel | null = null
  // Dernière identité pour laquelle une reconnexion a déjà été forcée : empêche de boucler si le
  // serveur renvoie durablement une session différente de celle qu'attend l'interface.
  let identiteForcee: string | null | undefined = undefined
  let minuterieReconnexion: ReturnType<typeof setTimeout> | null = null
  let minuteriePing: ReturnType<typeof setInterval> | null = null

  const abonnements = new Set<Abonnement>()
  /** Compteur de références par salon : c'est la file d'attente rejouée à chaque ouverture. */
  const comptesSalons = new Map<string, number>()
  /** Dernière présence connue par salon, rejouée elle aussi à l'ouverture. */
  const presences = new Map<string, boolean>()
  const ecouteursInstantane = new Set<EcouteurInstantane>()
  const ecouteursEtat = new Set<EcouteurEtat>()

  let instantaneCourant: InstantaneTempsReel = INSTANTANE_INITIAL

  // ─── État observable ────────────────────────────────────────────────────────

  function majInstantane(partiel: Partial<InstantaneTempsReel>): void {
    const suivant: InstantaneTempsReel = { ...instantaneCourant, ...partiel }
    suivant.connecte = suivant.etat === 'connecte'
    if (
      suivant.etat === instantaneCourant.etat &&
      suivant.role === instantaneCourant.role &&
      suivant.utilisateurId === instantaneCourant.utilisateurId &&
      suivant.joueursEnLigne === instantaneCourant.joueursEnLigne &&
      suivant.tentatives === instantaneCourant.tentatives &&
      suivant.generation === instantaneCourant.generation
    ) {
      return
    }
    const etatChange = suivant.etat !== instantaneCourant.etat
    instantaneCourant = suivant
    for (const ecouteur of [...ecouteursInstantane]) ecouteur(suivant)
    if (etatChange) for (const ecouteur of [...ecouteursEtat]) ecouteur(suivant.etat)
  }

  /** État affiché pendant une attente : bref = « reconnexion », durable = « hors ligne ». */
  function etatDAttente(): EtatConnexion {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'hors_ligne'
    return tentatives >= SEUIL_HORS_LIGNE ? 'hors_ligne' : 'connexion'
  }

  // ─── Socket ─────────────────────────────────────────────────────────────────

  function estOuvert(): boolean {
    return socket !== null && socket.readyState === WebSocket.OPEN
  }

  function envoyer(action: ActionClient): void {
    if (!socket || !estOuvert()) return
    try {
      socket.send(JSON.stringify(action))
    } catch {
      // Socket en cours de fermeture : `onclose` va déclencher la reconnexion.
    }
  }

  function espaceEffectif(): EspaceTempsReel {
    if (espaceDemande !== 'auto') return espaceDemande
    // Un administrateur peut avoir les deux cookies : le chemin courant tranche.
    return window.location.pathname.startsWith('/admin') ? 'admin' : 'auto'
  }

  function construireUrl(acces: AccesTempsReel): string {
    const url = new URL(acces.url, window.location.href)
    if (url.protocol === 'http:') url.protocol = 'ws:'
    else if (url.protocol === 'https:') url.protocol = 'wss:'
    if (acces.ticket) url.searchParams.set('ticket', acces.ticket)
    return url.toString()
  }

  async function connecter(): Promise<void> {
    if (connexionEnCours || socket !== null || demarrages === 0) return
    connexionEnCours = true
    majInstantane({ etat: tentatives === 0 ? 'connexion' : etatDAttente() })

    let acces: AccesTempsReel
    const espaceDemandeAuTicket = espaceEffectif()
    try {
      acces = await obtenirTicketTempsReel({ data: { espace: espaceDemandeAuTicket } })
      espaceConnecte = espaceDemandeAuTicket
    } catch {
      connexionEnCours = false
      planifierReconnexion()
      return
    }
    // Le provider a pu être démonté pendant l'aller-retour : on n'ouvre pas un socket orphelin.
    if (demarrages === 0) {
      connexionEnCours = false
      return
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(construireUrl(acces))
    } catch {
      connexionEnCours = false
      planifierReconnexion()
      return
    }
    socket = ws
    connexionEnCours = false

    ws.onopen = () => {
      if (socket !== ws) return
      tentatives = 0
      generation += 1
      majInstantane({ etat: 'connecte', tentatives: 0, generation })
      const salonsVoulus = [...comptesSalons.keys()]
      if (salonsVoulus.length > 0) envoyer({ action: 'abonner', salons: salonsVoulus })
      for (const [salon, surLaPage] of presences) envoyer({ action: 'presence', salon, surLaPage })
      minuteriePing = setInterval(() => envoyer({ action: 'ping' }), PERIODE_PING)
    }

    ws.onmessage = (message: MessageEvent<unknown>) => {
      if (socket === ws) traiterMessage(message.data)
    }

    // `onerror` est toujours suivi de `onclose` : rien à faire ici, la reconnexion y est gérée.
    ws.onerror = () => {}

    ws.onclose = () => {
      if (socket !== ws) return
      socket = null
      arreterPing()
      majInstantane({ etat: demarrages > 0 ? etatDAttente() : 'hors_ligne' })
      if (demarrages > 0) planifierReconnexion()
    }
  }

  function traiterMessage(brut: unknown): void {
    if (typeof brut !== 'string') return
    let objet: unknown
    try {
      objet = JSON.parse(brut)
    } catch {
      return
    }
    if (typeof objet !== 'object' || objet === null) return
    if (typeof (objet as { evenement?: unknown }).evenement !== 'string') return
    // Donnée réseau : le contrat `evenements.ts` est le miroir du backend, on lui fait confiance
    // après cette vérification de forme minimale (pas de validateur pour éviter une dépendance).
    const enveloppe = objet as EvenementTempsReel

    switch (enveloppe.evenement) {
      case 'connexion.prete':
        majInstantane({ role: enveloppe.charge.role, utilisateurId: enveloppe.charge.utilisateurId ?? null })
        break
      case 'connexion.refusee':
        console.warn('[temps-reel] connexion refusée :', enveloppe.charge.raison)
        break
      case 'abonnement.confirme':
        if (enveloppe.charge.refuses.length > 0) {
          console.warn('[temps-reel] salons refusés :', enveloppe.charge.refuses.join(', '))
        }
        break
      case 'compteur.en_ligne':
        majInstantane({ joueursEnLigne: enveloppe.charge.joueursEnLigne })
        break
      default:
        break
    }

    for (const abonnement of [...abonnements]) {
      // Écouteur global (aucun salon demandé), événement hors salon (niveau connexion) ou
      // événement d'un salon suivi par cet écouteur.
      const concerne =
        abonnement.salons.length === 0 || !enveloppe.salon || abonnement.salons.includes(enveloppe.salon)
      if (!concerne) continue
      try {
        abonnement.ecouteur(enveloppe)
      } catch (erreur) {
        console.error('[temps-reel] écouteur en erreur', erreur)
      }
    }
  }

  // ─── Minuteries ─────────────────────────────────────────────────────────────

  function planifierReconnexion(): void {
    if (minuterieReconnexion !== null || demarrages === 0 || socket !== null) return
    const base = Math.min(DELAI_MAX, DELAI_MIN * 2 ** tentatives)
    // Gigue ± 30 % : deux onglets coupés en même temps ne reviennent pas à la même seconde.
    const delai = Math.min(DELAI_MAX, Math.round(base * (0.7 + Math.random() * 0.6)))
    tentatives += 1
    majInstantane({ etat: etatDAttente(), tentatives })
    minuterieReconnexion = setTimeout(() => {
      minuterieReconnexion = null
      void connecter()
    }, delai)
  }

  function annulerReconnexion(): void {
    if (minuterieReconnexion !== null) {
      clearTimeout(minuterieReconnexion)
      minuterieReconnexion = null
    }
  }

  function arreterPing(): void {
    if (minuteriePing !== null) {
      clearInterval(minuteriePing)
      minuteriePing = null
    }
  }

  // ─── Événements navigateur ──────────────────────────────────────────────────

  function relancerSiBesoin(): void {
    if (demarrages === 0 || socket !== null || connexionEnCours) return
    annulerReconnexion()
    tentatives = 0
    void connecter()
  }

  function surEnLigne(): void {
    relancerSiBesoin()
  }

  function surHorsLigne(): void {
    majInstantane({ etat: 'hors_ligne' })
  }

  function surVisibilite(): void {
    if (document.visibilityState === 'visible') relancerSiBesoin()
  }

  function ecouterNavigateur(actif: boolean): void {
    if (actif) {
      window.addEventListener('online', surEnLigne)
      window.addEventListener('offline', surHorsLigne)
      document.addEventListener('visibilitychange', surVisibilite)
    } else {
      window.removeEventListener('online', surEnLigne)
      window.removeEventListener('offline', surHorsLigne)
      document.removeEventListener('visibilitychange', surVisibilite)
    }
  }

  // ─── API publique ───────────────────────────────────────────────────────────

  function demarrer(): void {
    demarrages += 1
    if (demarrages > 1) return
    ecouterNavigateur(true)
    void connecter()
  }

  function arreter(): void {
    demarrages = Math.max(0, demarrages - 1)
    if (demarrages > 0) return
    ecouterNavigateur(false)
    annulerReconnexion()
    arreterPing()
    const aFermer = socket
    socket = null
    if (aFermer) {
      aFermer.onopen = null
      aFermer.onmessage = null
      aFermer.onerror = null
      aFermer.onclose = null
      try {
        aFermer.close(1000, 'arret')
      } catch {
        // socket déjà fermé
      }
    }
    tentatives = 0
    majInstantane({ etat: 'hors_ligne', tentatives: 0 })
  }

  function sabonner(salons: readonly string[], ecouteur: EcouteurEvenement): () => void {
    const liste = [...new Set(salons.filter((s): s is string => typeof s === 'string' && s.length > 0))]
    const abonnement: Abonnement = { salons: liste, ecouteur }
    abonnements.add(abonnement)

    const nouveaux: string[] = []
    for (const salon of liste) {
      const compte = (comptesSalons.get(salon) ?? 0) + 1
      comptesSalons.set(salon, compte)
      if (compte === 1) nouveaux.push(salon)
    }
    // Socket fermé : l'intention reste dans `comptesSalons` et sera rejouée à l'ouverture.
    if (nouveaux.length > 0 && estOuvert()) envoyer({ action: 'abonner', salons: nouveaux })

    let relache = false
    return () => {
      if (relache) return
      relache = true
      abonnements.delete(abonnement)
      const partis: string[] = []
      for (const salon of liste) {
        const compte = (comptesSalons.get(salon) ?? 1) - 1
        if (compte <= 0) {
          comptesSalons.delete(salon)
          presences.delete(salon)
          partis.push(salon)
        } else {
          comptesSalons.set(salon, compte)
        }
      }
      if (partis.length > 0 && estOuvert()) envoyer({ action: 'desabonner', salons: partis })
    }
  }

  function envoyerPresence(salon: string, surLaPage: boolean): void {
    if (!salon) return
    presences.set(salon, surLaPage)
    envoyer({ action: 'presence', salon, surLaPage })
  }

  return {
    demarrer,
    arreter,
    sabonner,
    envoyerPresence,
    etat: () => instantaneCourant.etat,
    instantane: () => instantaneCourant,
    surEtat(ecouteur) {
      ecouteursEtat.add(ecouteur)
      return () => {
        ecouteursEtat.delete(ecouteur)
      }
    },
    surInstantane(ecouteur) {
      ecouteursInstantane.add(ecouteur)
      return () => {
        ecouteursInstantane.delete(ecouteur)
      }
    },
    definirEspace(espace) {
      if (espaceDemande === espace) return
      espaceDemande = espace
      this.verifierEspace()
    },
    verifierEspace() {
      if (demarrages === 0 || connexionEnCours) return
      if (espaceConnecte === null || espaceConnecte === espaceEffectif()) return
      this.reconnecterMaintenant()
    },
    verifierIdentite(utilisateurIdAttendu) {
      if (demarrages === 0 || connexionEnCours) return
      if (instantaneCourant.etat !== 'connecte') return // rien à comparer tant que rien n'est ouvert
      const attendu = utilisateurIdAttendu ?? null
      if (instantaneCourant.utilisateurId === attendu) {
        identiteForcee = undefined
        return
      }
      if (identiteForcee === attendu) return // déjà tenté pour cette identité : on n'insiste pas
      identiteForcee = attendu
      this.reconnecterMaintenant()
    },
    reconnecterMaintenant() {
      if (demarrages === 0) return
      annulerReconnexion()
      tentatives = 0
      const aFermer = socket
      if (aFermer) {
        socket = null
        arreterPing()
        aFermer.onclose = null
        aFermer.onerror = null
        aFermer.onmessage = null
        try {
          aFermer.close(1000, 'reconnexion')
        } catch {
          // socket déjà fermé
        }
      }
      void connecter()
    },
  }
}

/** Client inerte du rendu serveur : aucune mutation d'état, donc partageable entre requêtes. */
const CLIENT_INERTE: ClientTempsReel = Object.freeze({
  demarrer: () => {},
  arreter: () => {},
  sabonner: () => () => {},
  envoyerPresence: () => {},
  etat: () => 'hors_ligne' as EtatConnexion,
  instantane: () => INSTANTANE_INITIAL,
  surEtat: () => () => {},
  surInstantane: () => () => {},
  definirEspace: () => {},
  verifierEspace: () => {},
  verifierIdentite: () => {},
  reconnecterMaintenant: () => {},
})

let singleton: ClientTempsReel | null = null

/**
 * Client temps réel de l'onglet. Côté serveur (SSR), renvoie le client inerte : aucun socket
 * n'est ouvert et aucun état n'est partagé entre deux requêtes.
 */
export function obtenirClientTempsReel(): ClientTempsReel {
  if (typeof window === 'undefined') return CLIENT_INERTE
  singleton ??= creerClient()
  return singleton
}
