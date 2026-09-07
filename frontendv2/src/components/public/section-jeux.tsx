import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone, iconePlateforme } from '@/lib/icones'
import { grouperJeux, grouperPlateformes } from '@/lib/catalogue'
import type { CategorieJeu, Jeu } from '@/models/jeu'
import type { Plateforme } from '@/models/plateforme'
import { Conteneur, EnTeteSection } from './sections'
import { Puce } from '@/components/partages/puce/puce'
import { LienBouton } from '@/components/partages/button/button'
import { ApparitionAuDefilement } from '@/components/partages/animation/animation'

/**
 * Catalogue par catégorie. `complete` (page Jeux) : puces de filtre + liste numérotée de chaque
 * catégorie. Sinon (accueil) : une carte noire par catégorie avec ses premiers titres.
 */
export function SectionJeux({ jeux, plateformes, numero = '02', complete = false }: { jeux: Jeu[]; plateformes: Plateforme[]; numero?: string; complete?: boolean }) {
  const [categorie, setCategorie] = useState<CategorieJeu | 'toutes'>('toutes')
  const groupes = grouperJeux(jeux)
  const visibles = categorie === 'toutes' ? groupes : groupes.filter((g) => g.categorie.valeur === categorie)
  const familles = grouperPlateformes(plateformes)

  return (
    <section id="jeux" className="border-b border-trait bg-craie py-16 md:py-20">
      <Conteneur>
        <EnTeteSection
          numero={numero}
          titre={complete ? 'Tout le catalogue' : 'Jeux disponibles'}
          intro={`${jeux.length} jeux compétitifs répartis en ${groupes.length} catégories, jouables sur ${plateformes.length} plateformes. Le catalogue est géré par l’équipe QUI PERD et suit les sorties.`}
        />

        {familles.length > 0 && (
          <div className="mb-8 grid gap-3 md:grid-cols-3">
            {familles.map((g) => (
              <div key={g.famille.valeur} className="rounded-2xl border border-trait bg-craie p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-vert text-craie">
                    <FontAwesomeIcon icon={g.famille.icone} />
                  </span>
                  <span className="etiquette">{g.famille.libelle}</span>
                  <span className="chiffres ml-auto text-legende text-muet">{g.plateformes.length}</span>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {g.plateformes.map((p) => (
                    <li key={p.id} className="etiquette flex items-center gap-1.5 rounded-full border border-trait px-2.5 py-1.5">
                      <FontAwesomeIcon icon={iconePlateforme(p.nom, p.famille)} className="text-muet" /> {p.nom}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {complete && groupes.length > 0 && (
          <div role="tablist" aria-label="Catégorie de jeu" className="mb-8 flex flex-wrap gap-2">
            <Puce actif={categorie === 'toutes'} onClick={() => setCategorie('toutes')} compte={jeux.length}>
              Toutes
            </Puce>
            {groupes.map((g) => (
              <Puce key={g.categorie.valeur} actif={categorie === g.categorie.valeur} onClick={() => setCategorie(g.categorie.valeur)} icone={g.categorie.icone} compte={g.jeux.length}>
                {g.categorie.libelle}
              </Puce>
            ))}
          </div>
        )}

        {jeux.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-trait px-6 py-10 text-muet">Aucun jeu actif pour le moment.</p>
        ) : complete ? (
          <div className="space-y-10">
            {visibles.map((g) => (
              <ApparitionAuDefilement key={g.categorie.valeur}>
                <div>
                  <header className="mb-4 flex flex-wrap items-center gap-3 border-b border-trait pb-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-vert text-craie">
                      <FontAwesomeIcon icon={g.categorie.icone} />
                    </span>
                    <div>
                      <h3 className="text-h2">{g.categorie.libelle}</h3>
                      <p className="text-legende text-muet">{g.categorie.description}</p>
                    </div>
                    <span className="chiffres ml-auto text-h3 font-bold">{String(g.jeux.length).padStart(2, '0')}</span>
                  </header>
                  <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {g.jeux.map((j, i) => (
                      <li key={j.id} className="flex items-center gap-3 rounded-xl border border-trait bg-craie px-4 py-3 transition-shadow duration-150 hover:shadow-carte">
                        <span className="chiffres text-legende text-muet">{String(i + 1).padStart(2, '0')}</span>
                        <span className="font-semibold">{j.nom}</span>
                        <FontAwesomeIcon icon={icone.jeu} className="ml-auto text-vert" />
                      </li>
                    ))}
                  </ol>
                </div>
              </ApparitionAuDefilement>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupes.map((g, i) => (
              <ApparitionAuDefilement key={g.categorie.valeur}>
                <article className="flex h-full flex-col rounded-2xl bg-encre p-6 text-craie">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="etiquette text-volt">Catégorie {String(i + 1).padStart(2, '0')}</span>
                      <h3 className="mt-2 text-h2 text-craie">{g.categorie.libelle}</h3>
                      <p className="mt-1 text-legende text-craie/70">{g.categorie.description}</p>
                    </div>
                    <FontAwesomeIcon icon={g.categorie.icone} className="text-3xl text-craie/40" />
                  </div>
                  <ul className="mt-6 space-y-1.5 text-legende">
                    {g.jeux.slice(0, 4).map((j) => (
                      <li key={j.id} className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-volt" aria-hidden="true" /> {j.nom}
                      </li>
                    ))}
                  </ul>
                  <p className="chiffres mt-auto pt-6 text-legende text-craie/60">
                    {g.jeux.length} {g.jeux.length > 1 ? 'jeux' : 'jeu'}
                    {g.jeux.length > 4 && ` · +${g.jeux.length - 4} autres`}
                  </p>
                </article>
              </ApparitionAuDefilement>
            ))}
          </div>
        )}

        {!complete && (
          <div className="mt-8">
            <LienBouton to="/jeux" variante="secondaire" iconeFin={icone.suivant}>
              Tout le catalogue
            </LienBouton>
          </div>
        )}
      </Conteneur>
    </section>
  )
}
