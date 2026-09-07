import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone, iconePlateforme } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import type { Jeu } from '@/models/jeu'
import type { Plateforme } from '@/models/plateforme'
import type { ReglesFinancieres } from '@/models/administration'

/**
 * Bandeau défilant (jeux, plateformes, règles lues sur l'API) : animation CSS translateX en
 * boucle, pause au survol, figé si prefers-reduced-motion. Contenu dupliqué pour la boucle.
 */
export function Ticker({ jeux, plateformes, regles }: { jeux: Jeu[]; plateformes: Plateforme[]; regles: ReglesFinancieres }) {
  const elements = [
    // Le catalogue compte une cinquantaine de titres : le bandeau n'en fait défiler qu'une sélection.
    ...jeux.slice(0, 14).map((j) => ({ icone: icone.jeu, texte: j.nom })),
    ...plateformes.map((p) => ({ icone: iconePlateforme(p.nom, p.famille), texte: p.nom })),
    { icone: icone.pieces, texte: `Mise de ${formatMontant(regles.miseMinimale)} à ${formatMontant(regles.miseMaximale)}` },
    { icone: icone.trophee, texte: `Commission ${formatPourcentage(regles.commissionDefi)}` },
    { icone: icone.retrait, texte: `Frais de retrait ${formatPourcentage(regles.fraisRetrait)}` },
    { icone: icone.securite, texte: 'Mises en séquestre' },
    { icone: icone.litige, texte: 'Arbitrage humain' },
  ]
  const boucle = [...elements, ...elements]
  return (
    <div className="overflow-hidden border-b border-trait bg-encre text-craie" aria-hidden="true">
      <div className="flex w-max animate-ticker gap-0 hover:[animation-play-state:paused]">
        {boucle.map((e, i) => (
          <span key={i} className="etiquette flex items-center gap-3 whitespace-nowrap px-6 py-3.5">
            <FontAwesomeIcon icon={e.icone} className="text-vert" />
            {e.texte}
            <span className="ml-3 size-1.5 rounded-full bg-vert" />
          </span>
        ))}
      </div>
    </div>
  )
}
