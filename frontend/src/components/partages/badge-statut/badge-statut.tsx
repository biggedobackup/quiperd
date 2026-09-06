import { decrireStatut, type FamilleStatut } from '@/lib/statuts'
import { Badge } from '../badge/badge'

export interface ProprietesBadgeStatut {
  famille: FamilleStatut
  valeur: string
  className?: string
}

/** Badge dérivé d'un statut backend : libellé et couleur viennent de lib/statuts.ts (source unique). */
export function BadgeStatut({ famille, valeur, className }: ProprietesBadgeStatut) {
  const d = decrireStatut(famille, valeur)
  return (
    <Badge variante={d.variante} actif={d.actif} className={className}>
      {d.libelle}
    </Badge>
  )
}
