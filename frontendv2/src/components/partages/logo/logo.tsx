import { Link } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'

export interface ProprietesLogo {
  /** `clair` sur fond encre (sidebar), `encre` sur fond craie. */
  ton?: 'encre' | 'clair'
  taille?: 'sm' | 'md' | 'lg'
  /**
   * `complet` (défaut) : pastille + « QUI PERD ». `marque` : la pastille seule, pour les
   * conteneurs trop étroits pour le nom (rail latéral de 76 px du layout joueur). Le nom reste
   * annoncé aux lecteurs d'écran.
   */
  variante?: 'complet' | 'marque'
  lien?: boolean
  className?: string
}

const TAILLES = { sm: 'text-[15px]', md: 'text-[19px]', lg: 'text-[26px]' }

/**
 * Logotype de la refonte : pastille verte arrondie portant une manette blanche, puis
 * « QUI » en noir et « PERD » en vert. Sur fond sombre, « QUI » passe en blanc.
 */
export function Logo({ ton = 'encre', taille = 'md', variante = 'complet', lien = true, className = '' }: ProprietesLogo) {
  const contenu = (
    <span
      className={`inline-flex items-center gap-2.5 font-titre font-extrabold uppercase tracking-tight ${TAILLES[taille]} ${
        ton === 'clair' ? 'text-craie' : 'text-encre'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className="flex size-[1.75em] items-center justify-center rounded-[0.45em] bg-vert text-craie"
        style={{ fontSize: '1em' }}
      >
        <FontAwesomeIcon icon={icone.jeu} className="text-[0.78em]" />
      </span>
      {variante === 'marque' ? (
        /* `sr-only` est en position absolue : hors du flux, il n'ouvre pas le `gap` — la boîte visible est la pastille seule. */
        <span className="sr-only">Qui perd</span>
      ) : (
        <span className="leading-none">
          Qui <span className="text-vert">perd</span>
        </span>
      )}
    </span>
  )
  if (!lien) return contenu
  // `min-h-11` : la zone cliquable fait au moins 44 px de haut même quand le logotype dessiné
  // est plus petit. Le rendu ne bouge pas — le contenu reste centré — mais le doigt trouve la
  // cible du premier coup sur téléphone.
  return (
    <Link to="/" aria-label="QUI PERD — accueil" className="inline-flex min-h-11 items-center">
      {contenu}
    </Link>
  )
}
