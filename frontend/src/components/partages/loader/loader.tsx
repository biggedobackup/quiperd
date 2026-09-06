import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'

export function Loader({ libelle = 'Chargement…', className = '' }: { libelle?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-legende text-muet ${className}`} role="status" aria-live="polite">
      <FontAwesomeIcon icon={icone.chargement} className="animate-rotation" />
      <span>{libelle}</span>
    </div>
  )
}

/** Écran plein de chargement (pendant une navigation lente). */
export function LoaderPage() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Loader />
    </div>
  )
}
