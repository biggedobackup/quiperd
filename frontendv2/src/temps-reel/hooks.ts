/**
 * Hooks d'usage du temps réel. Tout écran qui affiche une donnée vivante passe par ici :
 * aucun `refetchInterval`, aucun `setInterval` de rafraîchissement dans le projet.
 *
 * - `useTempsReel()`        — état complet de la connexion (indicateur « direct »).
 * - `useEtatTempsReel()`    — état seul, sans redessiner sur le compteur de joueurs en ligne.
 * - `useSalon()`            — abonnement déclaratif à un ou plusieurs salons.
 * - `useEvenement()`        — écoute typée d'un seul événement (union discriminée exhaustive).
 * - `useResynchronisation()`— UNE invalidation à chaque (re)connexion, jamais plus.
 * - `useChrono()`           — compte à rebours purement client depuis une date du serveur.
 * - `usePresence()`         — signale « je suis sur la page » aux autres participants.
 *
 * Rendu serveur : aucun hook n'ouvre de socket ni ne lit l'horloge pendant le rendu ;
 * le premier rendu client est identique au rendu serveur.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  instantaneServeur,
  obtenirClientTempsReel,
  type ClientTempsReel,
  type EcouteurEvenement,
  type EtatConnexion,
  type InstantaneTempsReel,
} from './client'
import { invaliderFamilles } from './cache'
import type { ChargesTempsReel, NomEvenement } from './evenements'

/**
 * Enveloppe d'un événement donné — même forme que le membre correspondant de
 * `EvenementTempsReel`, mais résolue pour un nom générique (un `Extract<…>` sur un paramètre
 * de type non résolu élargit la charge à l'union de toutes les charges).
 */
export type EnveloppeDe<N extends NomEvenement> = {
  evenement: N
  salon?: string
  horodatage: string
  charge: ChargesTempsReel[N]
}

/** Salons acceptés par les hooks : une chaîne, une liste, ou rien (hook inerte). */
export type SalonsAcceptes = string | readonly string[] | null | undefined

function normaliser(salons: SalonsAcceptes): string[] {
  if (!salons) return []
  const liste = typeof salons === 'string' ? [salons] : salons
  return [...new Set(liste.filter((salon): salon is string => typeof salon === 'string' && salon.length > 0))]
}

// ─── État de connexion ────────────────────────────────────────────────────────

/** Client temps réel de l'onglet (pour `envoyerPresence`, `reconnecterMaintenant`…). */
export function useClientTempsReel(): ClientTempsReel {
  return obtenirClientTempsReel()
}

/**
 * État complet de la connexion temps réel. Attention : le composant se redessine aussi quand
 * `joueursEnLigne` change (le serveur le pousse au plus toutes les 5 s) — pour un simple
 * voyant, préférer `useEtatTempsReel()`.
 *
 * ```tsx
 * const { etat, connecte, joueursEnLigne } = useTempsReel()
 * ```
 */
export function useTempsReel(): InstantaneTempsReel {
  const client = obtenirClientTempsReel()
  return useSyncExternalStore(client.surInstantane, client.instantane, instantaneServeur)
}

/** Sélection d'une valeur primitive de l'instantané : pas de rendu si la valeur ne change pas. */
function useSelectionTempsReel<T>(selecteur: (instantane: InstantaneTempsReel) => T, valeurServeur: T): T {
  const client = obtenirClientTempsReel()
  const lire = useCallback(() => selecteur(client.instantane()), [client, selecteur])
  const lireServeur = useCallback(() => valeurServeur, [valeurServeur])
  return useSyncExternalStore(client.surInstantane, lire, lireServeur)
}

const lireEtat = (instantane: InstantaneTempsReel) => instantane.etat
const lireGeneration = (instantane: InstantaneTempsReel) => instantane.generation

/**
 * État de connexion seul (`'connecte' | 'connexion' | 'hors_ligne'`) : ne redessine le
 * composant que lorsque cet état change.
 */
