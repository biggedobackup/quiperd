/**
 * Mise à jour chirurgicale du cache TanStack Query à la réception d'un événement.
 *
 * Pourquoi ne pas simplement invalider ? Parce qu'invalider redéclenche un appel réseau : ce
 * serait remplacer le polling par un polling piloté par le serveur. Un événement porte déjà la
 * donnée à jour, on l'écrit donc directement dans le cache. `useResynchronisation` reste la
 * seule invalidation autorisée, et seulement à la (re)connexion du socket.
 *
 * Les clés de listes sont PARAMÉTRÉES par les filtres (`cles.defis.liste(filtres)`,
 * `cles.defis.ouverts(filtres)`, `cles.matchs.liste(statut)`) : il n'existe donc pas une clé
 * unique à viser. On parcourt le cache par préfixe de famille et on décide liste par liste,
 * en respectant les filtres actifs — un défi qui ne correspond pas aux filtres d'une liste
 * n'y est jamais inséré, et un match dont le statut a changé sort de la liste qu'il quitte.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { cles } from '@/lib/query'
import type { DefiListe, FiltresDefis, StatutDefi } from '@/models/defi'
import type { DetailMatch, MatchEnrichi } from '@/models/match'
import type { Notification } from '@/models/notification'
import type { Page } from '@/models/pagination'
import type { Portefeuille } from '@/models/portefeuille'
import type { TransactionPortefeuille } from '@/models/transaction-portefeuille'

// ─── Utilitaires de clés ──────────────────────────────────────────────────────

function memeElement(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/** `true` si `cle` commence par `prefixe` (comparaison de famille TanStack Query). */
export function commencePar(cle: readonly unknown[], prefixe: readonly unknown[]): boolean {
  if (prefixe.length > cle.length) return false
  return prefixe.every((element, index) => memeElement(cle[index], element))
}

/** Segment de clé lu comme chaîne (les clés sont typées `readonly unknown[]`). */
function segment(cle: readonly unknown[], index: number): string | undefined {
  const valeur = cle[index]
  return typeof valeur === 'string' ? valeur : undefined
}

function objet(cle: readonly unknown[], index: number): Record<string, unknown> {
  const valeur = cle[index]
  return typeof valeur === 'object' && valeur !== null ? (valeur as Record<string, unknown>) : {}
}

/**
 * Invalide en UN SEUL appel toutes les requêtes appartenant à l'une des familles données.
 * Utilisé par `useResynchronisation` — la seule invalidation autorisée du projet.
 */
export function invaliderFamilles(queryClient: QueryClient, familles: readonly (readonly unknown[])[]): void {
  if (familles.length === 0) return
  void queryClient.invalidateQueries({
    predicate: (requete) => familles.some((famille) => commencePar(requete.queryKey, famille)),
  })
}

/** Clés de la famille `defis` présentes dans le cache, hors détail. */
function listesDefis(queryClient: QueryClient): QueryKey[] {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: cles.defis.tous })
    .map((requete) => requete.queryKey)
    .filter((cle) => {
      const genre = segment(cle, 1)
      return genre === 'ouverts' || genre === 'liste' || genre === 'mes'
    })
}

// ─── Défis ────────────────────────────────────────────────────────────────────

/** Filtres effectifs d'une clé de liste de défis (`mes` est porté par la clé elle-même). */
function filtresDeLaCle(cle: readonly unknown[]): FiltresDefis {
  if (segment(cle, 1) === 'mes') return { mes: true }
  return objet(cle, 2) as FiltresDefis
}

/** Le défi entre-t-il dans une liste filtrée ainsi ? `utilisateurId` sert au filtre « mes défis ». */
export function correspondAuxFiltres(defi: DefiListe, filtres: FiltresDefis, utilisateurId?: string): boolean {
  if (filtres.categorie && defi.jeuCategorie !== filtres.categorie) return false
  if (filtres.famille && defi.plateformeFamille !== filtres.famille) return false
  if (filtres.jeu && defi.jeuId !== filtres.jeu) return false
  if (filtres.plateforme && defi.plateformeId !== filtres.plateforme) return false
  if (filtres.miseMax !== undefined && Number(defi.montantMise) > filtres.miseMax) return false
  if (filtres.mes && (!utilisateurId || defi.createurId !== utilisateurId)) return false
  return true
}

