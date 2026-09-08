import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from '@/lib/icones'
import type { LiensApplication } from '@/server/application-fns'
import { Conteneur, EnTeteSection } from './sections'

/**
 * Téléchargement de l'application joueur, présenté comme **deux téléphones** — c'est le
 * produit dont on parle, autant le montrer. Chaque téléphone porte son magasin et un bouton
 * de téléchargement à l'intérieur de l'écran.
 *
 * Les adresses viennent de l'environnement (`obtenirLiensApplication`). Une plateforme dont
 * l'adresse n'est pas renseignée n'affiche PAS un bouton mort : le bouton devient
 * « Bientôt disponible », gris et inerte. Sur une plateforme où l'on dépose de l'argent, un
 * lien de magasin qui ne mène nulle part coûte plus cher en confiance qu'une absence assumée.
 */
export function SectionApplication({ liens, numero = '02' }: { liens: LiensApplication; numero?: string }) {
  return (
    <section id="application" className="border-b border-trait bg-craie py-16 md:py-20">
      <Conteneur>
        <EnTeteSection
          numero={numero}
          titre="L’application Défis en Ligne"
          intro="Vos défis, vos matchs et votre solde dans la poche. Les notifications vous préviennent dès qu’un adversaire rejoint, déclare un résultat ou qu’un gain est crédité."
        />
        {/*
          Rangée centrée, et non une grille à deux colonnes : la grille donnait à chaque
          téléphone la moitié de la largeur du conteneur, si bien que les deux se retrouvaient
          à plus de 350 px l'un de l'autre sur un écran large. Ici ils gardent leur taille et
          se serrent au milieu ; `flex-wrap` les empile tout seuls quand la place manque.
        */}
        <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
          <Telephone
            // Tant que l'application n'est pas sur Google Play, elle se télécharge
            // directement. Écrire « Google Play » au-dessus d'un lien qui n'y mène pas
            // tromperait le joueur sur ce qui va se passer quand il appuie — et sur une
            // plateforme où l'on dépose de l'argent, c'est le genre de petite fausseté qui
            // coûte cher. Le libellé suit donc la destination réelle du lien.
            magasin={estLienMagasin(liens.android) ? 'Google Play' : 'Téléchargement direct'}
            plateforme="Android"
            iconeMarque={icone.android}
            lien={liens.android}
            detail={detailApk(liens)}
          />
          <Telephone
            magasin="App Store"
            plateforme="iPhone & iPad"
            iconeMarque={icone.apple}
            lien={liens.ios}
          />
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-legende text-muet">
          Même compte, même solde, mêmes règles que sur le site : ce que vous commencez sur un
          écran se termine sur l’autre.
        </p>
      </Conteneur>
    </section>
  )
}

/** Vrai si l'adresse mène à un magasin d'applications plutôt qu'à un fichier à installer. */
function estLienMagasin(lien: string | null): boolean {
  return !!lien && /play\.google\.com|apps\.apple\.com/.test(lien)
}

/**
 * Ligne d'information sous le bouton Android : version et poids, séparés par un point médian.
 *
 * Un magasin affiche déjà ces informations sur sa fiche ; un téléchargement direct, non. Or
 * c'est précisément là qu'elles comptent : le joueur est sur son forfait mobile et il a le
 * droit de savoir ce qu'il engage avant d'appuyer. Renvoie `null` si l'environnement ne
 * renseigne rien — mieux vaut ne rien afficher qu'un chiffre inventé.
 */
function detailApk(liens: LiensApplication): string | null {
  if (!liens.android || estLienMagasin(liens.android)) return null
  const morceaux = [liens.androidVersion && `Version ${liens.androidVersion}`, liens.androidTaille]
  const utiles = morceaux.filter(Boolean)
  return utiles.length ? utiles.join(' · ') : null
}

/**
 * Un téléphone dessiné en CSS : cadre noir épais, haut-parleur, écran, barre d'accueil.
 *
 * Pas d'image : le cadre suit la largeur disponible, reste net à tous les grossissements et
 * ne coûte aucun octet de plus. `aspect-[9/17]` lui donne des proportions de téléphone sans
 * hauteur figée — le contenu ne déborde donc jamais sur un texte plus long.
 */
function Telephone({
  magasin,
  plateforme,
  iconeMarque,
  lien,
  detail = null,
}: {
  magasin: string
  plateforme: string
  iconeMarque: IconDefinition
  lien: string | null
  /** Précision affichée sous le bouton (version, poids). Ignorée s'il n'y a pas de lien. */
  detail?: string | null
}) {
  return (
    <div className="w-full max-w-[260px]">
      <div className="flex aspect-[9/17] flex-col overflow-hidden rounded-[38px] border-[10px] border-encre bg-craie shadow-carte">
        {/* Haut-parleur : le seul détail qui fait lire la forme comme un téléphone. */}
        <div className="flex justify-center pb-1 pt-3">
          <span className="h-1.5 w-14 rounded-full bg-encre/20" aria-hidden="true" />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-encre text-[26px] text-craie" aria-hidden="true">
            <FontAwesomeIcon icon={iconeMarque} />
          </span>
          <span>
            <span className="block text-h3">{magasin}</span>
            <span className="mt-1 block text-legende text-muet">{plateforme}</span>
          </span>
        </div>

        <div className="px-4 pb-3">
          {lien ? (
            <a
              href={lien}
              // Magasin tiers : nouvel onglet, et `noopener` pour qu'il ne puisse pas
              // manipuler la page d'où l'on vient.
              target="_blank"
              rel="noopener noreferrer"
              className="etiquette flex min-h-11 items-center justify-center gap-2 rounded-xl bg-vert px-3 text-craie transition-colors hover:bg-vert-sombre"
            >
              Télécharger <FontAwesomeIcon icon={icone.suivant} />
            </a>
          ) : (
            <span
              // `aria-disabled` et non un `<button disabled>` : il n'y a aucune action à
              // désactiver, seulement un état à annoncer.
              aria-disabled="true"
              className="etiquette flex min-h-11 items-center justify-center rounded-xl border border-trait bg-gris px-3 text-muet"
            >
              Bientôt disponible
            </span>
          )}
          {lien && detail ? (
            <p className="mt-2 text-center text-legende text-muet">{detail}</p>
          ) : null}
        </div>

        {/* Barre d'accueil, en bas de l'écran comme sur un vrai téléphone. */}
        <div className="flex justify-center pb-2">
          <span className="h-1 w-20 rounded-full bg-encre/25" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
