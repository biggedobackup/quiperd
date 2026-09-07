import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useRouterState, type LinkProps } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import { Logo } from '@/components/partages/logo/logo'
import { LienBouton, classesBouton, type VarianteBouton } from '@/components/partages/button/button'

const LIENS = [
  { to: '/', libelle: 'Accueil' },
  { to: '/defis', libelle: 'Défis' },
  { to: '/jeux', libelle: 'Jeux' },
  { to: '/comment-ca-marche', libelle: 'Comment ça marche' },
  { to: '/aide', libelle: 'Aide' },
] as const

/** Gabarit de la barre du haut, partagé par le header et le menu mobile : la barre semble ne jamais bouger. */
const CLASSES_BARRE = 'mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6'
const CLASSES_BOUTON_MENU =
  'flex size-11 items-center justify-center rounded-[10px] border border-trait bg-papier text-encre transition-colors hover:border-vert hover:text-vert'
/** Point de rupture `lg` de Tailwind v4 : au-delà, le menu mobile n'existe plus. */
const MEDIA_BUREAU = '(min-width: 64rem)'
const FOCUSABLES = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Bouton-lien pleine largeur du menu mobile (même habillage que `LienBouton`, via `classesBouton`).
 * `LienBouton` n'expose pas `onClick` ; or un lien vers la page déjà affichée ne change pas la route
 * et ne fermerait donc jamais le menu : ici, chaque lien ferme le menu lui-même.
 */
function LienMenu({
  to,
  variante,
  iconeDebut,
  iconeFin,
  onClick,
  children,
}: {
  to: LinkProps['to']
  variante: VarianteBouton
  iconeDebut?: IconDefinition
  iconeFin?: IconDefinition
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Link to={to} onClick={onClick} className={classesBouton(variante, 'lg', true)}>
      {iconeDebut && <FontAwesomeIcon icon={iconeDebut} />}
      {children}
      {iconeFin && <FontAwesomeIcon icon={iconeFin} />}
    </Link>
  )
}

/**
 * Header du site public. Sur mobile, le menu est un overlay `fixed inset-0` rendu dans `document.body`
 * (comme la modale) qui contient SA PROPRE barre logo + « X » : quel que soit le défilement, la barre
 * reste visible et le menu peut toujours être fermé. Ne jamais poser `transform`/`filter`/
 * `backdrop-filter` sur le header : il deviendrait le bloc conteneur d'un élément `fixed`.
 */
