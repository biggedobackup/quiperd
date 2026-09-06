import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { pluriel } from '@/lib/format'
import { Button } from '../button/button'

export interface ProprietesPagination {
  page: number
  /** Nombre total de pages (enveloppe `Page<T>` de l'API) : affiche « Page 2 / 7 » et bloque « Suivant » à la dernière page. */
  pages?: number
  /** Nombre total d'éléments (enveloppe `Page<T>`) : affiché en légende. */
  total?: number
  /** Sans `pages` (pagination par décalage, pas de total) : vrai si la page courante est pleine. */
  suivantePossible?: boolean
  onChanger: (page: number) => void
  className?: string
}

/** Cibles tactiles ≥ 44 px en mobile, hauteur compacte du bouton `sm` à partir de `sm`. */
const CLASSE_BOUTON = 'min-h-11 sm:min-h-0'

/**
 * Pagination précédent / suivant. Deux modes : par décalage (`suivantePossible`, l'API n'expose pas
 * de total — historique du portefeuille) ou par enveloppe `Page<T>` (`pages` + `total`, listes admin).
 */
export function Pagination({ page, pages, total, suivantePossible = false, onChanger, className = '' }: ProprietesPagination) {
  const derniere = pages !== undefined ? Math.max(pages, 1) : undefined
  const suivante = derniere !== undefined ? page < derniere : suivantePossible

  // Page hors limites (dernier élément d'une page retiré par un filtre ou un changement de statut) :
  // retour à la dernière page existante plutôt qu'un tableau vide.
  useEffect(() => {
    if (derniere !== undefined && page > derniere) onChanger(derniere)
  }, [page, derniere, onChanger])

  return (
    <nav className={`flex flex-wrap items-center justify-between gap-3 ${className}`} aria-label="Pagination">
      <Button variante="secondaire" taille="sm" className={CLASSE_BOUTON} onClick={() => onChanger(page - 1)} disabled={page <= 1}>
        <FontAwesomeIcon icon={icone.chevronGauche} /> Précédent
      </Button>
      <span className="flex flex-col items-center gap-1">
        <span className="chiffres etiquette text-muet">
          Page {page}
          {derniere !== undefined && ` / ${derniere}`}
        </span>
        {total !== undefined && (
          <span className="chiffres text-[12px] text-muet">
            {total} {pluriel(total, 'élément')}
          </span>
        )}
      </span>
      <Button variante="secondaire" taille="sm" className={CLASSE_BOUTON} onClick={() => onChanger(page + 1)} disabled={!suivante}>
        Suivant <FontAwesomeIcon icon={icone.chevronDroite} />
      </Button>
    </nav>
  )
}
