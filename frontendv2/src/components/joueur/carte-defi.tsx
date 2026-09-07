import { Link } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone, iconePlateforme } from '@/lib/icones'
import { decrireCategorie } from '@/lib/catalogue'
import { formatDateRelative, formatMontant } from '@/lib/format'
import type { DefiListe } from '@/models/defi'
import { CompteAReboursDefi } from '@/components/partages/defis-en-direct/animation-defis'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'

export interface ProprietesCarteDefi {
  defi: DefiListe
  /** Le joueur courant est le créateur. */
  mien?: boolean
}

/** Ticket de défi : catégorie + jeu, plateforme, mise en gros chiffres mono, créateur, expiration. */
export function CarteDefi({ defi, mien = false }: ProprietesCarteDefi) {
  const categorie = decrireCategorie(defi.jeuCategorie)
  return (
    <Link
      to="/joueur/defis/$defiId"
      params={{ defiId: defi.id }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-trait bg-papier transition-shadow duration-150 hover:shadow-carte-forte focus-visible:shadow-carte-forte"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="etiquette flex items-center gap-2 text-muet">
          <FontAwesomeIcon icon={categorie.icone} className="text-vert" /> {categorie.libelle}
        </span>
        <BadgeStatut famille="defi" valeur={defi.statut} />
      </div>
      <div className="mx-4 border-t border-trait" />
      <div className="flex-1 px-4 py-4">
        <h3 className="text-h3">{defi.jeuNom}</h3>
        <span className="etiquette mt-3 block text-muet">Mise par joueur</span>
        <p className="chiffres mt-1 text-h1 font-bold leading-none">{formatMontant(defi.montantMise, defi.devise)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-legende text-muet">
          <span className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={iconePlateforme(defi.plateformeNom, defi.plateformeFamille)} /> {defi.plateformeNom}
          </span>
          <span className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={icone.profil} /> {mien ? 'Vous' : defi.createurNom}
          </span>
        </div>
        {defi.regles && <p className="mt-3 line-clamp-2 text-legende text-encre/80">{defi.regles}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-trait bg-gris px-4 py-3 text-legende transition-colors group-hover:bg-vert group-hover:text-craie">
        {/* Défi ouvert : le décompte s'égrène et retire la carte à zéro (le serveur confirme ensuite). */}
        {defi.statut === 'ouvert' && defi.dateExpiration ? (
          <CompteAReboursDefi defiId={defi.id} echeance={defi.dateExpiration} ton="herite" />
        ) : (
          <span className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={icone.horloge} aria-hidden="true" />
            Créé {formatDateRelative(defi.dateCreation)}
          </span>
        )}
        <span className="etiquette flex items-center gap-1">
          {mien ? 'Gérer' : 'Voir'} <FontAwesomeIcon icon={icone.suivant} />
        </span>
      </div>
    </Link>
  )
}
