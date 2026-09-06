import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { formatMontant, versNombre } from '@/lib/format'

export interface ProprietesCompteurAnime {
  valeur: string | number
  /** `montant` → « 2 000 FCFA », `entier` → « 12 ». */
  format?: 'montant' | 'entier'
  devise?: string
  dureeMs?: number
  className?: string
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Compteur qui s'anime de 0 à la valeur au montage (600 ms), une seule fois ;
 * les changements de valeur ultérieurs s'animent depuis la valeur précédente.
 * Affiche directement la valeur si `prefers-reduced-motion`.
 */
export function CompteurAnime({ valeur, format = 'montant', devise = 'XOF', dureeMs = 600, className = '' }: ProprietesCompteurAnime) {
  const cible = versNombre(valeur)
  const reduit = useReducedMotion()
  const [affiche, setAffiche] = useState(reduit ? cible : 0)
  const precedent = useRef(reduit ? cible : 0)

  useEffect(() => {
    if (reduit) {
      setAffiche(cible)
      precedent.current = cible
      return
    }
    const depart = precedent.current
    const debut = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - debut) / dureeMs)
      const v = depart + (cible - depart) * easeOut(p)
      setAffiche(v)
      if (p < 1) raf = requestAnimationFrame(tick)
      else precedent.current = cible
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cible, dureeMs, reduit])

  const texte = format === 'montant' ? formatMontant(Math.round(affiche), devise) : Math.round(affiche).toLocaleString('fr-FR')
  return (
    <span className={`chiffres ${className}`} aria-label={format === 'montant' ? formatMontant(cible, devise) : String(cible)}>
      {texte}
    </span>
  )
}
