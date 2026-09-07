import { Link } from '@tanstack/react-router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatDateRelative, formatMontant } from '@/lib/format'
import { numeroManche, type MatchEnrichi, type TypeEcheanceMatch } from '@/models/match'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { AvatarJoueur } from './avatar-joueur'
import { CompteARebours } from './compte-a-rebours'

export interface ProprietesCarteMatch {
  match: MatchEnrichi
  /** Identifiant du joueur courant (pour orienter « vous / adversaire »). */
  moiId: string
}

/**
 * Libellé du chrono sur la carte. Volontairement très court : la carte n'a que 343 px utiles
 * en mobile et le badge de statut occupe déjà une bonne part de la ligne. L'écran de match
 * donne la formulation complète.
 */
const LIBELLE_ECHEANCE: Record<TypeEcheanceMatch, string> = {
  confirmation: 'Réponse',
  preuve: 'Preuve',
  choix_nul: 'Choix',
}

/** Ligne de tableau d'affichage : noms, scores, statut ; le gagnant en volt. */
export function CarteMatch({ match, moiId }: ProprietesCarteMatch) {
  const jeSuisJ1 = match.joueur1Id === moiId
  const gagne = match.gagnantId ? match.gagnantId === moiId : null
  const g1 = match.gagnantId === match.joueur1Id
  const g2 = match.gagnantId === match.joueur2Id
  const manche = numeroManche(match)
  const type = match.echeanceType || undefined
  // Chrono vivant : décompté côté client depuis la date du serveur, jamais réinterrogé.
  const chrono = match.statut !== 'termine' && match.echeance ? match.echeance : undefined
  return (
    <Link
      to="/joueur/matchs/$matchId"
      params={{ matchId: match.id }}
      className="group grid h-full grid-cols-[1fr_auto] items-center gap-4 rounded-2xl bg-encre p-5 text-craie transition-shadow duration-150 hover:shadow-carte-forte sm:grid-cols-[1fr_auto_1fr_auto]"
    >
      <Joueur id={match.joueur1Id} nom={match.joueur1Nom} photo={match.joueur1Photo} moi={jeSuisJ1} score={match.scoreJoueur1} gagnant={g1} />
      <span className="chiffres hidden text-h3 text-craie/40 sm:block">—</span>
      <Joueur id={match.joueur2Id} nom={match.joueur2Nom} photo={match.joueur2Photo} moi={!jeSuisJ1} score={match.scoreJoueur2} gagnant={g2} droite />
      {/*
        Mobile : deux lignes qui s'enroulent (statut + mise + chrono, puis le libellé du jeu en
        pleine largeur). Sans `flex-wrap`, le chrono poussait la ligne à 421 px — un débordement
        masqué par `overflow-x: clip` mais qui élargit le viewport de mise en page du téléphone.
      */}
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-craie/15 pt-3 sm:col-span-1 sm:flex-col sm:flex-nowrap sm:items-end sm:border-0 sm:pt-0">
        <BadgeStatut famille="match" valeur={match.statut} />
        <span className="chiffres text-legende text-craie/70">{formatMontant(match.montantMise, match.devise)}</span>
        {/* Hauteur identique dans les trois cas : les cartes d'une même grille restent alignées. */}
        {chrono ? (
          <CompteARebours
            echeance={chrono}
            libelle={type ? LIBELLE_ECHEANCE[type] : undefined}
            ton={type === 'confirmation' ? 'volt' : 'alerte'}
          />
        ) : match.statut === 'termine' && gagne !== null ? (
          <span className={`etiquette flex h-8 items-center gap-1 ${gagne ? 'text-volt' : 'text-perte'}`}>
            <FontAwesomeIcon icon={gagne ? icone.trophee : icone.erreur} /> {gagne ? 'Gagné' : 'Perdu'}
          </span>
        ) : (
          <span className="etiquette flex h-8 items-center" aria-hidden="true">
            &nbsp;
          </span>
        )}
        <span className="w-full truncate text-[11px] text-craie/50 sm:w-auto sm:text-right">
          {match.jeuNom}
          {manche > 1 && ` · Manche ${manche}`} · {formatDateRelative(match.dateCreation)}
        </span>
      </div>
    </Link>
  )
}

function Joueur({
  id,
  nom,
  photo,
  moi,
  score,
  gagnant,
  droite = false,
}: {
  id: string
  nom: string
  photo?: string
  moi: boolean
  score?: number
  gagnant: boolean
  droite?: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 ${droite ? 'flex-row-reverse text-right' : ''}`}>
      <span className={`chiffres text-display-sm font-bold leading-none ${gagnant ? 'text-volt' : 'text-craie'}`}>{score ?? '–'}</span>
      {/* Le visage de l'adversaire vaut mieux qu'un pseudo seul : on voit à qui on joue. */}
      <AvatarJoueur utilisateurId={id} nom={nom} photo={photo} taille={30} className="border border-craie/20" />
      <div className="min-w-0">
        <p className={`truncate font-titre text-[12px] uppercase ${gagnant ? 'text-volt' : 'text-craie'}`}>{nom}</p>
        <p className="etiquette text-craie/50">{moi ? 'Vous' : 'Adversaire'}</p>
      </div>
    </div>
  )
}
