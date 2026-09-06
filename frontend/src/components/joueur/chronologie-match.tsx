import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import type { StatutMatch } from '@/models/match'

const ETAPES: Array<{ cle: string; libelle: string; description: string }> = [
  { cle: 'en_cours', libelle: 'Match en cours', description: 'Jouez, puis déclarez le score.' },
  { cle: 'verification', libelle: 'Vérification', description: 'Déclarations concordantes, preuves examinées.' },
  { cle: 'termine', libelle: 'Réglé', description: 'Le gagnant est crédité.' },
]

/** Frise des états du match ; le litige est une bifurcation affichée en rouge. */
export function ChronologieMatch({ statut }: { statut: StatutMatch }) {
  const index = statut === 'litige' ? 1 : ETAPES.findIndex((e) => e.cle === statut)
  return (
    <ol className="grid gap-px border-2 border-encre bg-encre sm:grid-cols-3">
      {ETAPES.map((e, i) => {
        const litige = statut === 'litige' && i === 1
        const fait = i < index || statut === 'termine'
        const courant = i === index && statut !== 'termine'
        return (
          <li key={e.cle} className={`flex gap-3 px-4 py-3 ${litige ? 'bg-perte-fond' : courant ? 'bg-volt-fond' : 'bg-papier'}`}>
            <span
              className={`chiffres flex size-7 shrink-0 items-center justify-center border-2 text-[11px] font-bold ${
                litige ? 'border-perte bg-perte text-papier' : fait ? 'border-encre bg-encre text-craie' : courant ? 'border-encre bg-volt text-nuit' : 'border-trait text-muet'
              }`}
            >
              {litige ? <FontAwesomeIcon icon={icone.litige} /> : fait ? <FontAwesomeIcon icon={icone.valider} /> : i + 1}
            </span>
            <div>
              <p className={`etiquette ${litige ? 'text-perte' : fait || courant ? 'text-encre' : 'text-muet'}`}>{litige ? 'Litige ouvert' : e.libelle}</p>
              <p className="mt-0.5 text-[12px] text-muet">{litige ? 'Un arbitre examine les preuves et tranche.' : e.description}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
