/**
 * Briques visuelles des listes de défis vivantes : compte à rebours et liste animée à l'entrée
 * comme à la sortie. Ce fichier n'exporte QUE des composants (contrainte du Fast Refresh de
 * Vite) ; la logique d'abonnement et de cache est dans `defis-en-direct.ts`.
 */
import { useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { useChrono } from '@/temps-reel/hooks'
import { sortirDeLArene } from './defis-en-direct'

// ─── Compte à rebours ─────────────────────────────────────────────────────────

/** Sous ce seuil, le décompte passe en ambre et la pastille pulse. */
const SEUIL_ALERTE = 5 * 60_000

/**
 * Teinte au repos. Le composant est SEUL à poser une couleur de texte (`text-muet`,
 * `text-alerte`, `text-perte`) : deux utilitaires `text-*` sur le même élément se disputeraient
 * selon l'ordre du fichier CSS, pas selon l'ordre des classes — les appelants n'en passent donc
 * jamais, ils choisissent un ton.
 */
export type TonCompteARebours = 'muet' | 'herite'

export interface ProprietesCompteARebours {
  defiId: string
  /** Date ISO d'expiration renvoyée par l'API (`dateExpiration`). */
  echeance?: string
  /** Texte devant le décompte ; `null` pour n'afficher que les chiffres. */
  libelle?: string | null
  /** `herite` laisse la couleur du conteneur (pied de carte qui change au survol). */
  ton?: TonCompteARebours
  /** Appelé une fois l'échéance atteinte, en plus du retrait des listes (bandeau d'écran). */
  surExpiration?: () => void
  className?: string
}

/**
 * Temps restant avant l'expiration d'un défi, égrené seconde par seconde côté client (aucun
 * appel réseau). À zéro, le défi sort de l'arène de lui-même : le serveur confirmera avec
 * `defi.expire`, l'écran n'attend pas.
 *
 * Le premier rendu (serveur et client) affiche `—` : `useChrono` ne démarre qu'après
 * hydratation, sinon le balisage du serveur et celui du navigateur différeraient d'une seconde.
 */
export function CompteAReboursDefi({
  defiId,
  echeance,
  libelle = 'Expire dans',
  ton = 'muet',
  surExpiration,
  className = '',
}: ProprietesCompteARebours) {
  const queryClient = useQueryClient()
  const chrono = useChrono(echeance, {
    surFin: () => {
      sortirDeLArene(queryClient, defiId, 'expire')
      surExpiration?.()
    },
  })

  if (!echeance) return null

  const urgent = chrono.actif && chrono.restant <= SEUIL_ALERTE
  const couleur = chrono.termine ? 'text-perte' : urgent ? 'text-alerte' : ton === 'muet' ? 'text-muet' : ''

  return (
    <span role="timer" className={`inline-flex items-center gap-1.5 whitespace-nowrap ${couleur} ${className}`}>
      <FontAwesomeIcon icon={icone.horloge} className={urgent ? 'animate-pulsation' : ''} aria-hidden="true" />
      {libelle && <span>{libelle}</span>}
      <span className="chiffres">{chrono.termine ? 'expiré' : chrono.texte}</span>
    </span>
  )
}

// ─── Animations d'entrée et de sortie ─────────────────────────────────────────

/** 40 ms entre éléments à l'arrivée, plafonnés : au-delà, la cascade devient une attente. */
const PAS_CASCADE = 0.04
const MAX_CASCADE = 11

/**
 * Conteneur d'une liste vivante : ce qui arrive glisse en place, ce qui part s'efface au lieu de
 * disparaître d'un coup. `AnimatePresence` est TOUJOURS monté et ses enfants sont toujours des
 * composants `motion` — un enfant non animé ne signalerait jamais la fin de sa sortie et
 * resterait accroché au DOM. `prefers-reduced-motion` est honoré par des durées nulles.
 */
export function ListeAnimee({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <AnimatePresence>{children}</AnimatePresence>
    </div>
  )
}

/** Élément d'une `ListeAnimee` : `key` obligatoire (l'identifiant du défi). */
export function ElementAnime({ index = 0, className = '', children }: { index?: number; className?: string; children: ReactNode }) {
  const reduit = useReducedMotion() === true
  // Délai figé au montage : un défi inséré en tête décale les index suivants sans que les cartes
  // déjà à l'écran ne rejouent leur entrée.
  const delai = useRef(Math.min(index, MAX_CASCADE) * PAS_CASCADE).current
  const entree = reduit ? { duration: 0, delay: 0 } : { duration: 0.22, ease: 'easeOut' as const, delay: delai }
  const sortie = reduit ? { duration: 0 } : { duration: 0.18, ease: 'easeIn' as const }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduit ? 0 : 10 }}
      animate={{ opacity: 1, y: 0, transition: entree }}
      exit={{ opacity: 0, y: reduit ? 0 : -8, transition: sortie }}
    >
      {children}
    </motion.div>
  )
}