export function useEtatTempsReel(): EtatConnexion {
  return useSelectionTempsReel(lireEtat, 'hors_ligne')
}

/**
 * Numéro de session : 0 avant la première connexion, puis +1 à chaque (re)ouverture du socket.
 * Sert de déclencheur de resynchronisation.
 */
export function useGenerationTempsReel(): number {
  return useSelectionTempsReel(lireGeneration, 0)
}

// ─── Abonnements ──────────────────────────────────────────────────────────────

/**
 * Abonne l'écran à un ou plusieurs salons ; le désabonnement est automatique au démontage.
 * Le gestionnaire est lu par référence : le changer ne provoque JAMAIS de reconnexion.
 * Une liste vide (ou `null`) n'abonne à rien — pratique pour un salon conditionnel.
 *
 * ```tsx
 * useSalon(salons.match(matchId), (evenement) => {
 *   if (evenement.evenement === 'match.termine') remplacerMatch(queryClient, evenement.charge)
 * })
 * useSalon([salons.defisPublics, salons.utilisateur(moi.id)], gerer)
 * ```
 */
export function useSalon(salons: SalonsAcceptes, gestionnaire: EcouteurEvenement): void {
  const client = obtenirClientTempsReel()
  const reference = useRef(gestionnaire)
  useEffect(() => {
    reference.current = gestionnaire
  })

  // Clé de valeur : une liste recréée à chaque rendu ne doit pas relancer l'abonnement.
  const cle = normaliser(salons).join('|')
  useEffect(() => {
    const noms = cle ? cle.split('|') : []
    if (noms.length === 0) return
    return client.sabonner(noms, (evenement) => reference.current(evenement))
  }, [client, cle])
}

/**
 * Écoute d'un seul événement, typée par l'union discriminée `EvenementTempsReel` : la charge
 * reçue est exactement `ChargesTempsReel[nom]`.
 *
 * Le troisième paramètre, facultatif, abonne en même temps aux salons voulus — sinon le hook
 * se contente de filtrer les événements des salons déjà demandés ailleurs (`useSalon`).
 *
 * ```tsx
 * useEvenement('defi.cree', (defi) => ajouterDefi(queryClient, defi), salons.defisPublics)
 * useEvenement('match.chrono', ({ echeance, type }) => …, salons.match(matchId))
 * ```
 */
export function useEvenement<N extends NomEvenement>(
  nom: N,
  gestionnaire: (charge: ChargesTempsReel[N], enveloppe: EnveloppeDe<N>) => void,
  salonsCibles?: SalonsAcceptes,
): void {
  const client = obtenirClientTempsReel()
  const reference = useRef(gestionnaire)
  useEffect(() => {
    reference.current = gestionnaire
  })

  const cle = normaliser(salonsCibles).join('|')
  useEffect(() => {
    const noms = cle ? cle.split('|') : []
    return client.sabonner(noms, (evenement) => {
      if (evenement.evenement !== nom) return
      // Le nom vient d'être comparé : l'enveloppe est bien celle de cet événement. Le
      // compilateur ne sait pas restreindre l'union sur un paramètre de type générique.
      const enveloppe = evenement as unknown as EnveloppeDe<N>
      reference.current(enveloppe.charge, enveloppe)
    })
  }, [client, cle, nom])
}

/**
 * Signale au serveur que l'utilisateur regarde (ou non) la page d'un salon — présence de
 * l'adversaire sur un match. La présence est remise à `false` au démontage et rejouée
 * automatiquement après une reconnexion.
 *
 * ```tsx
 * usePresence(salons.match(matchId), true)
 * ```
 */
export function usePresence(salon: string | null | undefined, surLaPage = true): void {
  const client = obtenirClientTempsReel()
  useEffect(() => {
    if (!salon) return
    client.envoyerPresence(salon, surLaPage)
    return () => client.envoyerPresence(salon, false)
  }, [client, salon, surLaPage])
}

