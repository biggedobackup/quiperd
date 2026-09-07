import { Link } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone, iconePlateforme } from '@/lib/icones'
import { decrireCategorie } from '@/lib/catalogue'
import { formatMontant } from '@/lib/format'
import type { DefiListe } from '@/models/defi'
import { CompteAReboursDefi } from '@/components/partages/defis-en-direct/animation-defis'

/**
 * Ticket d'un défi ouvert sur le site public : catégorie, jeu, plateforme, mise en gros chiffres,
 * créateur, expiration. Connecté → détail du défi ; invité → connexion puis retour sur le défi.
 */
export function CarteDefiPublique({ defi, connecte }: { defi: DefiListe; connecte: boolean }) {
  const categorie = decrireCategorie(defi.jeuCategorie)
  // `min-h-11` : c'est l'action principale de la carte, elle doit se toucher au doigt.
  const classesPied = 'etiquette flex min-h-11 items-center justify-between gap-2 px-4 py-3.5 transition-colors'
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-trait bg-papier transition-shadow duration-150 hover:shadow-carte-forte">
      <div className="flex items-center justify-between gap-3 border-b border-trait px-4 py-3">
        <span className="etiquette flex items-center gap-2 text-muet">
          <FontAwesomeIcon icon={categorie.icone} className="text-vert" /> {categorie.libelle}
        </span>
        <span className="etiquette rounded-full bg-vert-pale px-2.5 py-1.5 text-vert">Ouvert</span>
      </div>
      <div className="flex-1 px-4 py-4">
        <h3 className="text-h3">{defi.jeuNom}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-legende text-muet">
          <FontAwesomeIcon icon={iconePlateforme(defi.plateformeNom, defi.plateformeFamille)} /> {defi.plateformeNom}
        </p>
        {/* Écran étroit : le créateur passe sous la mise plutôt que de la comprimer. */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <div>
            <span className="etiquette text-muet">Mise par joueur</span>
            <p className="chiffres mt-1 text-h1 font-bold leading-none text-vert">
              {formatMontant(defi.montantMise, defi.devise)}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-legende text-muet">
            <FontAwesomeIcon icon={icone.profil} /> {defi.createurNom}
          </span>
        </div>
        {/* Décompte vivant : à zéro la carte quitte la liste sans attendre le serveur. */}
        <CompteAReboursDefi defiId={defi.id} echeance={defi.dateExpiration} className="mt-2 text-legende" />
        {defi.regles && <p className="mt-3 line-clamp-2 text-legende text-encre/80">{defi.regles}</p>}
      </div>
      <div className="border-t border-trait">
        {connecte ? (
          <Link to="/joueur/defis/$defiId" params={{ defiId: defi.id }} className={`${classesPied} bg-vert text-craie hover:bg-vert-sombre`}>
            Voir et rejoindre <FontAwesomeIcon icon={icone.suivant} />
          </Link>
        ) : (
          <Link to="/connexion" search={{ vers: `/joueur/defis/${defi.id}` }} className={`${classesPied} bg-gris text-encre hover:bg-vert hover:text-craie`}>
            Se connecter pour rejoindre <FontAwesomeIcon icon={icone.suivant} />
          </Link>
        )}
      </div>
    </article>
  )
}
