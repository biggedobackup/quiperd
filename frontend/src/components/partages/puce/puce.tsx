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

/** Puce de filtre : verte pleine quand active, contour gris sinon. */
export function Puce({ actif, onClick, icone: ic, compte, children }: ProprietesPuce) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      className={`etiquette inline-flex h-11 items-center gap-2 rounded-full border px-4 transition-colors ${
        actif ? 'border-transparent bg-vert text-craie' : 'border-trait bg-papier text-encre hover:border-vert hover:text-vert'
      }`}
    >
      {ic && <FontAwesomeIcon icon={ic} className={actif ? 'text-craie' : 'text-muet'} />}
      {children}
      {compte !== undefined && <span className={`chiffres ${actif ? 'text-craie/80' : 'text-muet'}`}>{compte}</span>}
    </button>
  )
}
