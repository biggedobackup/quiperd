/**
 * Temps réel de l'espace administrateur — salon `admin`.
 *
 * Règle du projet : le serveur pousse, l'interface n'interroge JAMAIS en boucle. Il ne reste
 * donc ni `refetchInterval` ni `setInterval` de rafraîchissement dans `routes/admin/*`. Les
 * seuls appels réseau déclenchés ici sont :
 *   - la resynchronisation d'après coupure (`useResynchronisation`, une fois par (re)connexion) ;
 *   - un rechargement demandé EXPLICITEMENT par l'administrateur (bouton « Afficher » du
 *     bandeau de file d'attente).
 *
 * Pourquoi un bandeau plutôt qu'une insertion directe ? Les listes admin sont paginées et lues
 * ligne à ligne : insérer un élément en tête ferait glisser tout le tableau sous le curseur.
 * On annonce donc « 3 nouveaux litiges — afficher » et c'est l'administrateur qui décide.
 */
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { cles } from '@/lib/query'
import { formatMontant } from '@/lib/format'
import { clesContact } from '@/services/contact'
import type { Statistiques } from '@/models/administration'
import { salons } from '@/temps-reel/evenements'
import { useEvenement, useResynchronisation } from '@/temps-reel/hooks'
import { Button } from '@/components/partages/button/button'
import { toastAttention, toastInfo } from '@/components/partages/toast/toast'

// ─── Compteurs du tableau de bord ─────────────────────────────────────────────

/**
 * Fusionne une charge `admin.kpi` (compteurs modifiés uniquement) dans les statistiques en
 * cache, SANS réécrire le reste : les clés absentes de la charge gardent leur valeur.
 *
 * Les montants de `Statistiques` sont des chaînes décimales et les compteurs des nombres :
 * la valeur reçue est convertie dans le type du champ existant. Une clé inconnue est ignorée
 * (le cache ne doit jamais accueillir un champ que les écrans ne savent pas lire).
 */
export function fusionnerKpi(queryClient: QueryClient, partiel: Record<string, number | string>): void {
  queryClient.setQueryData<Statistiques>(cles.admin.statistiques, (ancien) => {
    if (!ancien) return ancien
    const suivant: Record<string, unknown> = { ...ancien }
    let change = false
    for (const [nom, valeur] of Object.entries(partiel)) {
      if (!(nom in suivant)) continue
      // Le backend sérialise les compteurs en nombres et les MONTANTS en chaînes décimales
      // (`shopspring/decimal`). Refuser les chaînes laisserait le volume misé, la commission
      // cumulée, les dépôts et les retraits figés jusqu'au prochain chargement de page.
      const brut = typeof valeur === 'string' ? Number(valeur) : valeur
      if (typeof brut !== 'number' || !Number.isFinite(brut)) continue
      const courant = suivant[nom]
      const nouvelle = typeof courant === 'string' ? String(valeur) : brut
      if (courant === nouvelle) continue
      suivant[nom] = nouvelle
      change = true
    }
    return change ? (suivant as unknown as Statistiques) : ancien
  })
}

/** Clés numériques de `Statistiques` (les montants sont des chaînes : hors de portée). */
type CompteurStatistiques = {
  [C in keyof Statistiques]: Statistiques[C] extends number ? C : never
}[keyof Statistiques]

/**
 * Ajuste un compteur d'une unité quand l'événement reçu n'a pas de charge `admin.kpi`
 * associée (le backend ne publie pas encore de KPI pour tous les mouvements). Un
 * `admin.kpi` ultérieur porte des valeurs ABSOLUES : il corrige d'office toute dérive.
 */
export function ajusterKpi(queryClient: QueryClient, compteur: CompteurStatistiques, delta: number): void {
  queryClient.setQueryData<Statistiques>(cles.admin.statistiques, (ancien) =>
    ancien ? { ...ancien, [compteur]: Math.max(0, ancien[compteur] + delta) } : ancien,
  )
}

// ─── File d'attente (bandeau « N nouveaux … ») ────────────────────────────────

export interface FileTempsReel {
  /** Nombre d'éléments annoncés depuis le dernier « Afficher ». */
  nombre: number
  /** Enregistre un identifiant ; un même identifiant n'est jamais compté deux fois. */
  signaler: (identifiant: string) => void
  vider: () => void
}

/**
 * Accumule les identifiants poussés par le serveur sans toucher à la liste affichée.
 *
 * ```tsx
 * const file = useFileTempsReel()
 * useEvenement('admin.litige_ouvert', ({ litigeId }) => file.signaler(litigeId), salons.admin)
 * <BandeauNouveautes nombre={file.nombre} singulier="nouveau litige" … />
 * ```
 */
export function useFileTempsReel(): FileTempsReel {
  const [identifiants, setIdentifiants] = useState<readonly string[]>([])
  const signaler = useCallback((identifiant: string) => {
    if (!identifiant) return
    setIdentifiants((liste) => (liste.includes(identifiant) ? liste : [...liste, identifiant]))
  }, [])
  const vider = useCallback(() => setIdentifiants([]), [])
  return { nombre: identifiants.length, signaler, vider }
}

export interface ProprietesBandeauNouveautes {
  nombre: number
  /** Libellé au singulier, ex. « nouveau litige ». */
  singulier: string
  /** Libellé au pluriel, ex. « nouveaux litiges ». */
  plurielForme: string
  /** Rechargement demandé par l'administrateur (jamais automatique). */
  onAfficher: () => void
  className?: string
}

