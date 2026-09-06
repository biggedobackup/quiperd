import { Link } from '@tanstack/react-router'

export interface ProprietesLogo {
  /** `clair` sur fond encre (sidebar), `encre` sur fond craie. */
  ton?: 'encre' | 'clair'
  taille?: 'sm' | 'md' | 'lg'
  /**
   * `complet` (défaut) : carré + « QUI PERD ». `marque` : le carré seul, pour les conteneurs
   * trop étroits pour le nom (rail latéral de 76 px du layout joueur : 42 px utiles, alors que
   * le logotype `sm` complet mesure ≈ 124 px). Le nom reste annoncé aux lecteurs d'écran.
   */
  variante?: 'complet' | 'marque'
  lien?: boolean
  className?: string
}

const TAILLES = { sm: 'text-[15px]', md: 'text-[18px]', lg: 'text-[26px]' }

/**
 * Logotype : carré volt à coin coupé (le ticket) + « QUI PERD » en Unbounded.
 * Le « ? » du carré rappelle la question qui donne son nom à la plateforme.
 */
export function Logo({ ton = 'encre', taille = 'md', variante = 'complet', lien = true, className = '' }: ProprietesLogo) {
  const contenu = (
    <span className={`inline-flex items-center gap-2.5 font-titre font-bold uppercase tracking-tight ${TAILLES[taille]} ${ton === 'clair' ? 'text-craie' : 'text-encre'} ${className}`}>
      <span
        aria-hidden="true"
        className="ticket-sm flex size-[1.6em] items-center justify-center bg-volt text-nuit"
        style={{ fontSize: '1em' }}
      >
        <span className="text-[0.9em] leading-none">?</span>
      </span>
      {variante === 'marque' ? (
        /* `sr-only` est en position absolue : hors du flux, il n'ouvre pas le `gap` — la boîte visible est le carré seul. */
        <span className="sr-only">Qui perd</span>
      ) : (
        <span>
          Qui <span className={ton === 'clair' ? 'text-volt' : ''}>perd</span>
        </span>
      )}
    </span>
  )
  if (!lien) return contenu
  return (
    <Link to="/" aria-label="QUI PERD — accueil" className="inline-flex">
      {contenu}
    </Link>
  )
}
