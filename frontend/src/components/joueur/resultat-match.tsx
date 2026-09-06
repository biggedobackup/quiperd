import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import { formatDateHeure, formatMontant } from '@/lib/format'
import type { MatchEnrichi } from '@/models/match'
import { LienBouton } from '@/components/partages/button/button'

/** Détail d'un partage de mises, poussé par `match.partage` avant `match.termine`. */
export interface DetailPartage {
  /** Net rendu à CHAQUE joueur (déjà net de commission, calculé par le serveur). */
  rendu: string
  /** Total conservé par la plateforme sur les deux mises. */
  commission: string
}

/** Fin par échéance dépassée, poussée par `match.abandon`. */
export interface DetailAbandon {
  gagnantId: string
  motif: string
}

export interface ProprietesResultatMatch {
  match: MatchEnrichi
  moiId: string
  nomAdversaire: string
  /** Gain du gagnant, porté par `match.termine` (0 sur un partage). */
  gain?: string
  partage?: DetailPartage
  abandon?: DetailAbandon
}

/**
 * Panneau de fin de match. Il dit sans détour ce qui est arrivé à l'argent : versé, partagé
 * ou perdu — jamais « en attente de vérification », le règlement est immédiat depuis que deux
 * déclarations concordantes suffisent.
 *
 * Le ton reste mesuré côté perdant : aucun triomphalisme, aucune formule culpabilisante.
 */
export function ResultatMatch({ match, moiId, nomAdversaire, gain, partage, abandon }: ProprietesResultatMatch) {
  const contenu = decrire({ match, moiId, nomAdversaire, gain, partage, abandon })

  return (
    <section className={`ticket border-2 px-4 py-5 sm:px-6 ${contenu.cadre}`} aria-labelledby="titre-resultat">
      <div className="flex items-start gap-4">
        <span
          className={`flex size-11 shrink-0 items-center justify-center border-2 ${contenu.pastille}`}
          aria-hidden="true"
        >
          <FontAwesomeIcon icon={contenu.icone} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="etiquette text-muet">Match réglé</span>
          <h3 id="titre-resultat" className="mt-1 text-h2">
            {contenu.titre}
          </h3>
          <p className="mt-2 text-legende">{contenu.message}</p>

          {contenu.montants.length > 0 && (
            <dl className="mt-4 grid gap-px border-2 border-encre bg-encre sm:grid-cols-2">
              {contenu.montants.map((m) => (
                <div key={m.libelle} className="bg-papier px-4 py-3">
                  <dt className="etiquette text-muet">{m.libelle}</dt>
                  <dd className={`chiffres mt-1 text-h3 font-bold ${m.ton}`}>{m.valeur}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <LienBouton to="/joueur/portefeuille" variante="secondaire" iconeDebut={icone.portefeuille}>
              Voir mon portefeuille
            </LienBouton>
            <LienBouton to="/joueur/defis" variante="fantome" iconeDebut={icone.defi}>
              Relancer un défi
            </LienBouton>
          </div>

          {match.dateFin && (
            <p className="mt-3 text-[12px] text-muet">Réglé le {formatDateHeure(match.dateFin)}.</p>
          )}
        </div>
      </div>
    </section>
  )
}

interface Contenu {
  titre: string
  message: string
  icone: IconDefinition
  cadre: string
  pastille: string
  montants: Array<{ libelle: string; valeur: string; ton: string }>
}

function decrire({ match, moiId, nomAdversaire, gain, partage, abandon }: ProprietesResultatMatch): Contenu {
  const mise = formatMontant(match.montantMise, match.devise)

  // Partage : aucun gagnant. Le net rendu vient de l'événement `match.partage` ; sans lui
  // (page ouverte après coup), on décrit la règle sans inventer de montant.
  if (!match.gagnantId) {
    return {
      titre: 'Match nul — mises partagées',
      message: partage
        ? 'Chacun a récupéré sa mise moins la commission de la plateforme. La somme est déjà créditée sur votre solde disponible.'
        : 'Le match s’est soldé par un partage : chacun a récupéré sa mise moins la commission de la plateforme. La somme est déjà créditée sur votre solde disponible.',
      icone: icone.poigneeDeMain,
      cadre: 'border-encre bg-papier',
      pastille: 'border-encre bg-gris text-encre',
      montants: partage
        ? [
            { libelle: 'Rendu à chacun', valeur: formatMontant(partage.rendu, match.devise), ton: 'text-gain' },
            {
              libelle: 'Commission de la plateforme',
              valeur: formatMontant(partage.commission, match.devise),
              ton: 'text-muet',
            },
          ]
        : [{ libelle: 'Votre mise', valeur: mise, ton: 'text-encre' }],
    }
  }

  const jaiGagne = match.gagnantId === moiId
  const parAbandon = abandon !== undefined

  if (jaiGagne) {
    return {
      titre: parAbandon ? 'Victoire — délai écoulé' : 'Vous avez gagné',
      message: abandon
        ? `${nomAdversaire} n’a ni confirmé ni contredit le score dans le délai imparti : votre déclaration fait foi. Votre gain est déjà crédité sur votre solde disponible.`
        : 'Le score est validé par les deux joueurs. Votre gain est déjà crédité sur votre solde disponible — rien d’autre à faire.',
      icone: icone.trophee,
      cadre: 'border-gain bg-gain-fond',
      pastille: 'border-gain bg-gain text-papier',
      montants: gain
        ? [
            { libelle: 'Crédité sur votre solde', valeur: formatMontant(gain, match.devise), ton: 'text-gain' },
            { libelle: 'Votre mise engagée', valeur: mise, ton: 'text-encre' },
          ]
        : [{ libelle: 'Votre mise engagée', valeur: mise, ton: 'text-encre' }],
    }
  }

  return {
    titre: parAbandon ? 'Match perdu — délai écoulé' : 'Match perdu',
    message: abandon
      ? 'Le délai de confirmation s’est écoulé sans réponse : le score déclaré par votre adversaire fait foi et le match a été réglé en sa faveur. Votre mise a été débitée.'
      : 'Le score est validé par les deux joueurs. Votre mise a été débitée ; le règlement est définitif.',
    icone: icone.point,
    cadre: 'border-trait bg-papier',
    pastille: 'border-trait bg-gris text-muet',
    montants: [{ libelle: 'Mise engagée', valeur: mise, ton: 'text-perte' }],
  }
}
