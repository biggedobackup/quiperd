import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { Button } from '@/components/partages/button/button'
import { CompteARebours } from './compte-a-rebours'

export interface ProprietesConfirmationResultat {
  nomMoi: string
  nomAdversaire: string
  /**
   * Issue annoncée pour MOI par l'adversaire, déjà retournée de son point de vue au mien.
   * Le serveur range l'issue en 1-0 / 0-1 / 0-0 : ces nombres sont une convention interne
   * du moteur de règlement, jamais montrés — on en déduit une victoire, une défaite ou un nul.
   */
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
 * Bloc de confirmation rapide : l'adversaire a déclaré, je confirme d'un geste ou j'annonce
 * l'inverse. Confirmer suffit à tout régler — aucune preuve, aucun arbitre.
 *
 * Mobile d'abord : les deux actions sont en bas du bloc, pleine largeur, 56 px de haut
 * (atteignables au pouce), et le nom du vainqueur reste lisible sans zoom sur 375 px.
 */
export function ConfirmationResultat({
  nomMoi,
  nomAdversaire,
  scoreMoi,
  scoreAdversaire,
  echeance,
  onConfirmer,
  onProposer,
  chargement = false,
  surFinChrono,
}: ProprietesConfirmationResultat) {
  const jeGagne = scoreMoi > scoreAdversaire
  const nul = scoreMoi === scoreAdversaire
  const issue = nul ? 'un match nul' : jeGagne ? 'votre victoire' : 'sa victoire'
  return (
    <section
      aria-labelledby="titre-confirmation"
      className="overflow-hidden rounded-2xl border border-trait bg-papier shadow-carte-forte"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 bg-vert px-4 py-2.5 text-craie">
        <span className="etiquette flex items-center gap-2">
          <FontAwesomeIcon icon={icone.attention} aria-hidden="true" />
          Résultat à confirmer
        </span>
        <CompteARebours echeance={echeance} libelle="Il reste" ton="neutre" surFin={surFinChrono} />
      </div>

      <div className="px-4 py-5 sm:px-6">
        <h3 id="titre-confirmation" className="text-h3">
          <span className="font-bold">{nomAdversaire}</span> déclare {issue}
        </h3>

        <div className="mt-4 rounded-2xl bg-encre px-4 py-5 text-center text-craie">
          <p className="etiquette text-craie/60">{nul ? 'Résultat déclaré' : 'Vainqueur déclaré'}</p>
          <p className="mt-2 font-titre text-h2 uppercase text-volt">
            {nul ? 'Match nul' : jeGagne ? `${nomMoi} (vous)` : nomAdversaire}
          </p>
        </div>

        <p className="mt-4 text-legende">
          Si c’est bien l’issue de la partie, confirmez : le match est <strong>réglé immédiatement</strong>, l’argent est
          versé, sans preuve ni arbitre. Sinon, annoncez l’inverse — une divergence fera basculer le match en preuve
          exigée.
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
            {nul ? 'Confirmer le match nul' : jeGagne ? 'Confirmer : j’ai gagné' : 'Confirmer : j’ai perdu'}
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
            Déclarer un autre résultat
          </Button>
        </div>

        <p className="mt-3 flex items-start gap-2 text-[12px] text-muet">
          <FontAwesomeIcon icon={icone.info} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Sans réponse de votre part avant la fin du compte à rebours, le résultat déclaré fera foi.</span>
        </p>
      </div>
    </section>
  )
}