export function Header({ connecte }: { connecte: boolean }) {
  const [ouvert, setOuvert] = useState(false)
  const chemin = useRouterState({ select: (s) => s.location.pathname })
  const reduit = useReducedMotion()
  const boutonOuvrir = useRef<HTMLButtonElement>(null)
  const boutonFermer = useRef<HTMLButtonElement>(null)
  const panneau = useRef<HTMLDivElement>(null)
  const zone = useRef<HTMLDivElement>(null)

  /** Fermeture explicite (bouton X, Échap) : le focus revient sur le bouton qui a ouvert le menu. */
  const fermer = useCallback(() => {
    setOuvert(false)
    boutonOuvrir.current?.focus({ preventScroll: true })
  }, [])
  /** Fermeture par un lien du menu : la navigation prend la main sur le focus et le défilement. */
  const fermerParLien = () => setOuvert(false)

  // Changement de route : le menu se ferme (les liens ferment aussi d'eux-mêmes, cas de la page déjà active).
  useEffect(() => {
    setOuvert(false)
  }, [chemin])

  useEffect(() => {
    if (!ouvert) return
    const html = document.documentElement
    const body = document.body
    // `html` porte `overflow-x: clip` (app.css) : un `overflow: hidden` posé sur `body` seul ne se
    // propage plus à la fenêtre et la page continuait de défiler derrière le menu. On verrouille les deux.
    const precedent = { html: html.style.overflow, body: body.style.overflow }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'

    boutonFermer.current?.focus({ preventScroll: true })

    // iOS Safari ignore `overflow: hidden` au toucher : on annule tout glissement à un doigt qui ne
    // fait pas défiler la zone du menu (hors zone, ou zone sans débordement). Le pincement reste libre.
    const onToucher = (e: TouchEvent) => {
      const cible = e.target
      const z = zone.current
      const defileLaZone = z !== null && cible instanceof Node && z.contains(cible) && z.scrollHeight > z.clientHeight
      if (!defileLaZone && e.cancelable && e.touches.length === 1) e.preventDefault()
    }

    const onTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        fermer()
        return
      }
      if (e.key !== 'Tab' || !panneau.current) return
      const focusables = Array.from(panneau.current.querySelectorAll<HTMLElement>(FOCUSABLES))
      const premier = focusables[0]
      const dernier = focusables[focusables.length - 1]
      if (!premier || !dernier) return
      const actif = document.activeElement
      if (!panneau.current.contains(actif)) {
        e.preventDefault()
        premier.focus()
      } else if (e.shiftKey && actif === premier) {
        e.preventDefault()
        dernier.focus()
      } else if (!e.shiftKey && actif === dernier) {
        e.preventDefault()
        premier.focus()
      }
    }

    // Fenêtre élargie jusqu'au bureau (rotation, redimensionnement) : le menu mobile n'a plus de sens.
    const media = window.matchMedia(MEDIA_BUREAU)
    const onMedia = (e: MediaQueryListEvent) => {
      if (e.matches) setOuvert(false)
    }

    document.addEventListener('keydown', onTouche)
    document.addEventListener('touchmove', onToucher, { passive: false })
    media.addEventListener('change', onMedia)
    return () => {
      document.removeEventListener('keydown', onTouche)
      document.removeEventListener('touchmove', onToucher)
      media.removeEventListener('change', onMedia)
      html.style.overflow = precedent.html
      body.style.overflow = precedent.body
    }
  }, [ouvert, fermer])

  const menuMobile = (
    <AnimatePresence>
      {ouvert && (
        <motion.div
          ref={panneau}
          id="menu-mobile"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col bg-craie text-encre lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduit ? 0 : 0.15 }}
        >
          {/* Barre du menu : même gabarit que celle du header, mais membre de l'overlay fixe. */}
          <div className="shrink-0 border-b border-trait bg-craie">
            <div className={CLASSES_BARRE}>
              <Link to="/" aria-label="Défis en Ligne — accueil" className="inline-flex" onClick={fermerParLien}>
                <Logo lien={false} marquePx={60} />
              </Link>
              <button
                ref={boutonFermer}
                type="button"
                onClick={fermer}
                aria-label="Fermer le menu"
                className={CLASSES_BOUTON_MENU}
              >
                <FontAwesomeIcon icon={icone.fermer} />
              </button>
            </div>
          </div>

          {/* Contenu : défile à l'intérieur si l'écran est bas ; `overscroll-contain` retient le défilement. */}
          <motion.div
            ref={zone}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduit ? 0 : 0.2, ease: 'easeOut' }}
          >
            <nav className="flex flex-col divide-y divide-trait border-y border-trait" aria-label="Navigation mobile">
              {LIENS.map((l, i) => (
                <motion.div
                  key={l.to}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reduit ? 0 : 0.22, delay: reduit ? 0 : 0.03 * i, ease: 'easeOut' }}
                >
                  <Link
                    to={l.to}
                    activeOptions={{ exact: l.to === '/' }}
                    onClick={fermerParLien}
                    className="flex items-center justify-between px-6 py-5 font-titre text-h3 uppercase"
                    activeProps={{ className: 'bg-vert-pale text-vert' }}
                    inactiveProps={{ className: 'text-encre' }}
                  >
                    <span>{l.libelle}</span>
                    <FontAwesomeIcon icon={icone.suivant} className="text-[13px] opacity-40" />
                  </Link>
                </motion.div>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-3 p-6">
              {connecte ? (
                <LienMenu to="/joueur/tableau-de-bord" variante="volt" iconeDebut={icone.defi} onClick={fermerParLien}>
                  Mon espace
                </LienMenu>
              ) : (
                <>
                  <LienMenu to="/inscription" variante="volt" iconeFin={icone.suivant} onClick={fermerParLien}>
                    Créer un compte
                  </LienMenu>
                  <LienMenu to="/connexion" variante="secondaire" onClick={fermerParLien}>
                    Connexion
                  </LienMenu>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-trait bg-craie shadow-barre">
      <div className={CLASSES_BARRE}>
        <Logo marquePx={60} />
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navigation principale">
          {LIENS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === '/' }}
              className="etiquette relative py-6 transition-colors"
              activeProps={{
                className: 'text-vert after:absolute after:inset-x-0 after:bottom-4 after:h-0.5 after:bg-vert after:content-[""]',
              }}
              inactiveProps={{ className: 'text-muet hover:text-encre' }}
            >
              {l.libelle}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2.5 lg:flex">
          {connecte ? (
            <LienBouton to="/joueur/tableau-de-bord" variante="volt" taille="md" iconeDebut={icone.defi}>
              Mon espace
            </LienBouton>
          ) : (
            <>
              <LienBouton to="/connexion" variante="secondaire" taille="md">
                Connexion
              </LienBouton>
              <LienBouton to="/inscription" variante="volt" taille="md" iconeFin={icone.suivant}>
                Créer un compte
              </LienBouton>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <button
            ref={boutonOuvrir}
            type="button"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
            aria-controls="menu-mobile"
            aria-label={ouvert ? 'Fermer le menu' : 'Ouvrir le menu'}
            className={CLASSES_BOUTON_MENU}
          >
            <FontAwesomeIcon icon={ouvert ? icone.fermer : icone.menu} />
          </button>
        </div>
      </div>

      {/* Rendu dans `document.body` : aucun ancêtre (header sticky, layout animé) ne peut capturer le `fixed`. */}
      {typeof document !== 'undefined' && createPortal(menuMobile, document.body)}
    </header>
  )
}
