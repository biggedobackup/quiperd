import type { ReactNode } from 'react'
import { Button } from '../button/button'
import { Modal } from '../modal/modal'

export interface ProprietesConfirmModal {
  ouvert: boolean
  onFermer: () => void
  /** Peut renvoyer n'importe quoi (mutation, promesse, `null` si garde) : le résultat est ignoré. */
  onConfirmer: () => unknown
  titre: string
  children: ReactNode
  libelleConfirmer?: string
  libelleAnnuler?: string
  /** `danger` pour les actions destructrices (suspension, rejet), `primaire` sinon. */
  variante?: 'primaire' | 'danger' | 'volt'
  chargement?: boolean
}

/**
 * Confirmation obligatoire avant toute action irréversible ou à impact financier :
 * le corps rappelle toujours ce qui va se passer (montant bloqué, décision, etc.).
 */
export function ConfirmModal({
  ouvert,
  onFermer,
  onConfirmer,
  titre,
  children,
  libelleConfirmer = 'Confirmer',
  libelleAnnuler = 'Annuler',
  variante = 'primaire',
  chargement = false,
}: ProprietesConfirmModal) {
  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre={titre}
      taille="sm"
      verrouille={chargement}
      pied={
        <>
          <Button variante="fantome" onClick={onFermer} disabled={chargement}>
            {libelleAnnuler}
          </Button>
          <Button variante={variante} onClick={() => void onConfirmer()} chargement={chargement}>
            {libelleConfirmer}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-corps">{children}</div>
    </Modal>
  )
}
