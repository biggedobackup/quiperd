import { Link } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone, iconePlateforme } from '@/lib/icones'
import { decrireCategorie } from '@/lib/catalogue'
import { formatDateRelative, formatMontant } from '@/lib/format'
import type { DefiListe } from '@/models/defi'
import { Badge } from '@/components/partages/badge/badge'

/**
 * Ticket d'un défi ouvert sur le site public : catégorie, jeu, plateforme, mise en gros chiffres,
 * créateur, expiration. Connecté → détail du défi ; invité → connexion puis retour sur le défi.
 */
export function CarteDefiPublique({ defi, connecte }: { defi: DefiListe; connecte: boolean }) {
  const categorie = decrireCategorie(defi.jeuCategorie)
  const classesPied = 'etiquette flex items-center justify-between gap-2 px-4 py-3 transition-colors'
  return (
    <article className="ticket flex h-full flex-col border-2 border-encre bg-papier transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-tampon">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="etiquette flex items-center gap-2 text-muet">
          <FontAwesomeIcon icon={categorie.icone} className="text-encre" /> {categorie.libelle}
        </span>
        <Badge variante="volt" actif>
          Ouvert
        </Badge>
      </div>
      <div className="perforation mx-4 h-0.5" />
      <div className="flex-1 px-4 py-4">
        <h3 className="text-h3">{defi.jeuNom}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-legende text-muet">
          <FontAwesomeIcon icon={iconePlateforme(defi.plateformeNom, defi.plateformeFamille)} /> {defi.plateformeNom}
        </p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <span className="etiquette text-muet">Mise par joueur</span>
            <p className="chiffres mt-1 text-h1 font-bold leading-none">{formatMontant(defi.montantMise, defi.devise)}</p>
          </div>
          <div className="text-right text-legende text-muet">
            <span className="flex items-center justify-end gap-1.5">
              <FontAwesomeIcon icon={icone.profil} /> {defi.createurNom}
            </span>
            {defi.dateExpiration && (
              <span className="mt-1 flex items-center justify-end gap-1.5">
                <FontAwesomeIcon icon={icone.horloge} /> expire {formatDateRelative(defi.dateExpiration)}
              </span>
            )}
          </div>
        </div>
        {defi.regles && <p className="mt-3 line-clamp-2 text-legende text-encre/80">{defi.regles}</p>}
      </div>
      <div className="border-t-2 border-encre">
        {connecte ? (
          <Link to="/joueur/defis/$defiId" params={{ defiId: defi.id }} className={`${classesPied} bg-volt text-nuit hover:bg-encre hover:text-craie`}>
            Voir et rejoindre <FontAwesomeIcon icon={icone.suivant} />
          </Link>
        ) : (
          <Link to="/connexion" search={{ vers: `/joueur/defis/${defi.id}` }} className={`${classesPied} bg-gris text-encre hover:bg-volt hover:text-nuit`}>
            Se connecter pour rejoindre <FontAwesomeIcon icon={icone.suivant} />
          </Link>
        )}
      </div>
    </article>
  )
}
