import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { icone } from '@/lib/icones'

/**
 * Bouton « remonter » des pages publiques. Elles font entre 4 000 et 8 000 px : sur téléphone,
 * revenir au menu depuis le pied de page demandait une dizaine de balayages.
 *
 * Il n'apparaît qu'après deux hauteurs d'écran, reste en bas à droite hors du pouce qui fait
 * défiler, et respecte `prefers-reduced-motion` (apparition sèche, remontée sans animation).
 */
export function RetourHaut() {
  const [visible, setVisible] = useState(false)
  const reduit = useReducedMotion()

  useEffect(() => {
    const seuil = () => window.innerHeight * 2
    const auDefilement = () => setVisible(window.scrollY > seuil())
    auDefilement()
    // `passive` : le navigateur n'attend pas ce gestionnaire pour dessiner le défilement.
    window.addEventListener('scroll', auDefilement, { passive: true })
    return () => window.removeEventListener('scroll', auDefilement)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: reduit ? 'auto' : 'smooth' })}
          aria-label="Revenir en haut de la page"
          className="fixed bottom-5 right-4 z-30 flex size-12 items-center justify-center rounded-full bg-encre text-craie shadow-carte-forte transition-colors hover:bg-vert sm:bottom-8 sm:right-8"
          initial={{ opacity: 0, y: reduit ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduit ? 0 : 12 }}
          transition={{ duration: reduit ? 0 : 0.18, ease: 'easeOut' }}
        >
          <FontAwesomeIcon icon={icone.retrait} />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
