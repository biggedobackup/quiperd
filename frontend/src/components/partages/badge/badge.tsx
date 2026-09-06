import type { ReactNode } from 'react'
import type { VarianteStatut } from '@/lib/statuts'

const VARIANTES: Record<VarianteStatut, { fond: string; texte: string; point: string }> = {
  neutre: { fond: 'bg-gris', texte: 'text-muet', point: 'bg-muet' },
  info: { fond: 'bg-info-fond', texte: 'text-info', point: 'bg-info' },
  gain: { fond: 'bg-gain-fond', texte: 'text-gain', point: 'bg-gain' },
  perte: { fond: 'bg-perte-fond', texte: 'text-perte', point: 'bg-perte' },
  alerte: { fond: 'bg-alerte-fond', texte: 'text-alerte', point: 'bg-alerte' },
  volt: { fond: 'bg-volt', texte: 'text-nuit', point: 'bg-nuit' },
}

export interface ProprietesBadge {
  variante?: VarianteStatut
  /** Pastille carrée qui pulse lentement (état vivant). */
  actif?: boolean
  sansPoint?: boolean
  className?: string
  children: ReactNode
}

/** Étiquette carrée en capitales, pastille 8 px — jamais de pilule arrondie. */
export function Badge({ variante = 'neutre', actif = false, sansPoint = false, className = '', children }: ProprietesBadge) {
  const v = VARIANTES[variante]
  return (
    <span
      className={`etiquette inline-flex h-6 items-center gap-1.5 border border-current/20 px-2 ${v.fond} ${v.texte} ${className}`}
    >
      {!sansPoint && (
        <span className={`inline-block size-2 ${v.point} ${actif ? 'animate-pulsation' : ''}`} aria-hidden="true" />
      )}
      {children}
    </span>
  )
}
