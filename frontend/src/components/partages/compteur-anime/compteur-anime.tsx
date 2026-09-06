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
    const arriverDirectement = () => {
      setAffiche(cible)
      precedent.current = cible
    }
    // Onglet en arrière-plan : le navigateur suspend complètement requestAnimationFrame.
    // Animer serait non seulement inutile, mais dangereux — le compteur resterait figé sur
    // sa valeur de départ, c'est-à-dire un solde affiché à 0 FCFA alors qu'il ne l'est pas.
    if (reduit || (typeof document !== 'undefined' && document.hidden)) {
      arriverDirectement()
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
    // Filet de sécurité : l'onglet peut passer en arrière-plan APRÈS le démarrage, ou le
    // navigateur brider les images par seconde. Les minuteries, elles, continuent de tomber
    // (au ralenti) : passé la durée de l'animation, on affiche la valeur réelle quoi qu'il arrive.
    const filet = window.setTimeout(arriverDirectement, dureeMs + 250)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(filet)
    }
  }, [cible, dureeMs, reduit])

  const texte = format === 'montant' ? formatMontant(Math.round(affiche), devise) : Math.round(affiche).toLocaleString('fr-FR')
  return (
    <span className={`chiffres ${className}`} aria-label={format === 'montant' ? formatMontant(cible, devise) : String(cible)}>
      {texte}
    </span>
  )
}
