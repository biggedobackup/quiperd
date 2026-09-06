import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import type { ReglesFinancieres } from '@/models/administration'
import { ApparitionAuDefilement } from '@/components/partages/animation/animation'
import { LienBouton } from '@/components/partages/button/button'

/** En-tête de section : numéro en mono, titre en Unbounded, aligné à gauche. */
export function EnTeteSection({ numero, titre, intro }: { numero: string; titre: string; intro?: ReactNode }) {
  return (
    <div className="mb-10 max-w-3xl">
      <span className="chiffres etiquette inline-block border-2 border-encre bg-volt px-2 py-1 text-nuit">{numero}</span>
      <h2 className="mt-4 text-h1 md:text-display-sm">{titre}</h2>
      {intro && <p className="mt-4 text-corps text-muet md:text-lg">{intro}</p>}
    </div>
  )
}

export function Conteneur({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${className}`}>{children}</div>
}

/* ------------------------------------------------------------------ Comment ça marche */
export function SectionCommentCaMarche({ regles, complete = false, numero = '01' }: { regles: ReglesFinancieres; complete?: boolean; numero?: string }) {
  const etapes: Array<{ icone: IconDefinition; titre: string; texte: string }> = [
    {
      icone: icone.defi,
      titre: 'Créez un défi',
      texte: `Choisissez le jeu, la plateforme et votre mise (de ${formatMontant(regles.miseMinimale)} à ${formatMontant(regles.miseMaximale)}). Le montant est bloqué sur votre portefeuille.`,
    },
    {
      icone: icone.poigneeDeMain,
      titre: 'Un adversaire rejoint',
      texte: 'Sa mise est bloquée à son tour : les deux montants sont en séquestre, personne ne peut y toucher.',
    },
    {
      icone: icone.jeu,
      titre: 'Jouez le match',
      texte: 'Sur le jeu et la plateforme du défi, en ligne, avec vos identifiants de joueur. Chacun déclare ensuite le score et envoie sa preuve (capture + vidéo).',
    },
    {
      icone: icone.trophee,
      titre: 'Le gagnant remporte tout',
      texte: `Déclarations concordantes et preuves validées : le gagnant reçoit les deux mises, moins ${formatPourcentage(regles.commissionDefi)} de commission. En cas de désaccord, un arbitre tranche.`,
    },
  ]
  return (
    <section id="comment-ca-marche" className="border-b-2 border-encre bg-craie py-16 md:py-24">
      <Conteneur>
        <EnTeteSection
          numero={numero}
          titre="Comment ça marche"
          intro="Quatre étapes, un seul principe : celui qui perd le match perd sa mise."
        />
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {etapes.map((e, i) => (
            <ApparitionAuDefilement key={e.titre}>
              <li className="ticket group flex h-full flex-col border-2 border-encre bg-papier p-6 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-tampon">
                <div className="flex items-center justify-between">
                  <span className="chiffres text-h1 font-bold leading-none">0{i + 1}</span>
                  <span className="flex size-10 items-center justify-center border-2 border-encre bg-gris transition-colors group-hover:bg-volt group-hover:text-nuit">
                    <FontAwesomeIcon icon={e.icone} />
                  </span>
                </div>
                <div className="perforation my-5 h-0.5" />
                <h3 className="text-h3">{e.titre}</h3>
                <p className="mt-2 text-legende text-muet">{e.texte}</p>
              </li>
            </ApparitionAuDefilement>
          ))}
        </ol>
        {!complete && (
          <div className="mt-10">
            <LienBouton to="/comment-ca-marche" variante="secondaire" iconeFin={icone.suivant}>
              Tout le parcours en détail
            </LienBouton>
          </div>
        )}
      </Conteneur>
    </section>
  )
}

/* ------------------------------------------------------------------ Jeux */
// Le catalogue par catégorie vit dans `section-jeux.tsx`.

/* ------------------------------------------------------------------ Sécurité */
export function SectionSecurite({ numero = '03' }: { numero?: string }) {
  const points: Array<{ icone: IconDefinition; titre: string; texte: string }> = [
    {
      icone: icone.cadenas,
      titre: 'Séquestre des mises',
      texte: 'Dès la création du défi, la mise passe de votre solde disponible à votre solde bloqué. Rien n’est payé avant la validation du match, et un match n’est jamais réglé deux fois.',
    },
    {
      icone: icone.preuve,
      titre: 'Preuves vérifiées',
      texte: 'Chaque joueur envoie une capture d’écran et une vidéo. Une preuve déjà utilisée sur un autre match est refusée automatiquement.',
    },
    {
      icone: icone.litige,
      titre: 'Arbitrage humain',
      texte: 'Déclarations divergentes ? Le match passe en litige, les mises restent bloquées et un arbitre décide : règlement au gagnant ou remboursement des deux joueurs (chaque mise rendue moins la commission).',
    },
  ]
  return (
    <section id="securite" className="motif-hachures border-b-2 border-encre bg-encre py-16 text-craie md:py-24">
      <Conteneur>
        <div className="mb-10 max-w-3xl">
          <span className="chiffres etiquette inline-block border-2 border-volt bg-volt px-2 py-1 text-nuit">{numero}</span>
          <h2 className="mt-4 text-h1 text-craie md:text-display-sm">Sécurité & confiance</h2>
          <p className="mt-4 text-corps text-craie/70 md:text-lg">Une plateforme qui manipule de l’argent réel n’a pas droit à l’approximation.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {points.map((p) => (
            <ApparitionAuDefilement key={p.titre}>
              <div className="flex h-full flex-col border-2 border-craie/25 bg-nuit p-6">
                <span className="flex size-11 items-center justify-center border-2 border-volt text-volt">
                  <FontAwesomeIcon icon={p.icone} />
                </span>
                <h3 className="mt-5 text-h3 text-craie">{p.titre}</h3>
                <p className="mt-2 text-legende text-craie/70">{p.texte}</p>
              </div>
            </ApparitionAuDefilement>
          ))}
        </div>
      </Conteneur>
    </section>
  )
}

/* ------------------------------------------------------------------ Bande d'appel */
export function BandeAppel({ connecte }: { connecte: boolean }) {
  return (
    <section className="bg-volt py-14 text-nuit">
      <Conteneur className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div>
          <h2 className="text-h1 text-nuit md:text-display-sm">Prêt à relever le défi ?</h2>
          <p className="mt-2 text-corps text-nuit/80">Un compte, un dépôt, un adversaire. Le reste se joue manette en main.</p>
        </div>
        {connecte ? (
          <LienBouton to="/joueur/defis/nouveau" variante="primaire" taille="lg" iconeDebut={icone.defi}>
            Créer un défi
          </LienBouton>
        ) : (
          <LienBouton to="/inscription" variante="primaire" taille="lg" iconeFin={icone.suivant}>
            Créer un compte
          </LienBouton>
        )}
      </Conteneur>
    </section>
  )
}
