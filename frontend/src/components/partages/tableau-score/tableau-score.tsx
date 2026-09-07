import { Badge } from '../badge/badge'

export interface ProprietesTableauScore {
  joueur1: string
  joueur2: string
  /**
   * Issue rangée par le serveur (1-0, 0-1, 0-0). Convention interne du moteur de règlement :
   * on n'en montre jamais les chiffres — un match se déclare en désignant le vainqueur, pas
   * en comptant des points — mais une coche, une croix ou un signe égal.
   */
  score1?: number | null
  score2?: number | null
  /** Identité du gagnant : `1`, `2` ou `null` (indécis). */
  gagnant?: 1 | 2 | null
  etiquette?: string
  /** Pastille « en direct » qui pulse. */
  enDirect?: boolean
  sousTitre?: string
  compact?: boolean
  className?: string
}

/**
 * Tableau d'affichage : deux noms, deux grandes marques sur fond encre, gagnant souligné en
 * volt. Utilisé dans le hero, le détail de match et l'arbitrage.
 */
export function TableauScore({
  joueur1,
  joueur2,
  score1,
  score2,
  gagnant = null,
  etiquette = 'Match',
  enDirect = false,
  sousTitre,
  compact = false,
  className = '',
}: ProprietesTableauScore) {
  // Tant que la plateforme n'a pas tranché, on ne montre RIEN. Les colonnes `scoreJoueur1/2`
  // gardent la dernière déclaration reçue, y compris quand les deux joueurs se contredisent :
  // en tirer une coche afficherait un vainqueur que personne n'a désigné.
  const symbole = (moi?: number | null, lui?: number | null) => {
    if (gagnant == null || moi == null || lui == null) return '–'
    if (moi === lui) return '='
    return moi > lui ? '✓' : '✗'
  }
  const s1 = symbole(score1, score2)
  const s2 = symbole(score2, score1)
  const tailleScore = compact ? 'text-display-sm' : 'text-display-md md:text-display'
  const tailleNom = compact ? 'text-[11px]' : 'text-[12px] md:text-[13px]'
  return (
    <div className={`overflow-hidden rounded-2xl bg-encre text-craie ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-craie/15 px-4 py-2.5">
        <span className="etiquette text-craie/70">{etiquette}</span>
        {enDirect ? (
          <Badge variante="volt" actif>
            En direct
          </Badge>
        ) : (
          sousTitre && <span className="etiquette text-volt">{sousTitre}</span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-5 md:gap-4 md:px-6">
        <Joueur nom={joueur1} score={s1} gagnant={gagnant === 1} tailleScore={tailleScore} tailleNom={tailleNom} alignement="left" />
        <span className="chiffres text-h2 text-craie/40" aria-hidden="true">
          vs
        </span>
        <Joueur nom={joueur2} score={s2} gagnant={gagnant === 2} tailleScore={tailleScore} tailleNom={tailleNom} alignement="right" />
      </div>
      {!enDirect && sousTitre && (
        <div className="border-t border-craie/15 bg-craie/5 px-4 py-2.5 text-center text-legende text-craie/80">{sousTitre}</div>
      )}
    </div>
  )
}

function Joueur({
  nom,
  score,
  gagnant,
  tailleScore,
  tailleNom,
  alignement,
}: {
  nom: string
  score: number | string
  gagnant: boolean
  tailleScore: string
  tailleNom: string
  alignement: 'left' | 'right'
}) {
  return (
    <div className={`min-w-0 ${alignement === 'right' ? 'text-right' : 'text-left'}`}>
      <p className={`chiffres ${tailleScore} font-bold leading-none ${gagnant ? 'text-volt' : 'text-craie'}`}>{score}</p>
      <p className={`mt-3 truncate font-titre uppercase ${tailleNom} ${gagnant ? 'text-volt' : 'text-craie/80'}`}>
        <span className={gagnant ? 'border-b-2 border-volt pb-0.5' : ''}>{nom}</span>
      </p>
    </div>
  )
}
