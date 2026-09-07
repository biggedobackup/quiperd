import { Skeleton, SkeletonCarte } from '@/components/partages/skeleton/skeleton'

/**
 * Écran d'attente d'une navigation.
 *
 * Sans lui, le routeur continue d'afficher la page PRÉCÉDENTE pendant que le chargeur
 * de la nouvelle route travaille : le joueur voit les données de l'écran qu'il vient de
 * quitter, puis elles sont remplacées d'un coup. C'est déroutant — on croit lire la
 * nouvelle page alors qu'on lit encore l'ancienne.
 *
 * Ici, l'ossature de la page à venir prend la place tout de suite. Le seuil est réglé
 * dans `router.tsx` : une navigation instantanée ne fait pas clignoter ce squelette.
 */
export function SqueletteNavigation() {
  return (
    <div className="animate-apparition" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de la page…</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <div className="mt-8">
        <SkeletonCarte nombre={3} />
      </div>
    </div>
  )
}
