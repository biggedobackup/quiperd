/**
 * Squelettes de chargement : même hauteur que le contenu final (zéro décalage de mise en page),
 * balayage `shimmer` plat (une bande de papier qui traverse, pas de dégradé).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-trait/70 ${className}`} aria-hidden="true">
      <div className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-papier/70" />
    </div>
  )
}

export function SkeletonTexte({ lignes = 3, className = '' }: { lignes?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lignes }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lignes - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

/** Carte ticket fantôme (liste de défis / matchs). */
export function SkeletonCarte({ nombre = 3 }: { nombre?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: nombre }).map((_, i) => (
        <div key={i} className="ticket border-2 border-trait bg-papier p-5">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="mt-6 h-10 w-32" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/** Lignes de tableau fantômes. */
export function SkeletonLignes({ lignes = 5, colonnes = 4 }: { lignes?: number; colonnes?: number }) {
  return (
    <div className="divide-y divide-trait border-2 border-trait" aria-busy="true">
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="grid items-center gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }}>
          {Array.from({ length: colonnes }).map((__, j) => (
            <Skeleton key={j} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonStat({ nombre = 4 }: { nombre?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
      {Array.from({ length: nombre }).map((_, i) => (
        <div key={i} className="border-2 border-trait bg-papier p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-9 w-32" />
        </div>
      ))}
    </div>
  )
}
