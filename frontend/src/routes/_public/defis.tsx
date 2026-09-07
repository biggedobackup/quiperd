import { createFileRoute, getRouteApi, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { icone } from '@/lib/icones'
import { CATEGORIES_JEU, estCategorie, estFamille, optionsFamilles, optionsJeuxGroupees, optionsPlateformesGroupees } from '@/lib/catalogue'
import { optionsDefisOuverts, optionsJeux, optionsPlateformes } from '@/lib/requetes'
import type { FiltresDefisPublics } from '@/models/defi'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { Conteneur, EnTetePublique } from '@/components/public/sections'
import { CarteDefiPublique } from '@/components/public/carte-defi-publique'
import { useDefisEnDirect } from '@/components/partages/defis-en-direct/defis-en-direct'
import { ElementAnime, ListeAnimee } from '@/components/partages/defis-en-direct/animation-defis'
import { Puce } from '@/components/partages/puce/puce'
import { Select } from '@/components/partages/select/select'
import { Input } from '@/components/partages/input/input'
import { Button, LienBouton } from '@/components/partages/button/button'
import { EmptyState } from '@/components/partages/empty-state/empty-state'

const routeParent = getRouteApi('/_public')

export const Route = createFileRoute('/_public/defis')({
  head: () => ({
    meta: [
      { title: 'Défis ouverts — Défis en Ligne' },
      {
        name: 'description',
        content: 'Tous les défis en attente d’un adversaire, en direct : choisissez votre jeu, votre plateforme, votre mise et rejoignez la partie.',
      },
    ],
  }),
  // `& SearchSchemaInput` : tous les filtres sont optionnels (un <Link to="/defis"> sans `search` reste valide).
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput): FiltresDefisPublics => ({
    categorie: estCategorie(s.categorie) ? s.categorie : undefined,
    famille: estFamille(s.famille) ? s.famille : undefined,
    jeu: typeof s.jeu === 'string' && s.jeu ? s.jeu : undefined,
    plateforme: typeof s.plateforme === 'string' && s.plateforme ? s.plateforme : undefined,
    miseMax: typeof s.miseMax === 'number' && s.miseMax > 0 ? s.miseMax : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsJeux()),
      context.queryClient.ensureQueryData(optionsPlateformes()),
      context.queryClient.ensureQueryData(optionsDefisOuverts(deps)),
    ])
  },
  component: PageDefisPublics,
})

