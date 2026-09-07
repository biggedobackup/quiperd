import { Link } from '@tanstack/react-router'

export interface ProprietesLogo {
  /** `clair` sur fond encre (sidebar), `encre` sur fond craie. */
  ton?: 'encre' | 'clair'
  /** Taille du NOM. Le dessin ne la suit pas : il a sa propre échelle (`echelleMarque`). */
  taille?: 'sm' | 'md' | 'lg'
  /**
   * `complet` (défaut) : dessin + « Défis en Ligne ». `marque` : le dessin seul, pour les
   * conteneurs trop étroits pour le nom (rail latéral de 76 px du layout joueur). Le nom reste
   * annoncé aux lecteurs d'écran.
   */
  variante?: 'complet' | 'marque'
  /**
   * Côté du dessin, en cadratins de la taille du nom. Réglable indépendamment pour pouvoir
   * grossir le logo sans grossir le texte : c'est ce que demande le header du site public.
   */
  /**
   * Côté du dessin en pixels — une taille absolue, indépendante de celle du nom, et
   * prioritaire sur `echelleMarque`. C'est un PLAFOND : sur un écran étroit le dessin
   * rétrécit avec la largeur disponible, sans quoi le nom se couperait en deux lignes.
   */
  marquePx?: number
  echelleMarque?: number
  lien?: boolean
  className?: string
}

const TAILLES = { sm: 'text-[15px]', md: 'text-[19px]', lg: 'text-[26px]' }

/**
 * Logotype : le « D » couronné à la manette, puis « Défis en » dans la couleur du texte et
 * « Ligne » en vert.
 *
 * L'image est le calque avant de l'icône d'application (`ic_launcher_foreground`), en PNG
 * transparent : le même dessin sur l'écran d'accueil du téléphone, dans l'application mobile
 * et ici, et il se pose aussi bien sur fond craie que sur fond encre. Ce calque réserve la
 * marge de sécurité des icônes adaptatives Android : le dessin n'occupe que les deux tiers de
 * son carré, d'où une échelle par défaut de 2.4 — sans quoi il paraîtrait rachitique à côté
 * du texte.
 */
export function Logo({
  ton = 'encre',
  taille = 'md',
  variante = 'complet',
  echelleMarque = 2.4,
  marquePx,
  lien = true,
  className = '',
}: ProprietesLogo) {
  // `clamp` plutôt qu'un palier : le dessin suit la largeur de l'écran et s'arrête au plafond
  // demandé, ce qui évite un saut de taille au point de rupture.
  const cote = marquePx ? `clamp(0px, 20vw, ${marquePx}px)` : `${echelleMarque}em`
  const contenu = (
    <span
      className={`inline-flex items-center gap-1.5 font-titre font-extrabold uppercase tracking-tight ${TAILLES[taille]} ${
        ton === 'clair' ? 'text-craie' : 'text-encre'
      } ${className}`}
    >
      {/* Taille en style plutôt qu'en classe : l'échelle est un nombre libre, que Tailwind ne
          peut pas connaître à la compilation. */}
      <img
        src="/icons/logo.png"
        alt=""
        aria-hidden="true"
        className="shrink-0"
        style={{ width: cote, height: cote }}
      />
      {variante === 'marque' ? (
        /* `sr-only` est en position absolue : hors du flux, il n'ouvre pas le `gap` — la boîte visible est le dessin seul. */
        <span className="sr-only">Défis en Ligne</span>
      ) : (
        <span className="whitespace-nowrap leading-none">
          Défis en <span className="text-vert">Ligne</span>
        </span>
      )}
    </span>
  )
  if (!lien) return contenu
  // `min-h-11` : la zone cliquable fait au moins 44 px de haut même quand le logotype dessiné
  // est plus petit. Le rendu ne bouge pas — le contenu reste centré — mais le doigt trouve la
  // cible du premier coup sur téléphone.
  return (
    <Link to="/" aria-label="Défis en Ligne — accueil" className="inline-flex min-h-11 items-center">
      {contenu}
    </Link>
  )
}
