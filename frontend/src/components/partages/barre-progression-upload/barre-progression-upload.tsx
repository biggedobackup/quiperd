export interface ProprietesBarreProgression {
  pourcentage: number
  libelle?: string
  className?: string
}

/** Barre plate : curseur volt sur rail trait, pourcentage en mono. */
export function BarreProgressionUpload({ pourcentage, libelle = 'Envoi en cours', className = '' }: ProprietesBarreProgression) {
  const p = Math.max(0, Math.min(100, Math.round(pourcentage)))
  return (
    <div className={`space-y-1.5 ${className}`} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={libelle}>
      <div className="flex justify-between text-legende">
        <span className="text-muet">{libelle}</span>
        <span className="chiffres font-bold">{p} %</span>
      </div>
      <div className="h-2 w-full border border-encre bg-gris">
        <div className="h-full bg-volt transition-[width] duration-150 ease-out" style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}
