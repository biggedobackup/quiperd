import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatMontant, formatPourcentage } from '@/lib/format'
import type { ReglesFinancieres } from '@/models/administration'
import { LienBouton } from '@/components/partages/button/button'

/**
 * Hero : promesse à gauche, visuel de la maquette à droite.
 *
 * Les textes sont ceux du site en ligne, au mot près ; seule la mise en forme change. Les
 * trois chiffres du bas viennent de `GET /api/configurations-financieres` — jamais écrits en dur.
 *
 * Un joueur connecté voit « Créer un défi », jamais « Créer un compte ».
 */
export function Hero({ regles, connecte, nombreDefis }: { regles: ReglesFinancieres; connecte: boolean; nombreDefis: number }) {
  return (
    <section className="border-b border-trait bg-craie">
      {/* La colonne du visuel est la plus large : l'image est le premier argument de la page.
          Le titre reste plafonné à `display-md` : en Unbounded, « REMPORTEZ. » à 4,5 rem déborde
          de la colonne de texte et passe sous l'image. */}
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,480px)_1fr] lg:gap-8 lg:py-12">
        <div>
          <p className="etiquette inline-flex items-center gap-2 rounded-full bg-vert px-4 py-2.5 text-craie">
            <FontAwesomeIcon icon={icone.jeu} /> Défis 1 contre 1 · tous les jeux
          </p>
          <h1 className="mt-6 text-display-sm md:text-display-md">
            Défiez.
            <br />
            Misez.
            <br />
            <span className="text-vert">Remportez.</span>
          </h1>
          <p className="mt-6 max-w-lg text-corps text-muet">
            Créez un défi, un adversaire le rejoint, vous jouez le match. Les deux mises sont bloquées en sécurité, le gagnant
            récupère les mises, moins {formatPourcentage(regles.commissionDefi)} de commission.
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

          <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-trait pt-6">
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
              <dd className="chiffres mt-1 text-h3 font-bold text-vert">
                {formatPourcentage(regles.commissionDefi)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          {/*
            `width`/`height` réels : la place est réservée avant le chargement, la page ne saute
            pas (CLS). `fetchPriority=high` : c'est la plus grande image visible d'emblée, elle
            doit passer devant le reste de la file de téléchargement.
          */}
          {/*
            WebP d'abord, JPEG en repli : moitié moins d'octets pour la plus grosse image
            de la page d'accueil (58 Ko contre 116), sans rien changer au rendu. `<picture>`
            plutôt qu'un simple `src` : les navigateurs qui ignorent WebP prennent le JPEG.
          */}
          <picture>
            <source srcSet="/images/hero-gaming.webp" type="image/webp" />
            <img
              src="/images/hero-gaming.jpg"
              alt="Écran de jeu, manette et casque : les défis QUI PERD se jouent sur PlayStation, Xbox, PC et mobile."
              width={1077}
              height={705}
              fetchPriority="high"
              decoding="async"
              className="h-auto w-full"
            />
          </picture>
        </div>
      </div>
    </section>
  )
}