// ─── Resynchronisation ────────────────────────────────────────────────────────

/** Une famille de clés (`cles.defis.tous`) ou une liste de familles. */
export type FamillesCles = readonly unknown[] | readonly (readonly unknown[])[]

function normaliserFamilles(familles: FamillesCles): readonly (readonly unknown[])[] {
  if (familles.length === 0) return []
  return Array.isArray(familles[0])
    ? (familles as readonly (readonly unknown[])[])
    : [familles as readonly unknown[]]
}

export interface OptionsResynchronisation {
  /**
   * Ignore la toute première connexion de l'onglet (les données viennent d'être chargées par
   * le loader SSR). Par défaut `false` : on resynchronise dès la première ouverture, ce qui
   * couvre les événements survenus entre le rendu serveur et l'ouverture du socket.
   */
  ignorerPremiere?: boolean
}

/**
 * Dernière génération de socket déjà resynchronisée, par famille de clés.
 *
 * Indispensable, et volontairement AU NIVEAU DU MODULE (pas un `useRef`) : un `useRef` naît
 * vide à chaque montage, l'effet ci-dessous se déclencherait donc à chaque arrivée sur
 * l'écran — c'est-à-dire à chaque navigation, et autant de fois que React remonte le
 * composant. La donnée que le loader vient tout juste de charger serait jetée aussitôt et
 * redemandée au serveur ; mesuré sur `/joueur/portefeuille`, cela faisait quatre
 * invalidations et trois appels réseau par écran, pour une seule navigation.
 *
 * La mémoire vit ici, hors de React : une famille n'est resynchronisée qu'une fois par
 * (re)connexion du socket, exactement ce que promet la documentation du hook.
 */
const resynchronisationsFaites = new Map<string, number>()

/**
 * Invalide les familles de clés données à CHAQUE (re)connexion du socket, en un seul appel.
 * C'est la seule forme de rafraîchissement autorisée : elle rattrape ce qui a été manqué
 * pendant une coupure, elle ne tourne jamais en boucle.
 *
 * ```tsx
 * useResynchronisation([cles.defis.tous, cles.matchs.tous])
 * useResynchronisation(cles.portefeuille.tous) // une seule famille : liste inutile
 * ```
 */
export function useResynchronisation(familles: FamillesCles, options: OptionsResynchronisation = {}): void {
  const queryClient = useQueryClient()
  // Sélection ciblée : le compteur de joueurs en ligne ne doit pas redessiner l'écran.
  const generation = useGenerationTempsReel()
  const ignorerPremiere = options.ignorerPremiere === true
  // Dépendance par valeur : `[cles.defis.tous]` est un tableau neuf à chaque rendu.
  const cle = JSON.stringify(normaliserFamilles(familles))

  useEffect(() => {
    if (generation === 0) return
    if (ignorerPremiere && generation === 1) return
    // Déjà resynchronisée pour cette connexion : l'écran est simplement remonté (navigation,
    // Suspense, remontage de développement). Ne rien redemander — le loader a la donnée.
    if (resynchronisationsFaites.get(cle) === generation) return
    resynchronisationsFaites.set(cle, generation)
    invaliderFamilles(queryClient, JSON.parse(cle) as readonly (readonly unknown[])[])
  }, [queryClient, generation, cle, ignorerPremiere])
}

// ─── Compte à rebours ─────────────────────────────────────────────────────────

export interface EtatChrono {
  /** Millisecondes restantes (0 une fois l'échéance atteinte). */
  restant: number
  /** Secondes restantes, arrondies au supérieur. */
  secondes: number
  /** `mm:ss`, ou `h:mm:ss` au-delà d'une heure. `—` tant que le chrono n'est pas prêt. */
  texte: string
  /** L'échéance est atteinte. */
  termine: boolean
  /** Une échéance est fournie et le décompte tourne. */
  actif: boolean
  /**
   * `false` pendant le rendu serveur ET le premier rendu client : le décompte ne démarre
   * qu'après hydratation, sinon le texte rendu par le serveur et celui du navigateur
   * différeraient d'une seconde (erreur d'hydratation).
   */
  pret: boolean
}