export interface OptionsDefi {
  /** Identifiant du joueur connecté : sans lui, les listes « mes défis » ne sont pas touchées. */
  utilisateurId?: string
}

/**
 * Insère (ou remplace) un défi dans TOUTES les listes en cache qui l'acceptent.
 * Les listes « défis ouverts » n'accueillent que les défis au statut `ouvert`.
 *
 * ```ts
 * useEvenement('defi.cree', (defi) => ajouterDefi(queryClient, defi, { utilisateurId: moi.id }))
 * ```
 */
export function ajouterDefi(queryClient: QueryClient, defi: DefiListe, options: OptionsDefi = {}): void {
  for (const cle of listesDefis(queryClient)) {
    const genre = segment(cle, 1)
    if (genre === 'ouverts' && defi.statut !== 'ouvert') continue
    if (!correspondAuxFiltres(defi, filtresDeLaCle(cle), options.utilisateurId)) continue
    queryClient.setQueryData<DefiListe[]>(cle, (ancien) => {
      if (!ancien) return ancien
      const index = ancien.findIndex((d) => d.id === defi.id)
      if (index >= 0) {
        const copie = [...ancien]
        copie[index] = defi
        return copie
      }
      return [defi, ...ancien]
    })
  }
}

/**
 * Retire un défi de toutes les listes en cache (rejoint, annulé, expiré).
 *
 * ```ts
 * useEvenement('defi.rejoint', ({ defiId }) => retirerDefi(queryClient, defiId))
 * ```
 */
export function retirerDefi(queryClient: QueryClient, defiId: string): void {
  for (const cle of listesDefis(queryClient)) {
    queryClient.setQueryData<DefiListe[]>(cle, (ancien) => {
      if (!ancien) return ancien
      const filtre = ancien.filter((defi) => defi.id !== defiId)
      return filtre.length === ancien.length ? ancien : filtre
    })
  }
}

/**
 * Met à jour le statut d'un défi dans le cache : listes (le défi sort des listes « ouverts »
 * s'il ne l'est plus) et fiche de détail.
 *
 * ```ts
 * useEvenement('defi.annule', ({ defiId }) => majStatutDefi(queryClient, defiId, 'annule'))
 * ```
 */
export function majStatutDefi(queryClient: QueryClient, defiId: string, statut: StatutDefi): void {
  for (const cle of listesDefis(queryClient)) {
    const genre = segment(cle, 1)
    queryClient.setQueryData<DefiListe[]>(cle, (ancien) => {
      if (!ancien) return ancien
      const index = ancien.findIndex((defi) => defi.id === defiId)
      if (index < 0) return ancien
      if (genre === 'ouverts' && statut !== 'ouvert') return ancien.filter((defi) => defi.id !== defiId)
      const copie = [...ancien]
      const precedent = copie[index]
      if (precedent) copie[index] = { ...precedent, statut }
      return copie
    })
  }
  queryClient.setQueryData<{ defi: DefiListe; match?: MatchEnrichi }>(cles.defis.detail(defiId), (ancien) =>
    ancien ? { ...ancien, defi: { ...ancien.defi, statut } } : ancien,
  )
}

// ─── Matchs ───────────────────────────────────────────────────────────────────

export interface OptionsMatch {
  /** Insère le match dans les listes compatibles où il est absent (événement `match.cree`). */
  ajouter?: boolean
}

/**
 * Remplace un match partout où il est en cache : fiche de détail (joueur et admin), listes
 * « mes matchs » (`cles.matchs.liste(statut)`) et pages admin (`Page<MatchEnrichi>`).
 * Le statut est respecté : un match terminé sort de la liste « en cours ».
 *
 * ```ts
 * useEvenement('match.termine', (m) => remplacerMatch(queryClient, m))
 * useEvenement('match.cree', (m) => remplacerMatch(queryClient, m, { ajouter: true }))
 * ```
 */
