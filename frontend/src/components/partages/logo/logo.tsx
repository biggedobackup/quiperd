import { Link } from '@tanstack/react-router'

export interface ProprietesLogo {
  /** `clair` sur fond encre (sidebar), `encre` sur fond craie. */
  ton?: 'encre' | 'clair'
  taille?: 'sm' | 'md' | 'lg'
  /**
   * `complet` (défaut) : dessin + « Défis en Ligne ». `marque` : le dessin seul, pour les
   * conteneurs trop étroits pour le nom (rail latéral de 76 px du layout joueur). Le nom reste
   * annoncé aux lecteurs d'écran.
   */
  variante?: 'complet' | 'marque'
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
 * marge de sécurité des icônes adaptatives Android — d’où le `2.4em`, qui compense ce vide
 * pour que le logo pèse visuellement autant que le texte à côté.
 */
export function Logo({ ton = 'encre', taille = 'md', variante = 'complet', lien = true, className = '' }: ProprietesLogo) {
  const contenu = (
    <span
      className={`inline-flex items-center gap-1.5 font-titre font-extrabold uppercase tracking-tight ${TAILLES[taille]} ${
        ton === 'clair' ? 'text-craie' : 'text-encre'
      } ${className}`}
    >
      <img src="/icons/logo.png" alt="" aria-hidden="true" className="size-[2.4em] shrink-0" />
      {variante === 'marque' ? (
        /* `sr-only` est en position absolue : hors du flux, il n'ouvre pas le `gap` — la boîte visible est le dessin seul. */
        <span className="sr-only">Défis en Ligne</span>
      ) : (
        <span className="leading-none">
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
