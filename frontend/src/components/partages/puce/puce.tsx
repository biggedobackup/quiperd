import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

export interface ProprietesPuce {
  actif: boolean
  onClick: () => void
  icone?: IconDefinition
  /** Compteur affiché en mono à droite du libellé. */
  compte?: number
  children: ReactNode
}

/** Puce de filtre (onglet carré) : noire quand active, verte au survol — jamais de pilule. */
export function Puce({ actif, onClick, icone: ic, compte, children }: ProprietesPuce) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      className={`etiquette inline-flex h-11 items-center gap-2 border-2 border-encre px-3 transition-colors ${
        actif ? 'bg-encre text-craie' : 'bg-papier text-encre hover:bg-volt hover:text-nuit'
      }`}
    >
      {ic && <FontAwesomeIcon icon={ic} className={actif ? 'text-volt' : 'text-muet'} />}
      {children}
      {compte !== undefined && <span className={`chiffres ${actif ? 'text-volt' : 'text-muet'}`}>{compte}</span>}
    </button>
  )
}