function formaterDuree(restant: number): string {
  const total = Math.ceil(restant / 1000)
  const heures = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secondes = total % 60
  const deux = (n: number) => String(n).padStart(2, '0')
  return heures > 0 ? `${heures}:${deux(minutes)}:${deux(secondes)}` : `${deux(minutes)}:${deux(secondes)}`
}

/**
 * Compte à rebours purement client à partir d'une date ISO fournie par le serveur
 * (`echeanceConfirmation`, `echeancePreuve`, `echeanceChoix`, `match.chrono`). Aucun appel
 * réseau, aucune requête : il s'arrête à zéro et le signale (`termine`, puis `surFin`).
 *
 * ```tsx
 * const chrono = useChrono(match.echeanceConfirmation, { surFin: () => rafraichir() })
 * <span className="chiffres">{chrono.texte}</span>
 * ```
 */
export function useChrono(echeance: string | null | undefined, options: { surFin?: () => void } = {}): EtatChrono {
  const cible = useMemo(() => {
    if (!echeance) return null
    const instant = Date.parse(echeance)
    return Number.isFinite(instant) ? instant : null
  }, [echeance])

  const [maintenant, setMaintenant] = useState<number | null>(null)
  const refFin = useRef(options.surFin)
  useEffect(() => {
    refFin.current = options.surFin
  })

  useEffect(() => {
    if (cible === null) {
      setMaintenant(null)
      return
    }
    setMaintenant(Date.now())
    if (Date.now() >= cible) {
      refFin.current?.()
      return
    }
    const minuterie = setInterval(() => {
      const instant = Date.now()
      setMaintenant(instant)
      if (instant >= cible) {
        clearInterval(minuterie)
        refFin.current?.()
      }
    }, 1000)
    return () => clearInterval(minuterie)
  }, [cible])

  const pret = cible !== null && maintenant !== null
  const restant = pret ? Math.max(0, cible - maintenant) : 0
  const termine = pret && restant === 0
  return {
    restant,
    secondes: Math.ceil(restant / 1000),
    texte: pret ? formaterDuree(restant) : '—',
    termine,
    actif: pret && !termine,
    pret,
  }
}

/** Rappel stable (identité constante) autour d'une fonction qui change à chaque rendu. */
export function useRappelStable<A extends unknown[]>(rappel: (...args: A) => void): (...args: A) => void {
  const reference = useRef(rappel)
  useEffect(() => {
    reference.current = rappel
  })
  return useCallback((...args: A) => reference.current(...args), [])
}

/**
 * Garantit que le socket est bien lié à l'utilisateur passé en paramètre (`null` pour un
 * visiteur). À monter dans les coquilles joueur et administrateur, qui savent QUI est connecté.
 *
 * Pourquoi c'est nécessaire : la connexion, l'inscription et le changement de compte se font par
 * navigation interne, sans recharger la page. Le socket ouvert reste alors celui du visiteur (ou
 * du compte précédent) ; il ne reçoit plus aucun événement privé — solde, notifications, matchs —
 * jusqu'au prochain rechargement complet. Le client ne peut pas s'en apercevoir seul : le cookie
 * de session est HttpOnly, il ne le lit pas.
 *
 * La vérification est relancée à chaque ouverture de socket (`generation`) et ne force qu'une
 * seule tentative par identité attendue, pour ne jamais boucler.
 */
export function useIdentiteTempsReel(utilisateurId: string | null | undefined): void {
  const client = useClientTempsReel()
  const generation = useGenerationTempsReel()
  useEffect(() => {
    client.verifierIdentite(utilisateurId ?? null)
  }, [client, utilisateurId, generation])
}
