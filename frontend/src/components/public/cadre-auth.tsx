import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Logo } from '@/components/partages/logo/logo'
import { Badge } from '@/components/partages/badge/badge'
import { icone } from '@/lib/icones'

/** Les trois garanties mises en avant à côté des formulaires d'authentification. */
const ARGUMENTS = [
  {
    icone: icone.cadenas,
    titre: 'Mises sous séquestre',
    texte: 'Les deux mises sont bloquées le temps du match, puis versées au gagnant.',
  },
  {
    icone: icone.preuve,
    titre: 'Preuves vérifiées',
    texte: 'Capture d’écran et vidéo du résultat, contrôlées avant tout paiement.',
  },
  {
    icone: icone.arbitrage,
    titre: 'Arbitrage humain',
    texte: 'En cas de litige, une personne tranche sur les preuves, pas un algorithme.',
  },
] as const

/**
 * Écran d'authentification en deux volets : à gauche un panneau blanc très contrasté
 * (logo, accroche, trois garanties, ticket illustratif d'un match gagné), à droite le
 * formulaire. En mobile, le formulaire seul.
 */
export function CadreAuth({
  titre,
  sousTitre,
  children,
  pied,
  accroche = 'Le match commence ici.',
}: {
  titre: string
  sousTitre?: ReactNode
  children: ReactNode
  pied?: ReactNode
  accroche?: string
}) {
  return (
    <div className="grid min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="hidden border-r border-trait bg-craie px-10 py-10 lg:flex xl:px-14" aria-label="Pourquoi QUI PERD">
        <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col justify-between gap-10">
          <Logo taille="lg" />

          <div className="min-w-0">
            <p className="etiquette flex items-center gap-2 text-encre">
              <span className="size-2 shrink-0 rounded-full bg-vert" aria-hidden="true" />
              Défis 1 contre 1 entre gamers
            </p>
            <h2 className="mt-4 text-display-sm text-balance text-encre">{accroche}</h2>

            <ul className="mt-8 divide-y divide-trait border-y border-trait">
              {ARGUMENTS.map((argument, index) => (
                <li key={argument.titre} className="flex items-start gap-4 py-4">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-vert text-craie"
                    aria-hidden="true"
                  >
                    <FontAwesomeIcon icon={argument.icone} className="text-base" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="flex items-baseline gap-2 text-h3 text-encre">
                      <span className="chiffres text-etiquette font-bold text-gain">{String(index + 1).padStart(2, '0')}</span>
                      {argument.titre}
                    </h3>
                    <p className="mt-1 text-legende text-muet">{argument.texte}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <TicketIllustratif />
            </div>
          </div>

          <p className="flex items-center gap-3 text-legende text-muet">
            <span className="etiquette shrink-0 rounded-full border border-trait px-2 py-1 text-encre">18+</span>
            Jeu réservé aux adultes
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-trait bg-papier p-6 shadow-carte-forte sm:p-8">
            <h1 className="text-h2">{titre}</h1>
            {sousTitre && <p className="mt-2 text-legende text-muet">{sousTitre}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {pied && <div className="mt-5 text-center text-legende text-muet">{pied}</div>}
        </div>
      </main>
    </div>
  )
}

/**
 * Ticket illustratif d'un défi terminé : l'issue sur bandeau noir (vainqueur en volt),
 * « tampon » vert décalé derrière la carte (mêmes coins arrondis, aucun dégradé).
 */
function TicketIllustratif() {
  return (
    <div className="relative">
      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-2xl bg-vert" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-2xl border border-trait bg-papier">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="etiquette text-encre">Défi terminé</span>
          <Badge variante="volt" sansPoint>
            <FontAwesomeIcon icon={icone.trophee} /> Gagnant payé
          </Badge>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 bg-encre px-5 py-4 text-craie">
          <div className="min-w-0">
            <p className="chiffres text-display-sm font-bold leading-none text-volt">✓</p>
            <p className="mt-2 truncate font-titre text-[11px] font-bold uppercase text-volt">
              <span className="border-b border-volt pb-0.5">Vous</span>
            </p>
          </div>
          <span className="chiffres text-h2 text-craie" aria-hidden="true">
            vs
          </span>
          <div className="min-w-0 text-right">
            <p className="chiffres text-display-sm font-bold leading-none text-craie">✗</p>
            <p className="mt-2 truncate font-titre text-[11px] font-bold uppercase text-craie">Adversaire</p>
          </div>
        </div>

        <p className="flex items-center gap-2 border-t border-trait bg-gris px-4 py-3 text-legende font-medium text-encre">
          <FontAwesomeIcon icon={icone.pieces} className="shrink-0 text-gain" />
          Le gagnant remporte les deux mises, moins la commission.
        </p>
      </div>
    </div>
  )
}