function PageDefisPublics() {
  const { connecte } = routeParent.useLoaderData()
  const filtres = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: jeux } = useSuspenseQuery(optionsJeux())
  const { data: plateformes } = useSuspenseQuery(optionsPlateformes())
  const { data: defis } = useSuspenseQuery(optionsDefisOuverts(filtres))

  // Le serveur pousse : un défi créé apparaît en tête, un défi rejoint, annulé ou expiré
  // s'efface. Le visiteur n'a pas de compte, seul le salon public est demandé.
  useDefisEnDirect()

  const changer = (patch: Partial<FiltresDefisPublics>) => navigate({ search: (prev) => ({ ...prev, ...patch }) })
  const filtreActif = Boolean(filtres.categorie || filtres.famille || filtres.jeu || filtres.plateforme || filtres.miseMax)
  const jeuxFiltres = filtres.categorie ? jeux.filter((j) => j.categorie === filtres.categorie) : jeux
  const plateformesFiltrees = filtres.famille ? plateformes.filter((p) => p.famille === filtres.famille) : plateformes

  return (
    <>
      <div>
        <EnTetePublique
          fond="noir"
          surtitre={
            <>
              Arène publique
              {/* État réel du fil, pas une étiquette décorative : il annonce aussi le nombre de joueurs connectés. */}
              <IndicateurDirect variante="etiquette" avecCompteur cliquable />
            </>
          }
          titre="Défis en attente d’adversaire."
          intro="Chaque ticket est un défi dont la mise est déjà bloquée. Rejoignez-le : votre mise est bloquée à son tour et le match commence."
        >
          {connecte ? (
            <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
              Créer un défi
            </LienBouton>
          ) : (
            <LienBouton to="/inscription" variante="volt" iconeFin={icone.suivant}>
              Créer un compte pour jouer
            </LienBouton>
          )}
          <LienBouton to="/comment-ca-marche" variante="secondaire">
            Comment ça marche
          </LienBouton>
        </EnTetePublique>
      </div>

      <section className="border-b border-trait bg-ardoise">
        <Conteneur className="py-6">
          <div role="tablist" aria-label="Catégorie de jeu" className="flex flex-wrap gap-2">
            <Puce actif={!filtres.categorie} onClick={() => changer({ categorie: undefined, jeu: undefined })}>
              Toutes
            </Puce>
            {CATEGORIES_JEU.map((c) => (
              <Puce key={c.valeur} actif={filtres.categorie === c.valeur} icone={c.icone} onClick={() => changer({ categorie: c.valeur, jeu: undefined })}>
                {c.libelle}
              </Puce>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Select
              aria-label="Filtrer par jeu"
              placeholder="Tous les jeux"
              groupes={optionsJeuxGroupees(jeuxFiltres)}
              value={filtres.jeu ?? ''}
              onChange={(e) => changer({ jeu: e.target.value || undefined })}
            />
            <Select
              aria-label="Filtrer par famille de plateforme"
              placeholder="PC, consoles et mobile"
              options={optionsFamilles}
              value={filtres.famille ?? ''}
              onChange={(e) => changer({ famille: estFamille(e.target.value) ? e.target.value : undefined, plateforme: undefined })}
            />
            <Select
              aria-label="Filtrer par plateforme"
              placeholder="Toutes les plateformes"
              groupes={optionsPlateformesGroupees(plateformesFiltrees)}
              value={filtres.plateforme ?? ''}
              onChange={(e) => changer({ plateforme: e.target.value || undefined })}
            />
            <Input
              aria-label="Mise maximale"
              type="number"
              min={0}
              step={100}
              placeholder="Mise max"
              suffixe="FCFA"
              value={filtres.miseMax ?? ''}
              onChange={(e) => changer({ miseMax: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        </Conteneur>
      </section>

      <section className="bg-craie py-12 md:py-16">
        <Conteneur>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="chiffres text-legende text-muet">
              {defis.length} {defis.length > 1 ? 'défis ouverts' : 'défi ouvert'}
              {filtreActif && ' avec ces filtres'}
            </p>
            {filtreActif && (
              <Button
                variante="fantome"
                taille="sm"
                iconeDebut={icone.fermer}
                onClick={() => changer({ categorie: undefined, famille: undefined, jeu: undefined, plateforme: undefined, miseMax: undefined })}
              >
                Effacer les filtres
              </Button>
            )}
          </div>
          {defis.length === 0 ? (
            <EmptyState
              icone={icone.defi}
              titre={filtreActif ? 'Aucun défi ne correspond à ces filtres' : 'Aucun défi en attente pour le moment'}
              description={
                filtreActif
                  ? 'Élargissez la recherche ou créez le défi que vous cherchez : un adversaire le trouvera ici.'
                  : 'Soyez le premier à lancer un défi : votre mise reste en séquestre et vous est rendue en totalité si personne ne rejoint.'
              }
              action={
                connecte ? (
                  <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
                    Créer un défi
                  </LienBouton>
                ) : (
                  <LienBouton to="/inscription" variante="volt" iconeFin={icone.suivant}>
                    Créer un compte
                  </LienBouton>
                )
              }
            />
          ) : (
            <ListeAnimee className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {defis.map((d, i) => (
                <ElementAnime key={d.id} index={i}>
                  <CarteDefiPublique defi={d} connecte={connecte} />
                </ElementAnime>
              ))}
            </ListeAnimee>
          )}
          <p className="mt-8 flex flex-wrap items-center gap-2 text-legende text-muet">
            <IndicateurDirect cliquable /> Les défis arrivent et disparaissent d’eux-mêmes : rien à rafraîchir.
          </p>
        </Conteneur>
      </section>
    </>
  )
}
