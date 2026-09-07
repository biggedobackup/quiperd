/**
 * Pastille de présence de l'adversaire sur l'écran de match. Discrète et jamais anxiogène :
 * elle indique seulement s'il regarde la page, jamais « il vous a abandonné ».
 *
 * Rien n'est affiché tant que le direct n'est pas établi : hors connexion, la présence
 * n'est pas connue et l'annoncer « hors ligne » serait un mensonge. Cela garantit aussi
 * un premier rendu client identique au rendu serveur (aucun socket en SSR).
 */
export interface ProprietesPresenceAdversaire {
  /** `true` en ligne, `false` parti, `null` pas encore connu. */
  enLigne: boolean | null
  /** Le socket est établi : sans lui, la présence n'a aucun sens. */
  direct: boolean
  className?: string
}

export function PresenceAdversaire({ enLigne, direct, className = '' }: ProprietesPresenceAdversaire) {
  if (!direct) return null
  const present = enLigne === true
  return (
    <span
      className={`etiquette inline-flex h-6 items-center gap-1.5 rounded-full border border-current/20 px-2.5 ${
        present ? 'bg-vert-pale text-gain' : 'bg-gris text-muet'
      } ${className}`}
    >
      <span
        className={`inline-block size-2 shrink-0 rounded-full ${present ? 'animate-pulsation bg-gain' : 'bg-muet'}`}
        aria-hidden="true"
      />
      {present ? 'En ligne' : 'Hors ligne'}
    </span>
  )
}
