import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import type { ChoixNulValeur } from '@/models/match'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { CompteARebours } from '../compte-a-rebours'

export interface ProprietesChoixNulModal {
  ouvert: boolean
  onFermer: () => void
  onChoisir: (choix: ChoixNulValeur) => Promise<void> | void
  chargement?: boolean
  /** Échéance du choix, posée par le serveur. */
  echeance?: string | null
  /** Manche courante (le rejeu ouvrira la suivante). */
  manche: number
  montantMise: string
  devise: string
  /** Taux de commission lu sur l'API (`GET /api/configurations-financieres`), jamais en dur. */
  tauxCommission?: number
  /** Choix déjà exprimé par l'adversaire, s'il a été reçu en direct. */
  choixAdverse?: ChoixNulValeur
}

/**
 * Match nul déclaré des deux côtés : chacun choisit de rejouer la manche ou de partager les
 * mises. Rejouer n'a lieu que si les DEUX l'acceptent ; sinon — choix opposés ou délai
 * dépassé — le partage est appliqué, commission comprise.
 *
 * Aucun montant n'est calculé ici : le net rendu est celui du serveur. Le taux affiché vient
 * de l'API et la phrase est explicitement une estimation.
 */
export function ChoixNulModal({
  ouvert,
  onFermer,
  onChoisir,
  chargement = false,
  echeance,
  manche,
  montantMise,
  devise,
  tauxCommission,
  choixAdverse,
}: ProprietesChoixNulModal) {
  const [choix, setChoix] = useState<ChoixNulValeur | null>(null)

  // Le choix repart à zéro à chaque ouverture : jamais de validation « par inadvertance »
  // avec une sélection héritée d'une manche précédente.
  useEffect(() => {
    if (ouvert) setChoix(null)
  }, [ouvert])

  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Match nul — que faire ?"
      description={`Vous avez tous les deux déclaré une égalité sur la manche ${manche}. Votre mise de ${formatMontant(montantMise, devise)} est toujours bloquée.`}
      verrouille={chargement}
    >
      <div className="space-y-4">
        {echeance && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-alerte bg-alerte-fond px-3 py-2">
            <span className="etiquette text-alerte">Sans choix de votre part</span>
            <CompteARebours echeance={echeance} libelle="Partage dans" ton="alerte" />
          </div>
        )}

        {choixAdverse && (
          <p className="flex items-start gap-2 rounded-xl border border-trait bg-gris px-3 py-2 text-legende">
            <FontAwesomeIcon icon={icone.info} className="mt-0.5 shrink-0 text-muet" aria-hidden="true" />
            <span>
              Votre adversaire a choisi <strong>{choixAdverse === 'rejouer' ? 'de rejouer' : 'de partager'}</strong>.
              {choixAdverse === 'rejouer'
                ? ' Si vous choisissez de partager, c’est le partage qui l’emporte.'
                : ' Le partage sera appliqué quel que soit votre choix.'}
            </span>
          </p>
        )}

        <div role="radiogroup" aria-label="Votre choix" className="grid gap-3">
          <Option
            valeur="rejouer"
            actif={choix === 'rejouer'}
            onChoisir={setChoix}
            icone={icone.rafraichir}
            titre="Rejouer la manche"
            detail={`Manche ${manche + 1} sur le même match. Aucun mouvement d’argent : votre mise reste engagée, les scores sont effacés. Il faut que votre adversaire l’accepte aussi.`}
          />
          <Option
            valeur="partager"
            actif={choix === 'partager'}
            onChoisir={setChoix}
            icone={icone.poigneeDeMain}
            titre="Partager les mises"
            detail={
              tauxCommission !== undefined
                ? `Chacun récupère sa mise moins la commission de la plateforme (${formatPourcentage(tauxCommission)}, estimation — le montant exact est celui du règlement). Le match est terminé.`
                : 'Chacun récupère sa mise moins la commission de la plateforme. Le match est terminé.'
            }
          />
        </div>

        <p className="text-[12px] text-muet">
          La commission est prélevée dans tous les cas de partage, y compris si le délai s’écoule sans réponse.
        </p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variante="fantome" bloc className="sm:w-auto" onClick={onFermer} disabled={chargement}>
            Plus tard
          </Button>
          <Button
            variante="volt"
            taille="lg"
            bloc
            className="sm:w-auto"
            disabled={choix === null}
            chargement={chargement}
            onClick={() => {
              if (choix) void Promise.resolve(onChoisir(choix)).catch(() => undefined)
            }}
            iconeDebut={icone.valider}
          >
            {choix === 'rejouer' ? 'Valider : rejouer' : choix === 'partager' ? 'Valider : partager' : 'Valider mon choix'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Option({
  valeur,
  actif,
  onChoisir,
  icone: ic,
  titre,
  detail,
}: {
  valeur: ChoixNulValeur
  actif: boolean
  onChoisir: (v: ChoixNulValeur) => void
  icone: IconDefinition
  titre: string
  detail: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={actif}
      onClick={() => onChoisir(valeur)}
      className={`flex min-h-11 w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors duration-150 ${
        actif ? 'border-vert bg-vert-pale' : 'border-trait bg-papier hover:border-vert'
      }`}
    >
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm border ${
          actif ? 'border-vert bg-vert text-craie' : 'border-trait text-muet'
        }`}
        aria-hidden="true"
      >
        <FontAwesomeIcon icon={ic} className="text-[11px]" />
      </span>
      <span className="min-w-0">
        <span className="block font-titre text-[13px] font-bold uppercase tracking-wider">{titre}</span>
        <span className="mt-1 block text-legende text-muet">{detail}</span>
      </span>
    </button>
  )
}
