import type { ReactNode } from 'react'

/** En-tête d'écran (espace joueur et tableau admin) : surtitre, titre Unbounded, actions à droite. */
export function EnTetePage({ surtitre, titre, description, actions }: { surtitre?: string; titre: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-trait pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {surtitre && <span className="etiquette text-vert">{surtitre}</span>}
        <h2 className="mt-1 hyphens-auto break-words text-h2 sm:text-h1">{titre}</h2>
        {description && <p className="mt-2 max-w-2xl text-legende text-muet">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
