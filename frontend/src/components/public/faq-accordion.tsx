import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import type { ReglesFinancieres } from '@/models/administration'

export interface QuestionReponse {
  question: string
  reponse: string
}

/** Questions dont les chiffres sont lus sur l'API — jamais un montant écrit en dur. */
export function questionsFrequentes(regles: ReglesFinancieres): QuestionReponse[] {
  return [
    {
      question: 'Comment mon argent est-il protégé pendant un match ?',
      reponse:
        'Dès qu’un défi est créé ou rejoint, la mise quitte le solde disponible pour le solde bloqué (séquestre). Elle n’en sort qu’au règlement du match, à l’annulation d’un défi non rejoint ou sur décision d’un arbitre.',
    },
    {
      question: 'Combien puis-je miser ?',
      reponse: `Entre ${formatMontant(regles.miseMinimale)} et ${formatMontant(regles.miseMaximale)} par joueur et par défi. Ces bornes sont fixées par l’équipe QUI PERD et peuvent évoluer.`,
    },
    {
      question: 'Que gagne le vainqueur ?',
      reponse: `Les deux mises additionnées, moins la commission de la plateforme (${formatPourcentage(regles.commissionDefi)} du total). Exemple : deux mises de ${formatMontant(2000)} donnent un total de ${formatMontant(4000)}, le gagnant reçoit ${formatMontant(4000 - 4000 * regles.commissionDefi)}.`,
    },
    {
      question: 'Que se passe-t-il si les deux joueurs déclarent des scores différents ?',
      reponse:
        'Le match passe automatiquement en litige. Les mises restent bloquées, un arbitre examine les preuves (captures, vidéos) et tranche : règlement au gagnant qu’il désigne, ou remboursement des deux joueurs (chaque mise rendue moins la commission).',
    },
    {
      question: 'Comment déposer et retirer de l’argent ?',
      reponse: `Par Mobile Money via LigdiCash ou MoneyFusion. Le dépôt est crédité dès confirmation du prestataire. Le retrait est débité immédiatement du solde disponible avec ${formatPourcentage(regles.fraisRetrait)} de frais, acquis seulement si le retrait aboutit : en cas d’échec, montant et frais sont recrédités.`,
    },
    {
      question: 'Personne ne rejoint mon défi, que devient ma mise ?',
      reponse:
        'Un défi ouvert expire à la fin de la durée choisie (24 h par défaut). Votre mise vous est alors rendue sur votre solde disponible, moins la commission de la plateforme. Vous pouvez aussi annuler un défi encore ouvert à tout moment.',
    },
    {
      question: 'Puis-je jouer sur mobile ?',
      reponse:
        'Oui : l’espace joueur du site fonctionne sur téléphone, et une application mobile QUI PERD utilise la même plateforme. Vos défis, votre portefeuille et vos notifications sont identiques partout.',
    },
  ]
}

/** Accordéon natif <details>/<summary> : accessible et sans JavaScript. */
export function FaqAccordion({ questions }: { questions: QuestionReponse[] }) {
  return (
    <div className="divide-y-2 divide-encre border-2 border-encre bg-papier">
      {questions.map((q, i) => (
        <details key={q.question} className="group">
          <summary className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-volt-fond">
            <span className="chiffres etiquette shrink-0 text-muet">{String(i + 1).padStart(2, '0')}</span>
            <span className="flex-1 font-semibold">{q.question}</span>
            <FontAwesomeIcon icon={icone.chevronBas} className="shrink-0 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="border-t border-trait px-5 py-4 pl-14 text-corps text-muet">{q.reponse}</p>
        </details>
      ))}
    </div>
  )
}
