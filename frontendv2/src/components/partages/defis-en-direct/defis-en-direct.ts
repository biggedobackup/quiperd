/**
 * Abonnement temps réel des écrans de défis — site public ET espace joueur.
 *
 * Le serveur pousse : aucun `refetchInterval`, aucun `setInterval` de rafraîchissement. La seule
 * requête réseau non déclenchée par l'utilisateur est l'invalidation unique de
 * `useResynchronisation`, à chaque (re)ouverture du socket, pour rattraper une coupure.
 *
 * Ce module n'exporte AUCUN composant : les briques visuelles vivent dans `animation-defis.tsx`.
 * Mélanger composants et fonctions dans un même fichier casse le Fast Refresh de Vite
 * (« export is incompatible »), ce qui laisse en développement des nœuds animés fantômes.
 *
 * Rangé dans `components/partages/` parce qu'il sert aux deux espaces : le site public (visiteur,
 * sans authentification) et l'espace joueur.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { cles } from '@/lib/query'
import { salons } from '@/temps-reel/evenements'
import { useEvenement, useResynchronisation } from '@/temps-reel/hooks'
import { ajouterDefi, majStatutDefi } from '@/temps-reel/cache'
import type { DefiListe, StatutDefi } from '@/models/defi'
import type { MatchEnrichi } from '@/models/match'

// ─── Cache : sortie de l'arène ────────────────────────────────────────────────

/**
 * Un défi quitte l'arène (rejoint, annulé, expiré) : il disparaît des listes « arène »
 * (`defis/ouverts` du site public et `defis/liste` de l'espace joueur) mais RESTE dans
 * « Mes défis » avec son nouveau statut — règle métier validée : la ligne du créateur ne
 * disparaît jamais, elle change d'étiquette.
 *
 * `majStatutDefi` couvre déjà `ouverts`, `mes` et la fiche de détail ; il ne retire rien des
 * listes `liste`, qui n'accueillent pourtant que des défis ouverts — d'où le second passage.
 */
export function sortirDeLArene(queryClient: QueryClient, defiId: string, statut: StatutDefi): void {
  majStatutDefi(queryClient, defiId, statut)
  if (statut === 'ouvert') return
  for (const requete of queryClient.getQueryCache().findAll({ queryKey: cles.defis.tous })) {
    if (requete.queryKey[1] !== 'liste') continue
    queryClient.setQueryData<DefiListe[]>(requete.queryKey, (ancien) => {
      if (!ancien) return ancien
      const reduit = ancien.filter((defi) => defi.id !== defiId)
      return reduit.length === ancien.length ? ancien : reduit
    })
  }
}

// ─── Abonnement ───────────────────────────────────────────────────────────────

export interface OptionsDefisEnDirect {
  /**
   * Identifiant du joueur connecté. Absent = visiteur : seul le salon public est demandé
   * (le hub accepte les connexions sans ticket, aucune authentification n'est requise).
   */
  utilisateurId?: string
  /**
   * Un adversaire vient de rejoindre UN DE MES défis : `match.cree` arrive sur mon salon
   * personnel. L'écran propose de rejoindre le match, il ne navigue jamais de force.
   */
  surMonDefiRejoint?: (match: MatchEnrichi) => void
}

/**
 * Rend une liste de défis vivante : création en tête, retrait à la volée, rattrapage après
 * coupure. À appeler une fois par écran affichant des défis.
 *
 * ```tsx
 * useDefisEnDirect()                                              // site public, visiteur
 * useDefisEnDirect({ utilisateurId: moi.id, surMonDefiRejoint })  // espace joueur
 * ```
 */
export function useDefisEnDirect({ utilisateurId, surMonDefiRejoint }: OptionsDefisEnDirect = {}): void {
  const queryClient = useQueryClient()
  // Tableau recréé à chaque rendu : `useEvenement` en fait une clé de valeur, aucun réabonnement.
  const salonPersonnel = utilisateurId ? salons.utilisateur(utilisateurId) : null
  const ecoutes = salonPersonnel ? [salons.defisPublics, salonPersonnel] : [salons.defisPublics]

  // Rattrapage de ce qui s'est passé pendant une coupure — une invalidation par (re)connexion.
  useResynchronisation([cles.defis.tous])

  useEvenement('defi.cree', (defi) => ajouterDefi(queryClient, defi, { utilisateurId }), ecoutes)
  useEvenement('defi.rejoint', ({ defiId }) => sortirDeLArene(queryClient, defiId, 'complet'), ecoutes)
  useEvenement('defi.annule', ({ defiId }) => sortirDeLArene(queryClient, defiId, 'annule'), ecoutes)
  useEvenement('defi.expire', ({ defiId }) => sortirDeLArene(queryClient, defiId, 'expire'), ecoutes)

  useEvenement(
    'match.cree',
    (match) => {
      // `match.cree` arrive aussi quand c'est MOI qui rejoins : l'écran de départ navigue déjà.
      if (!utilisateurId || match.joueur1Id !== utilisateurId) return
      surMonDefiRejoint?.(match)
    },
    salonPersonnel,
  )
}