export function remplacerMatch(queryClient: QueryClient, match: MatchEnrichi, options: OptionsMatch = {}): void {
  for (const requete of queryClient.getQueryCache().findAll({ queryKey: cles.matchs.tous })) {
    const cle = requete.queryKey
    const genre = segment(cle, 1)

    if (genre === 'detail') {
      if (segment(cle, 2) !== match.id) continue
      if (segment(cle, 3) === 'preuves') continue // ['matchs','detail',id,'preuves',role]
      queryClient.setQueryData<DetailMatch>(cle, (ancien) =>
        ancien ? { ...ancien, match: { ...ancien.match, ...match } } : ancien,
      )
      continue
    }

    if (genre === 'liste') {
      const statutFiltre = segment(cle, 2) ?? 'tous'
      const accepte = statutFiltre === 'tous' || statutFiltre === match.statut
      queryClient.setQueryData<MatchEnrichi[]>(cle, (ancien) => {
        if (!ancien) return ancien
        return appliquerDansListe(ancien, match, accepte, options.ajouter === true)
      })
      continue
    }

    if (genre === 'admin') {
      const statutFiltre = segment(cle, 2) ?? String(objet(cle, 2).statut ?? 'tous')
      const accepte = statutFiltre === 'tous' || statutFiltre === match.statut
      queryClient.setQueryData<Page<MatchEnrichi>>(cle, (ancien) => {
        if (!ancien) return ancien
        // Une page admin ne change jamais de taille ici : on remplace ou on retire, sans
        // décaler la pagination (le total resterait faux).
        const elements = ancien.elements.some((m) => m.id === match.id)
          ? accepte
            ? ancien.elements.map((m) => (m.id === match.id ? { ...m, ...match } : m))
            : ancien.elements.filter((m) => m.id !== match.id)
          : ancien.elements
        return elements === ancien.elements ? ancien : { ...ancien, elements }
      })
    }
  }
}

function appliquerDansListe(
  liste: MatchEnrichi[],
  match: MatchEnrichi,
  accepte: boolean,
  ajouter: boolean,
): MatchEnrichi[] {
  const present = liste.some((m) => m.id === match.id)
  if (!accepte) return present ? liste.filter((m) => m.id !== match.id) : liste
  if (present) return liste.map((m) => (m.id === match.id ? { ...m, ...match } : m))
  return ajouter ? [match, ...liste] : liste
}

// ─── Portefeuille, transactions, notifications ────────────────────────────────

export interface SoldePartiel {
  soldeDisponible: string
  soldeBloque: string
  devise: string
}

/**
 * Fusionne un nouveau solde dans le portefeuille en cache (événement `portefeuille.maj`).
 * Aucun calcul côté frontend : les montants sont ceux du serveur.
 *
 * ```ts
 * useEvenement('portefeuille.maj', (solde) => fusionnerSolde(queryClient, solde))
 * ```
 */
export function fusionnerSolde(queryClient: QueryClient, solde: SoldePartiel): void {
  queryClient.setQueryData<Portefeuille>(cles.portefeuille.solde, (ancien) =>
    ancien ? { ...ancien, ...solde } : ancien,
  )
}

/**
 * Ajoute un mouvement en tête de la première page de l'historique (les pages suivantes
 * restent telles quelles : elles seront rechargées à la navigation).
 */
export function ajouterTransaction(queryClient: QueryClient, transaction: TransactionPortefeuille): void {
  queryClient.setQueryData<TransactionPortefeuille[]>(cles.portefeuille.transactions(1), (ancien) => {
    if (!ancien) return ancien
    if (ancien.some((t) => t.id === transaction.id)) return ancien
    return [transaction, ...ancien].slice(0, ancien.length)
  })
}

/** Ajoute une notification en tête de la liste en cache (événement `notification.nouvelle`). */
export function ajouterNotification(queryClient: QueryClient, notification: Notification): void {
  queryClient.setQueryData<Notification[]>(cles.notifications, (ancien) => {
    if (!ancien) return ancien
    if (ancien.some((n) => n.id === notification.id)) return ancien
    return [notification, ...ancien]
  })
}
