import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import type { ReglesFinancieres } from '@/models/administration'
import { LienBouton } from '@/components/partages/button/button'

export function Conteneur({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${className}`}>{children}</div>
}

/** Surtitre vert de section : un tiret plein puis le libellé en petites capitales. */
export function Surtitre({ children }: { children: ReactNode }) {
  return (
    <p className="etiquette flex items-center gap-2.5 text-vert">
      <span aria-hidden="true" className="h-[3px] w-6 rounded-full bg-vert" />
      {children}
    </p>
  )
}

/**
 * En-tête de section : le numéro reste le repère du site (01 à 05), rendu en pastille verte
 * arrondie. Titre et échelle typographique inchangés par rapport au site en ligne.
 */
export function EnTeteSection({ numero, titre, intro }: { numero?: string; titre: string; intro?: ReactNode }) {
  return (
    <div className="mb-10 max-w-2xl">
      {numero && (
        <span className="chiffres etiquette inline-block rounded-full bg-vert-pale px-3 py-1.5 text-vert">{numero}</span>
      )}
      <h2 className="mt-4 hyphens-auto break-words text-h1 md:text-display-sm">{titre}</h2>
      {intro && <p className="mt-4 text-corps text-muet">{intro}</p>}
    </div>
  )
}

/** Fond du bandeau de page. `noir` et `vert` inversent l'ensemble des couleurs de texte. */
export type FondEnTete = 'blanc' | 'noir' | 'vert'

const FONDS: Record<FondEnTete, { section: string; surtitre: string; titre: string; intro: string }> = {
  blanc: { section: 'border-b border-trait bg-craie', surtitre: 'text-vert', titre: '', intro: 'text-muet' },
  noir: { section: 'bg-encre', surtitre: 'text-volt', titre: 'text-craie', intro: 'text-craie/70' },
  vert: { section: 'bg-vert', surtitre: 'text-craie/80', titre: 'text-craie', intro: 'text-craie/85' },
}

/**
 * Bandeau de page des écrans publics (Défis, Jeux, Comment ça marche, Aide) : surtitre,
 * titre, intro, et les actions poussées à droite sur grand écran — le bandeau tient alors sur
 * une seule ligne au lieu de deux, et la page démarre plus haut.
 *
 * Les libellés sont fournis par la page, jamais réécrits ici. `fond` change l'aplat ET toutes
 * les couleurs de texte d'un coup : sur `noir` ou `vert`, titre et intro passent en blanc et le
 * surtitre en vert vif (le vert d'action, trop sombre, ne se lirait pas sur noir).
 */
export function EnTetePublique({
  surtitre,
  titre,
  intro,
  children,
  fond = 'blanc',
}: {
  surtitre: ReactNode
  titre: string
  intro?: ReactNode
  children?: ReactNode
  fond?: FondEnTete
}) {
  const ton = FONDS[fond]
  return (
    <section className={ton.section}>
      <Conteneur className="py-10 md:py-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="min-w-0">
            <div className={`etiquette flex flex-wrap items-center gap-3 ${ton.surtitre}`}>{surtitre}</div>
            <h1 className={`mt-3 max-w-3xl hyphens-auto break-words text-h3 sm:text-h2 ${ton.titre}`}>{titre}</h1>
            {intro && <p className={`mt-3 max-w-xl text-legende ${ton.intro}`}>{intro}</p>}
          </div>
          {children && <div className="flex flex-wrap gap-3 lg:shrink-0 lg:justify-end">{children}</div>}
        </div>
      </Conteneur>
    </section>
  )
}

/* ------------------------------------------------------------------ Comment ça marche */
export function SectionCommentCaMarche({
  regles,
  complete = false,
  numero = '01',
}: {
  regles: ReglesFinancieres
  complete?: boolean
  numero?: string
}) {
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
      texte:
        'Sur le jeu et la plateforme du défi, en ligne, avec vos identifiants de joueur. Chacun déclare ensuite le résultat et envoie sa preuve (capture + vidéo).',
    },
    {
      icone: icone.trophee,
      titre: 'Le gagnant remporte tout',
      texte: `Déclarations concordantes et preuves validées : le gagnant reçoit les deux mises, moins ${formatPourcentage(regles.commissionDefi)} de commission. En cas de désaccord, un arbitre tranche.`,
    },
  ]
  return (
    <section id="comment-ca-marche" className="border-b border-trait bg-ardoise py-16 md:py-20">
      <Conteneur>
        <EnTeteSection
          numero={numero}
          titre="Comment ça marche"
          intro="Quatre étapes, un seul principe : celui qui perd le match perd sa mise."
        />
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {etapes.map((e, i) => (
            <li key={e.titre} className="h-full">
              <div className="h-full">
                <div className="flex h-full flex-col rounded-2xl border border-trait bg-craie p-6 transition-shadow duration-150 hover:shadow-carte">
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-xl bg-vert text-[17px] text-craie">
                      <FontAwesomeIcon icon={e.icone} />
                    </span>
                    <span className="chiffres text-h1 font-bold leading-none text-trait">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-h3">{e.titre}</h3>
                  <p className="mt-2 text-legende leading-relaxed text-muet">{e.texte}</p>
                </div>
              </div>
            </li>
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

/* ------------------------------------------------------------------ Sécurité */
export function SectionSecurite({ numero = '03' }: { numero?: string }) {
  const points: Array<{ icone: IconDefinition; titre: string; texte: string }> = [
    {
      icone: icone.cadenas,
      titre: 'Séquestre des mises',
      texte:
        'Dès la création du défi, la mise passe de votre solde disponible à votre solde bloqué. Rien n’est payé avant la validation du match, et un match n’est jamais réglé deux fois.',
    },
    {
      icone: icone.preuve,
      titre: 'Preuves vérifiées',
      texte:
        'Chaque joueur envoie une capture d’écran et une vidéo. Une preuve déjà utilisée sur un autre match est refusée automatiquement.',
    },
    {
      icone: icone.litige,
      titre: 'Arbitrage humain',
      texte:
        'Déclarations divergentes ? Le match passe en litige, les mises restent bloquées et un arbitre décide : règlement au gagnant ou remboursement des deux joueurs (chaque mise rendue moins la commission).',
    },
  ]
  return (
    <section id="securite" className="border-b border-trait bg-craie py-16 md:py-20">
      <Conteneur>
        <div className="rounded-3xl bg-encre px-6 py-12 text-craie sm:px-10 md:py-14">
          <div className="mb-10 max-w-2xl">
            <span className="chiffres etiquette inline-block rounded-full bg-craie/10 px-3 py-1.5 text-volt">{numero}</span>
            <h2 className="mt-4 text-h1 text-craie md:text-display-sm">Sécurité &amp; confiance</h2>
            <p className="mt-4 text-corps text-craie/70">
              Une plateforme qui manipule de l’argent réel n’a pas droit à l’approximation.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {points.map((p) => (
              <div key={p.titre}>
                <div className="flex h-full flex-col rounded-2xl border border-craie/12 bg-craie/5 p-6">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-vert text-craie">
                    <FontAwesomeIcon icon={p.icone} />
                  </span>
                  <h3 className="mt-5 text-h3 text-craie">{p.titre}</h3>
                  <p className="mt-2 text-legende leading-relaxed text-craie/70">{p.texte}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Conteneur>
    </section>
  )
}

/* ------------------------------------------------------------------ Bande d'appel + chiffres */

export interface ChiffreCle {
  icone: IconDefinition
  valeur: string
  libelle: string
}

/**
 * Appel à l'action de bas de page. `chiffres` affiche le panneau de droite ; les valeurs sont
 * fournies par l'appelant à partir de données réelles de l'API — aucun compteur d'audience
 * décoratif n'est écrit en dur ici.
 */
export function BandeAppel({ connecte, chiffres = [] }: { connecte: boolean; chiffres?: ChiffreCle[] }) {
  return (
    <section className="bg-craie py-14 md:py-20">
      <Conteneur>
        <div className="grid overflow-hidden rounded-3xl border border-trait lg:grid-cols-[1fr_1.15fr]">
          {/* Panneau vert : l'appel. */}
          <div className="bg-vert-sombre px-7 py-10 text-craie sm:px-10">
            <span className="flex size-14 items-center justify-center rounded-full border-2 border-craie/40 text-[20px]">
              <FontAwesomeIcon icon={icone.couronne} />
            </span>
            <h2 className="mt-5 text-h1 text-craie md:text-display-sm">Prêt à relever le défi ?</h2>
            <p className="mt-3 max-w-sm text-legende text-craie/80">
              Un compte, un dépôt, un adversaire. Le reste se joue manette en main.
            </p>
            <div className="mt-7">
              <LienBouton
                to={connecte ? '/joueur/defis/nouveau' : '/inscription'}
                variante="secondaire"
                iconeFin={icone.suivant}
              >
                {connecte ? 'Créer un défi' : 'Créer un compte'}
              </LienBouton>
            </div>
          </div>

          {/* Panneau clair : les chiffres réels de la plateforme. */}
          {chiffres.length > 0 && (
            <div className="grid grid-cols-2 gap-y-8 bg-ardoise px-7 py-10 sm:px-10 md:grid-cols-4">
              {chiffres.map((c) => (
                <div key={c.libelle} className="text-center">
                  <FontAwesomeIcon icon={c.icone} className="text-[18px] text-vert" />
                  <p className="chiffres mt-3 text-h1 font-bold leading-none">{c.valeur}</p>
                  <p className="etiquette mt-2 text-muet">{c.libelle}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Conteneur>
    </section>
  )
}
