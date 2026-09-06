import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

export interface ProprietesEmptyState {
  icone: IconDefinition
  titre: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/** État vide explicite : jamais une zone blanche sans explication. */
export function EmptyState({ icone: ic, titre, description, action, className = '' }: ProprietesEmptyState) {
  return (
    <div className={`motif-grille flex flex-col items-start gap-4 border-2 border-dashed border-trait px-6 py-10 ${className}`}>
      <span className="flex size-12 items-center justify-center border-2 border-encre bg-volt text-nuit">
        <FontAwesomeIcon icon={ic} className="text-lg" />
      </span>
      <div>
        <h3 className="text-h3">{titre}</h3>
        {description && <p className="mt-1 max-w-prose text-legende text-muet">{description}</p>}
      </div>
      {action}
    </div>
  )
}
