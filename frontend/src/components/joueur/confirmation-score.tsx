import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { Button } from '@/components/partages/button/button'
import { CompteARebours } from './compte-a-rebours'

export interface ProprietesConfirmationScore {
  nomMoi: string
  nomAdversaire: string
  /** Score annoncé pour MOI par l'adversaire (déjà retourné de son point de vue au mien). */
  scoreMoi: number
  scoreAdversaire: number
  /** Échéance de confirmation posée par le serveur (ISO). */
  echeance?: string | null
  onConfirmer: () => void
  onProposer: () => void
  chargement?: boolean
  /** Une seule invalidation quand le délai tombe (le serveur tranche de son côté). */
  surFinChrono?: () => void
}

/**
 * Bloc de confirmation rapide : l'adversaire a déclaré, je confirme d'un geste ou je propose
 * un autre score. Confirmer suffit à tout régler — aucune preuve, aucun arbitre.
 *
 * Mobile d'abord : les deux actions sont en bas du bloc, pleine largeur, 56 px de haut
 * (atteignables au pouce), et le score reste lisible sans zoom sur 375 px.
 */
export function ConfirmationScore({
  nomMoi,
  nomAdversaire,
  scoreMoi,
  scoreAdversaire,
  echeance,
  onConfirmer,
  onProposer,
  chargement = false,
  surFinChrono,
}: ProprietesConfirmationScore) {
  return (
    <section
      aria-labelledby="titre-confirmation"
      className="overflow-hidden rounded-2xl border border-trait bg-papier shadow-carte-forte"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 bg-vert px-4 py-2.5 text-craie">
        <span className="etiquette flex items-center gap-2">
          <FontAwesomeIcon icon={icone.attention} aria-hidden="true" />
          Score à confirmer
        </span>
        <CompteARebours echeance={echeance} libelle="Il reste" ton="neutre" surFin={surFinChrono} />
      </div>

      <div className="px-4 py-5 sm:px-6">
        <h3 id="titre-confirmation" className="text-h3">
          <span className="font-bold">{nomAdversaire}</span> déclare ce score
        </h3>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3 rounded-2xl bg-encre px-4 py-4 text-craie">
          <ColonneScore nom={`${nomMoi} (vous)`} score={scoreMoi} alignement="left" />
          <span className="chiffres pt-1 text-h2 text-craie/40" aria-hidden="true">
            —
          </span>
          <ColonneScore nom={nomAdversaire} score={scoreAdversaire} alignement="right" />
        </div>

        <p className="mt-4 text-legende">
          Si c’est bien le résultat, confirmez : le match est <strong>réglé immédiatement</strong>, l’argent est versé,
          sans preuve ni arbitre. Si ce n’est pas le bon score, proposez le vôtre — une divergence fera basculer le
          match en preuve exigée.
        </p>

        {/* Actions en bas de bloc, pleine largeur en mobile : atteignables au pouce. */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
          <Button
            variante="volt"
            taille="lg"
            bloc
            className="sm:flex-1"
            onClick={onConfirmer}
            chargement={chargement}
            iconeDebut={icone.valider}
          >
            Confirmer {scoreMoi} — {scoreAdversaire}
          </Button>
          <Button
            variante="secondaire"
            taille="lg"
            bloc
            className="sm:flex-1"
            onClick={onProposer}
            disabled={chargement}
            iconeDebut={icone.modifier}
          >
            Proposer un autre score
          </Button>
        </div>

        <p className="mt-3 flex items-start gap-2 text-[12px] text-muet">
          <FontAwesomeIcon icon={icone.info} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Sans réponse de votre part avant la fin du compte à rebours, le score déclaré fera foi.</span>
        </p>
      </div>
    </section>
  )
}

function ColonneScore({ nom, score, alignement }: { nom: string; score: number; alignement: 'left' | 'right' }) {
  return (
    <div className={`min-w-0 ${alignement === 'right' ? 'text-right' : 'text-left'}`}>
      <p className="chiffres text-display-sm font-bold leading-none">{score}</p>
      <p className="mt-2 truncate font-titre text-[11px] uppercase text-craie/70">{nom}</p>
    </div>
  )
}