/**
 * Bandeau d'annonce d'une file d'attente. Cible tactile ≥ 44 px en mobile, fond blanc ou vert
 * très clair de la charte, zéro dégradé.
 */
export function BandeauNouveautes({ nombre, singulier, plurielForme, onAfficher, className = '' }: ProprietesBandeauNouveautes) {
  if (nombre <= 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-3 border-2 border-encre bg-volt-fond px-4 py-3 ${className}`}
    >
      <span className="inline-block size-2 shrink-0 animate-pulsation bg-volt" aria-hidden="true" />
      <p className="text-legende font-semibold">
        <span className="chiffres">{nombre}</span> {nombre > 1 ? plurielForme : singulier}
      </p>
      <Button variante="secondaire" taille="sm" className="ml-auto min-h-11 sm:min-h-0" onClick={onAfficher}>
        Afficher
      </Button>
    </div>
  )
}

// ─── Journal « activité en direct » ───────────────────────────────────────────

export type GenreEvenementAdmin = 'litige' | 'paiement' | 'preuve'

export interface EvenementAdmin {
  /** Identité de l'événement — sert aussi de clé React et de garde anti-doublon. */
  cle: string
  genre: GenreEvenementAdmin
  libelle: string
  detail: string
  horodatage: string
}

/**
 * Le journal vit hors de React (module) et non dans un état de composant : la coquille admin
 * reste montée pendant que les pages changent, mais le tableau de bord, lui, est démonté à
 * chaque navigation — il retrouve ainsi ce qui est arrivé pendant son absence.
 */
const JOURNAL_VIDE: readonly EvenementAdmin[] = []
let journal: readonly EvenementAdmin[] = JOURNAL_VIDE
const abonnesJournal = new Set<() => void>()

function poserAuJournal(entree: EvenementAdmin): void {
  if (journal.some((e) => e.cle === entree.cle)) return
  journal = [entree, ...journal].slice(0, 8)
  for (const notifier of [...abonnesJournal]) notifier()
}

function sabonnerJournal(notifier: () => void): () => void {
  abonnesJournal.add(notifier)
  return () => {
    abonnesJournal.delete(notifier)
  }
}

const lireJournal = () => journal
/** Rendu serveur : toujours vide, donc identique au premier rendu client (pas d'hydratation cassée). */
const lireJournalServeur = () => JOURNAL_VIDE

/** Derniers événements d'administration reçus dans cet onglet (au plus 8, du plus récent). */
export function useJournalAdmin(): readonly EvenementAdmin[] {
  return useSyncExternalStore(sabonnerJournal, lireJournal, lireJournalServeur)
}

// ─── Abonnement global de l'espace admin ──────────────────────────────────────

/**
 * Abonnement du tableau admin au salon `admin`, monté une seule fois par la coquille
 * (`LayoutAdmin`) : compteurs, journal et toasts restent vivants quelle que soit la page
 * ouverte. Ne rend rien.
 */
export function AbonnementAdmin(): null {
  const queryClient = useQueryClient()
  const chemin = useRouterState({ select: (etat) => etat.location.pathname })
  const litigesComptes = useRef<Set<string>>(new Set())

  // Seule invalidation autorisée : une par (re)connexion du socket, jamais en boucle.
  useResynchronisation([
    cles.admin.statistiques,
    cles.litiges.tous,
    cles.admin.paiementsTous,
    cles.matchs.tous,
    clesContact.tous,
  ])

  useEvenement('admin.kpi', (partiel) => fusionnerKpi(queryClient, partiel), salons.admin)

  useEvenement(
    'admin.litige_ouvert',
    ({ litigeId, matchId, motif }, enveloppe) => {
      // La relance d'arbitrage republie le même litige : l'ouverture n'est comptée qu'une fois.
      if (!litigesComptes.current.has(litigeId)) {
        litigesComptes.current.add(litigeId)
        ajusterKpi(queryClient, 'litigesOuverts', 1)
      }
      poserAuJournal({
        cle: `litige:${litigeId}`,
        genre: 'litige',
        libelle: 'Litige à arbitrer',
        detail: motif || `Match ${matchId.slice(0, 8)}`,
        horodatage: enveloppe.horodatage,
      })
      if (chemin.startsWith('/admin/litiges')) return
      toastAttention('Nouveau litige à arbitrer', motif)
    },
    salons.admin,
  )

  useEvenement(
    'admin.paiement_a_traiter',
    ({ paiementId, type, montant }, enveloppe) => {
      const libelle = type === 'retrait' ? 'Retrait à traiter' : 'Dépôt à traiter'
      poserAuJournal({
        cle: `paiement:${paiementId}`,
        genre: 'paiement',
        libelle,
        detail: formatMontant(montant),
        horodatage: enveloppe.horodatage,
      })
      if (chemin.startsWith('/admin/paiements')) return
      toastInfo(libelle, `${formatMontant(montant)} en attente de validation.`)
    },
    salons.admin,
  )

  useEvenement(
    'admin.preuve_a_verifier',
    ({ preuveId, matchId }, enveloppe) => {
      poserAuJournal({
        cle: `preuve:${preuveId}`,
        genre: 'preuve',
        libelle: 'Preuve à vérifier',
        detail: `Match ${matchId.slice(0, 8)}`,
        horodatage: enveloppe.horodatage,
      })
      if (chemin.startsWith('/admin/matchs')) return
      toastInfo('Nouvelle preuve à vérifier', 'Un joueur vient d’envoyer une preuve de match.')
    },
    salons.admin,
  )

  return null
}
