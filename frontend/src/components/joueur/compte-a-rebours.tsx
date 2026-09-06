import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { useChrono } from '@/temps-reel/hooks'

export type TonChrono = 'volt' | 'alerte' | 'perte' | 'neutre'

const TONS: Record<TonChrono, string> = {
  volt: 'border-encre bg-volt text-nuit',
  alerte: 'border-alerte bg-alerte-fond text-alerte',
  perte: 'border-perte bg-perte-fond text-perte',
  neutre: 'border-trait bg-gris text-encre',
}

export interface ProprietesCompteARebours {
  /** Échéance ISO posée par le serveur (`match.echeance`, `echeanceConfirmation`…). */
  echeance: string | null | undefined
  /** Texte court à gauche du chrono (« Il reste », « Preuve attendue »…). */
  libelle?: string
  ton?: TonChrono
  /** Passe automatiquement au rouge sous ce seuil (secondes). `0` désactive. */
  seuilUrgence?: number
  /** Appelé UNE fois quand l'échéance est atteinte (jamais en boucle). */
  surFin?: () => void
  className?: string
}

/**
 * Compte à rebours d'une échéance de match : purement client, calculé depuis la date
 * envoyée par le serveur — aucun appel réseau, aucun rafraîchissement cyclique.
 *
 * `useChrono` renvoie `pret: false` et le texte `—` au rendu serveur et au premier rendu
 * client : c'est délibéré (le décompte ne démarre qu'après hydratation, sinon le HTML du
 * serveur et celui du navigateur différeraient d'une seconde).
 */
export function CompteARebours({
  echeance,
  libelle,
  ton = 'neutre',
  seuilUrgence = 60,
  surFin,
  className = '',
}: ProprietesCompteARebours) {
  const chrono = useChrono(echeance, surFin ? { surFin } : {})
  if (!echeance) return null

  const urgent = seuilUrgence > 0 && chrono.pret && !chrono.termine && chrono.secondes <= seuilUrgence
  const apparence = chrono.termine ? TONS.neutre : urgent ? TONS.perte : TONS[ton]

  return (
    <span
      role="timer"
      aria-live="off"
      className={`etiquette inline-flex h-8 shrink-0 items-center gap-2 border-2 px-2.5 ${apparence} ${className}`}
    >
      <FontAwesomeIcon
        icon={chrono.termine ? icone.horloge : icone.sablier}
        className={chrono.actif && urgent ? 'animate-pulsation' : ''}
        aria-hidden="true"
      />
      {libelle && <span className="whitespace-nowrap">{libelle}</span>}
      <span className="chiffres text-legende font-bold tabular-nums">
        {chrono.termine ? 'Délai écoulé' : chrono.texte}
      </span>
    </span>
  )
}
