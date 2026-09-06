import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'

export interface ProprietesModal {
  ouvert: boolean
  onFermer: () => void
  titre: string
  description?: ReactNode
  children: ReactNode
  pied?: ReactNode
  taille?: 'sm' | 'md' | 'lg'
  /** Empêche la fermeture pendant une action en cours. */
  verrouille?: boolean
}

const TAILLES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-3xl' }

/**
 * Fenêtre modale « ticket » : fond voilé, panneau à coins coupés, fermeture par Échap,
 * clic sur le fond et bouton ; focus déplacé dans le panneau puis restitué.
 */
export function Modal({ ouvert, onFermer, titre, description, children, pied, taille = 'md', verrouille = false }: ProprietesModal) {
  const idTitre = useId()
  const panneau = useRef<HTMLDivElement>(null)
  const elementPrecedent = useRef<Element | null>(null)
  const reduit = useReducedMotion()

  useEffect(() => {
    if (!ouvert) return
    elementPrecedent.current = document.activeElement
    // `html` porte `overflow-x: clip` (app.css) : `overflow: hidden` sur body seul ne bloque plus
    // le défilement de la fenêtre — on verrouille html ET body (même règle que le menu mobile).
    const precedentOverflow = document.body.style.overflow
    const precedentOverflowHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const timer = window.setTimeout(() => {
      const premier = panneau.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([data-fermer]), [href], [tabindex]:not([tabindex="-1"])',
      )
      ;(premier ?? panneau.current)?.focus()
    }, 30)
    const onTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !verrouille) onFermer()
      if (e.key === 'Tab' && panneau.current) {
        const focusables = Array.from(
          panneau.current.querySelectorAll<HTMLElement>(
            'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled'))
        if (focusables.length === 0) return
        const premier = focusables[0]
        const dernier = focusables[focusables.length - 1]
        if (!premier || !dernier) return
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault()
          dernier.focus()
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault()
          premier.focus()
        }
      }
    }
    document.addEventListener('keydown', onTouche)
    return () => {
      document.removeEventListener('keydown', onTouche)
      document.body.style.overflow = precedentOverflow
      document.documentElement.style.overflow = precedentOverflowHtml
      window.clearTimeout(timer)
      if (elementPrecedent.current instanceof HTMLElement) elementPrecedent.current.focus()
    }
  }, [ouvert, onFermer, verrouille])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {ouvert && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-voile p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduit ? 0 : 0.16 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !verrouille) onFermer()
          }}
        >
          <motion.div
            ref={panneau}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTitre}
            tabIndex={-1}
            className={`ticket w-full ${TAILLES[taille]} max-h-[92dvh] overflow-y-auto border-2 border-encre bg-papier text-encre shadow-tampon outline-none`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: reduit ? 0 : 0.2, ease: 'easeOut' }}
          >
            <header className="flex items-start justify-between gap-4 border-b-2 border-encre px-5 py-4">
              <div>
                <h2 id={idTitre} className="text-h3">
                  {titre}
                </h2>
                {description && <p className="mt-1 text-legende text-muet">{description}</p>}
              </div>
              <button
                type="button"
                data-fermer
                onClick={onFermer}
                disabled={verrouille}
                aria-label="Fermer"
                className="flex size-9 shrink-0 items-center justify-center border-2 border-transparent text-encre transition-colors hover:border-encre hover:bg-volt hover:text-nuit disabled:opacity-40"
              >
                <FontAwesomeIcon icon={icone.fermer} />
              </button>
            </header>
            <div className="px-5 py-5">{children}</div>
            {pied && <footer className="flex flex-wrap justify-end gap-3 border-t-2 border-trait px-5 py-4">{pied}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
