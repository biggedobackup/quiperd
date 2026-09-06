import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import type { ReglesFinancieres } from '@/models/administration'
import { LienBouton } from '@/components/partages/button/button'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'
import { Apparition } from '@/components/partages/animation/animation'

const MISE_EXEMPLE = 2000

/** Scénario joué en boucle dans le hero : le score évolue puis le gagnant s'affiche. */
const SEQUENCE: Array<{ s1: number; s2: number; fin?: boolean }> = [
  { s1: 0, s2: 0 },
  { s1: 1, s2: 0 },
  { s1: 1, s2: 1 },
  { s1: 2, s2: 1 },
  { s1: 3, s2: 1, fin: true },
]

/** Hero : un joueur connecté voit « Créer un défi », jamais « Créer un compte ». */
export function Hero({ regles, connecte, nombreDefis }: { regles: ReglesFinancieres; connecte: boolean; nombreDefis: number }) {
  const reduit = useReducedMotion()
  const [etape, setEtape] = useState(reduit ? SEQUENCE.length - 1 : 0)

  useEffect(() => {
    if (reduit) return
    const t = window.setInterval(() => setEtape((e) => (e + 1) % SEQUENCE.length), 1800)
    return () => window.clearInterval(t)
  }, [reduit])

  const courant = SEQUENCE[etape] ?? SEQUENCE[0]!
  const total = MISE_EXEMPLE * 2
  const gain = total - total * regles.commissionDefi

  return (
    <section className="motif-grille border-b-2 border-encre">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <Apparition>
          <p className="etiquette inline-flex items-center gap-2 border-2 border-encre bg-papier px-3 py-2">
            <FontAwesomeIcon icon={icone.jeu} /> Défis 1 contre 1 · tous les jeux
          </p>
          <h1 className="mt-6 text-display-sm md:text-display-md xl:text-display">
            Défiez.
            <br />
            Misez.
            <br />
            {/* `inline-block` + `leading-[0.9]` : un span inline peindrait son fond sur toute la zone de contenu
                d'Unbounded (1,24 em) et chevaucherait la ligne « Misez. » (interligne 1). Boîte de 0,9 em, centrée
                sur les capitales (0,75 em) ; `-ml-2` compense le `px-2` pour aligner le R sous le D et le M. */}
            <span className="-ml-2 inline-block bg-volt px-2 leading-[0.9] text-nuit">Remportez.</span>
          </h1>
          <p className="mt-6 max-w-xl text-corps text-muet md:text-lg">
            Créez un défi, un adversaire le rejoint, vous jouez le match. Les deux mises sont bloquées en sécurité, le gagnant récupère les mises, moins {formatPourcentage(regles.commissionDefi)} de commission.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {connecte ? (
              <LienBouton to="/joueur/defis/nouveau" variante="volt" taille="lg" iconeDebut={icone.defi}>
                Créer un défi
              </LienBouton>
            ) : (
              <LienBouton to="/inscription" variante="volt" taille="lg" iconeFin={icone.suivant}>
                Créer un compte
              </LienBouton>
            )}
            <LienBouton to="/defis" variante="secondaire" taille="lg" iconeDebut={icone.ticket}>
              {nombreDefis > 0 ? `${nombreDefis} ${nombreDefis > 1 ? 'défis ouverts' : 'défi ouvert'}` : 'Voir les défis'}
            </LienBouton>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t-2 border-encre pt-6">
            <div>
              <dt className="etiquette text-muet">Mise minimale</dt>
              <dd className="chiffres mt-1 text-h3 font-bold">{formatMontant(regles.miseMinimale)}</dd>
            </div>
            <div>
              <dt className="etiquette text-muet">Mise maximale</dt>
              <dd className="chiffres mt-1 text-h3 font-bold">{formatMontant(regles.miseMaximale)}</dd>
            </div>
            <div>
              <dt className="etiquette text-muet">Commission</dt>
              <dd className="chiffres mt-1 text-h3 font-bold">{formatPourcentage(regles.commissionDefi)}</dd>
            </div>
          </dl>
        </Apparition>

        <Apparition delai={0.12} className="relative">
          <div className="absolute -left-3 -top-3 hidden size-full border-2 border-encre bg-volt lg:block" aria-hidden="true" />
          <div className="relative">
            <TableauScore
              joueur1="Kader225"
              joueur2="Moussa10"
              score1={courant.s1}
              score2={courant.s2}
              gagnant={courant.fin ? 1 : null}
              etiquette={`Défi · mise ${formatMontant(MISE_EXEMPLE)}`}
              enDirect={!courant.fin}
              sousTitre={courant.fin ? `Kader225 remporte ${formatMontant(gain)}` : undefined}
            />
            <div className="mt-4 grid grid-cols-3 gap-2 text-legende">
              <Etape actif numero="1" texte="Mises bloquées" />
              <Etape actif={etape >= 1} numero="2" texte="Match joué" />
              <Etape actif={!!courant.fin} numero="3" texte="Gagnant payé" />
            </div>
          </div>
        </Apparition>
      </div>
    </section>
  )
}

function Etape({ numero, texte, actif }: { numero: string; texte: string; actif: boolean }) {
  return (
    <div className={`flex items-center gap-2 border-2 px-3 py-2 transition-colors duration-300 ${actif ? 'border-encre bg-papier' : 'border-trait bg-transparent text-muet'}`}>
      <span className={`chiffres flex size-6 items-center justify-center text-[11px] font-bold ${actif ? 'bg-volt text-nuit' : 'bg-trait text-muet'}`}>{numero}</span>
      <span className="truncate font-semibold">{texte}</span>
    </div>
  )
}
