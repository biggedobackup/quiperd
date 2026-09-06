import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatMontant, versNombre } from '@/lib/format'
import type { MatchEnrichi } from '@/models/match'
import type { DecisionArbitrale } from '@/models/litige'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'

type Choix = 'joueur1' | 'joueur2' | 'remboursement'

/**
 * Décision arbitrale : règlement à l'un des deux joueurs ou remboursement croisé.
 * Irréversible : une case de confirmation explicite est exigée avant l'envoi.
 */
export function DecisionLitigeModal({ ouvert, onFermer, onDecider, match, commission, chargement = false }: { ouvert: boolean; onFermer: () => void; onDecider: (d: DecisionArbitrale) => void; match: MatchEnrichi; commission: number; chargement?: boolean }) {
  const [choix, setChoix] = useState<Choix>('remboursement')
  const [confirme, setConfirme] = useState(false)
  const mise = versNombre(match.montantMise)
  const total = mise * 2
  const gain = total - total * commission

  const options: Array<{ valeur: Choix; titre: string; texte: string }> = [
    { valeur: 'joueur1', titre: `${match.joueur1Nom} gagne`, texte: `Reçoit ${formatMontant(gain)} (estimation), ${match.joueur2Nom} perd sa mise.` },
    { valeur: 'joueur2', titre: `${match.joueur2Nom} gagne`, texte: `Reçoit ${formatMontant(gain)} (estimation), ${match.joueur1Nom} perd sa mise.` },
    { valeur: 'remboursement', titre: 'Rembourser les deux joueurs', texte: `Chacun récupère sa mise de ${formatMontant(mise)} moins la commission de la plateforme.` },
  ]

  const envoyer = () => {
    if (choix === 'remboursement') onDecider({ decision: 'remboursement' })
    else onDecider({ decision: 'gagnant', gagnantId: choix === 'joueur1' ? match.joueur1Id : match.joueur2Id })
  }

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Décision arbitrale" description="Elle déclenche immédiatement le règlement ou le remboursement de l'escrow. Aucun retour en arrière." verrouille={chargement}>
      <div className="space-y-3">
        {options.map((o) => (
          <label key={o.valeur} className={`flex cursor-pointer items-start gap-3 border-2 p-3 transition-colors ${choix === o.valeur ? 'border-encre bg-volt-fond' : 'border-trait hover:border-encre'}`}>
            <input type="radio" name="decision" value={o.valeur} checked={choix === o.valeur} onChange={() => setChoix(o.valeur)} className="mt-1 accent-encre" />
            <span>
              <span className="block font-bold">{o.titre}</span>
              <span className="block text-legende text-muet">{o.texte}</span>
            </span>
          </label>
        ))}
        <label className="flex cursor-pointer items-start gap-3 border-2 border-perte bg-perte-fond p-3 text-legende text-perte">
          <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} className="mt-0.5 accent-perte" />
          <span>J’ai examiné les déclarations et les preuves ; je confirme cette décision définitive.</span>
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <Button variante="fantome" onClick={onFermer} disabled={chargement}>
            Annuler
          </Button>
          <Button variante={choix === 'remboursement' ? 'primaire' : 'volt'} onClick={envoyer} disabled={!confirme} chargement={chargement} iconeDebut={icone.arbitrage}>
            Trancher
          </Button>
        </div>
        <p className="flex items-center gap-2 text-[11px] text-muet">
          <FontAwesomeIcon icon={icone.info} /> Les montants réels sont calculés par le backend avec le taux de commission en vigueur.
        </p>
      </div>
    </Modal>
  )
}
