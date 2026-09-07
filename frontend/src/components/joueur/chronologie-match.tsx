import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import type { StatutMatch } from '@/models/match'

/**
 * Frise du parcours de fin de match, en trois temps :
 *
 *   1. jouer et déclarer  →  2. accord de l'adversaire  →  3. règlement
 *
 * La deuxième étape change de visage selon l'issue : confirmation attendue (vert), preuve
 * exigée après un désaccord (ambre), choix rejouer/partager après un nul (ambre), litige
 * arbitré (rouge). Le statut historique `verification` y est encore accepté : d'anciennes
 * lignes existent en base et l'affichage ne doit pas casser dessus.
 */
interface Bifurcation {
  libelle: string
  description: string
  icone: IconDefinition
  ton: 'attente' | 'alerte' | 'perte'
}

const BIFURCATIONS: Record<string, Bifurcation> = {
  preuve_requise: {
    libelle: 'Preuve exigée',
    description: 'Vos déclarations divergent : chacun envoie sa preuve, puis un arbitre tranche.',
    icone: icone.preuve,
    ton: 'alerte',
  },
  nul_en_attente: {
    libelle: 'Match nul',
    description: 'Chacun choisit de rejouer la manche ou de partager les mises.',
    icone: icone.poigneeDeMain,
    ton: 'alerte',
  },
  verification: {
    libelle: 'Vérification',
    description: 'Ancien parcours : les preuves de ce match sont examinées avant règlement.',
    icone: icone.sablier,
    ton: 'alerte',
  },
  litige: {
    libelle: 'Litige ouvert',
    description: 'Un arbitre examine les preuves des deux joueurs et tranche.',
    icone: icone.litige,
    ton: 'perte',
  },
}

const TONS = {
  attente: { fond: 'bg-vert-pale', texte: 'text-encre', pastille: 'border-vert bg-vert text-craie' },
  alerte: { fond: 'bg-alerte-fond', texte: 'text-alerte', pastille: 'border-alerte bg-alerte text-papier' },
  perte: { fond: 'bg-perte-fond', texte: 'text-perte', pastille: 'border-perte bg-perte text-papier' },
}

export function ChronologieMatch({ statut }: { statut: StatutMatch }) {
  const termine = statut === 'termine'
  const bifurcation = BIFURCATIONS[statut]
  // Étape courante : 0 tant que rien n'est déclaré, 1 dès qu'une issue se joue, 2 au règlement.
  const index = termine ? 2 : bifurcation ? 1 : 0

  const etapes = [
    {
      cle: 'jouer',
      libelle: 'Jouer et déclarer',
      description: 'Jouez le match, puis déclarez qui l’emporte.',
      icone: icone.match,
      ton: 'attente' as const,
    },
    bifurcation
      ? { cle: 'issue', ...bifurcation }
      : {
          cle: 'issue',
          libelle: 'Accord des deux joueurs',
          description: 'Votre adversaire confirme le résultat (ou annonce l’inverse).',
          icone: icone.poigneeDeMain,
          ton: 'attente' as const,
        },
    {
      cle: 'regle',
      libelle: 'Réglé',
      description: 'L’argent est versé automatiquement, sans intervention.',
      icone: icone.pieces,
      ton: 'attente' as const,
    },
  ]

  return (
    <ol className="grid gap-px overflow-hidden rounded-2xl border border-trait bg-trait sm:grid-cols-3">
      {etapes.map((e, i) => {
        const fait = i < index || termine
        const courant = i === index && !termine
        const tons = TONS[e.ton]
        return (
          <li
            key={e.cle}
            className={`flex gap-3 px-4 py-3 ${courant ? tons.fond : 'bg-papier'}`}
            aria-current={courant ? 'step' : undefined}
          >
            <span
              className={`chiffres flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                courant ? tons.pastille : fait ? 'border-encre bg-encre text-craie' : 'border-trait text-muet'
              }`}
            >
              {courant ? (
                <FontAwesomeIcon icon={e.icone} />
              ) : fait ? (
                <FontAwesomeIcon icon={icone.valider} />
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0">
              <p className={`etiquette ${courant ? tons.texte : fait ? 'text-encre' : 'text-muet'}`}>{e.libelle}</p>
              <p className="mt-0.5 text-[12px] text-muet">{e.description}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
