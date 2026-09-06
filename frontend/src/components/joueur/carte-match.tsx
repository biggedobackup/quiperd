import { Link } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatDateRelative, formatMontant } from '@/lib/format'
import type { MatchEnrichi } from '@/models/match'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'

export interface ProprietesCarteMatch {
  match: MatchEnrichi
  /** Identifiant du joueur courant (pour orienter « vous / adversaire »). */
  moiId: string
}

/** Ligne de tableau d'affichage : noms, scores, statut ; le gagnant en volt. */
export function CarteMatch({ match, moiId }: ProprietesCarteMatch) {
  const jeSuisJ1 = match.joueur1Id === moiId
  const gagne = match.gagnantId ? match.gagnantId === moiId : null
  const g1 = match.gagnantId === match.joueur1Id
  const g2 = match.gagnantId === match.joueur2Id
  return (
    <Link
      to="/joueur/matchs/$matchId"
      params={{ matchId: match.id }}
      className="ticket-sm group grid h-full grid-cols-[1fr_auto] items-center gap-4 border-2 border-encre bg-nuit p-4 text-craie transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-tampon-volt sm:grid-cols-[1fr_auto_1fr_auto]"
    >
      <Joueur nom={match.joueur1Nom} moi={jeSuisJ1} score={match.scoreJoueur1} gagnant={g1} />
      <span className="chiffres hidden text-h3 text-craie/40 sm:block">—</span>
      <Joueur nom={match.joueur2Nom} moi={!jeSuisJ1} score={match.scoreJoueur2} gagnant={g2} droite />
      <div className="col-span-2 flex items-center justify-between gap-3 border-t border-craie/15 pt-3 sm:col-span-1 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
        <BadgeStatut famille="match" valeur={match.statut} />
        <span className="chiffres text-legende text-craie/70">{formatMontant(match.montantMise, match.devise)}</span>
        <span className="text-[11px] text-craie/50">{match.jeuNom} · {formatDateRelative(match.dateCreation)}</span>
        {match.statut === 'termine' && gagne !== null ? (
          <span className={`etiquette flex min-h-[18px] items-center gap-1 ${gagne ? 'text-volt' : 'text-perte'}`}>
            <FontAwesomeIcon icon={gagne ? icone.trophee : icone.erreur} /> {gagne ? 'Gagné' : 'Perdu'}
          </span>
        ) : (
          <span className="etiquette flex min-h-[18px] items-center" aria-hidden="true">
             
          </span>
        )}
      </div>
    </Link>
  )
}

function Joueur({ nom, moi, score, gagnant, droite = false }: { nom: string; moi: boolean; score?: number; gagnant: boolean; droite?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${droite ? 'flex-row-reverse text-right' : ''}`}>
      <span className={`chiffres text-display-sm font-bold leading-none ${gagnant ? 'text-volt' : 'text-craie'}`}>{score ?? '–'}</span>
      <div className="min-w-0">
        <p className={`truncate font-titre text-[12px] uppercase ${gagnant ? 'text-volt' : 'text-craie'}`}>{nom}</p>
        <p className="etiquette text-craie/50">{moi ? 'Vous' : 'Adversaire'}</p>
      </div>
    </div>
  )
}
