import { useState, type ReactNode } from 'react'
import { Link, createFileRoute, getRouteApi, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateRelative, formatMontant } from '@/lib/format'
import { estCategorie, optionsCategories, optionsJeuxGroupees, optionsPlateformesGroupees } from '@/lib/catalogue'
import { optionsDefis, optionsJeux, optionsMesDefis, optionsPlateformes } from '@/lib/requetes'
import { annulerDefi } from '@/services/defis'
import type { DefiListe } from '@/models/defi'
import type { CategorieJeu } from '@/models/jeu'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { CarteDefi } from '@/components/joueur/carte-defi'
import { Button, LienBouton } from '@/components/partages/button/button'
import { Select } from '@/components/partages/select/select'
import { Input } from '@/components/partages/input/input'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonCarte } from '@/components/partages/skeleton/skeleton'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

interface Recherche {
  onglet: 'ouverts' | 'mes'
  categorie?: CategorieJeu
  jeu?: string
  plateforme?: string
  miseMax?: number
}

export const Route = createFileRoute('/joueur/defis/')({
  head: () => ({ meta: [{ title: 'Défis — QUI PERD' }] }),
  // `& SearchSchemaInput` : les paramètres d'entrée sont tous optionnels (un <Link> sans `search` reste valide).
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput): Recherche => ({
    onglet: s.onglet === 'mes' ? 'mes' : 'ouverts',
    categorie: estCategorie(s.categorie) ? s.categorie : undefined,
    jeu: typeof s.jeu === 'string' && s.jeu ? s.jeu : undefined,
    plateforme: typeof s.plateforme === 'string' && s.plateforme ? s.plateforme : undefined,
    miseMax: typeof s.miseMax === 'number' && s.miseMax > 0 ? s.miseMax : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsJeux()),
      context.queryClient.ensureQueryData(optionsPlateformes()),
      deps.onglet === 'mes'
        ? context.queryClient.ensureQueryData(optionsMesDefis)
        : context.queryClient.ensureQueryData(optionsDefis({ categorie: deps.categorie, jeu: deps.jeu, plateforme: deps.plateforme, miseMax: deps.miseMax })),
    ])
  },
  component: ListeDefis,
})

function ListeDefis() {
  const recherche = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur
  const jeux = useQuery(optionsJeux())
  const plateformes = useQuery(optionsPlateformes())
  const filtres = { categorie: recherche.categorie, jeu: recherche.jeu, plateforme: recherche.plateforme, miseMax: recherche.miseMax }
  const ouverts = useQuery({ ...optionsDefis(filtres), enabled: recherche.onglet === 'ouverts' })
  const mes = useQuery({ ...optionsMesDefis, enabled: recherche.onglet === 'mes' })
  const filtreActif = Boolean(recherche.categorie || recherche.jeu || recherche.plateforme || recherche.miseMax)
  const jeuxFiltres = recherche.categorie ? (jeux.data ?? []).filter((j) => j.categorie === recherche.categorie) : (jeux.data ?? [])

  const changer = (patch: Partial<Recherche>) => navigate({ search: (prev) => ({ ...prev, ...patch }) })
  const effacer = () => changer({ categorie: undefined, jeu: undefined, plateforme: undefined, miseMax: undefined })

  return (
    <>
      <EnTetePage
        surtitre="Arène"
        titre="Défis"
        description="Les défis ouverts de tous les joueurs, et les vôtres."
        actions={
          <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
            Créer un défi
          </LienBouton>
        }
      />

      <div className="mb-6 flex flex-col gap-4">
        <div role="tablist" className="inline-flex self-start border-2 border-encre bg-papier">
          <Onglet actif={recherche.onglet === 'ouverts'} onClick={() => changer({ onglet: 'ouverts' })}>
            Défis ouverts
          </Onglet>
          <Onglet actif={recherche.onglet === 'mes'} onClick={() => changer({ onglet: 'mes' })}>
            Mes défis
          </Onglet>
        </div>
        {recherche.onglet === 'ouverts' && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Select
              aria-label="Filtrer par catégorie"
              placeholder="Toutes les catégories"
              options={optionsCategories}
              value={recherche.categorie ?? ''}
              onChange={(e) => changer({ categorie: estCategorie(e.target.value) ? e.target.value : undefined, jeu: undefined })}
            />
            <Select
              aria-label="Filtrer par jeu"
              placeholder="Tous les jeux"
              groupes={optionsJeuxGroupees(jeuxFiltres)}
              value={recherche.jeu ?? ''}
              onChange={(e) => changer({ jeu: e.target.value || undefined })}
            />
            <Select
              aria-label="Filtrer par plateforme"
              placeholder="Toutes les plateformes"
              groupes={optionsPlateformesGroupees(plateformes.data ?? [])}
              value={recherche.plateforme ?? ''}
              onChange={(e) => changer({ plateforme: e.target.value || undefined })}
            />
            <Input
              aria-label="Mise maximale"
              type="number"
              min={0}
              step={100}
              placeholder="Mise max"
              suffixe="FCFA"
              value={recherche.miseMax ?? ''}
              onChange={(e) => changer({ miseMax: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        )}
      </div>

      {recherche.onglet === 'ouverts' ? (
        ouverts.isPending ? (
          <SkeletonCarte nombre={6} />
        ) : ouverts.data && ouverts.data.length > 0 ? (
          <Cascade className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ouverts.data.map((d) => (
              <ElementCascade key={d.id}>
                <CarteDefi defi={d} mien={d.createurId === moi.id} />
              </ElementCascade>
            ))}
          </Cascade>
        ) : (
          <EmptyState
            icone={icone.defi}
            titre="Aucun défi disponible, créez le premier !"
            description={filtreActif ? 'Aucun défi ne correspond à ces filtres.' : 'Votre mise sera bloquée en séquestre jusqu’à ce qu’un adversaire rejoigne.'}
            action={
              <div className="flex flex-wrap gap-2">
                {filtreActif && (
                  <Button variante="secondaire" onClick={effacer}>
                    Effacer les filtres
                  </Button>
                )}
                <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
                  Créer un défi
                </LienBouton>
              </div>
            }
          />
        )
      ) : mes.isPending ? (
        <SkeletonCarte nombre={3} />
      ) : mes.data && mes.data.length > 0 ? (
        <MesDefis defis={mes.data} />
      ) : (
        <EmptyState
          icone={icone.ticket}
          titre="Vous n’avez encore créé aucun défi"
          action={
            <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
              Créer mon premier défi
            </LienBouton>
          }
        />
      )}
    </>
  )
}

function Onglet({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      className={`etiquette h-10 px-4 transition-colors ${actif ? 'bg-encre text-craie' : 'text-muet hover:bg-volt-fond hover:text-encre'}`}
    >
      {children}
    </button>
  )
}

function MesDefis({ defis }: { defis: DefiListe[] }) {
  const queryClient = useQueryClient()
  const annuler = useServerFn(annulerDefi)
  const [aAnnuler, setAAnnuler] = useState<DefiListe | null>(null)
  const mutation = useMutation({
    mutationFn: (id: string) => annuler({ data: { id } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toastErreur('Annulation impossible', r.message)
        return
      }
      toastSucces('Défi annulé', 'Votre mise vous a été rendue sur votre solde disponible, moins la commission.')
      setAAnnuler(null)
      void queryClient.invalidateQueries({ queryKey: cles.defis.tous })
      void queryClient.invalidateQueries({ queryKey: cles.portefeuille.tous })
    },
  })

  return (
    <>
      <Cascade className="divide-y-2 divide-trait border-2 border-encre bg-papier">
        {defis.map((d) => (
          <ElementCascade key={d.id}>
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeStatut famille="defi" valeur={d.statut} />
                  <span className="chiffres text-h3 font-bold">{formatMontant(d.montantMise, d.devise)}</span>
                </div>
                <p className="mt-1 text-legende text-muet">
                  {d.jeuNom} · {d.plateformeNom} · créé {formatDateRelative(d.dateCreation)}
                  {d.statut === 'ouvert' && d.dateExpiration && ` · expire ${formatDateRelative(d.dateExpiration)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/joueur/defis/$defiId" params={{ defiId: d.id }} className="etiquette flex h-9 items-center gap-2 border-2 border-encre px-3 hover:bg-volt hover:text-nuit">
                  Détail <FontAwesomeIcon icon={icone.suivant} />
                </Link>
                {d.statut === 'ouvert' && (
                  <Button variante="danger" taille="sm" onClick={() => setAAnnuler(d)} iconeDebut={icone.interdire}>
                    Annuler
                  </Button>
                )}
              </div>
            </div>
          </ElementCascade>
        ))}
      </Cascade>
      <ConfirmModal
        ouvert={aAnnuler !== null}
        onFermer={() => setAAnnuler(null)}
        onConfirmer={() => aAnnuler && mutation.mutate(aAnnuler.id)}
        titre="Annuler ce défi ?"
        variante="danger"
        libelleConfirmer="Annuler le défi"
        libelleAnnuler="Garder"
        chargement={mutation.isPending}
      >
        <p>
          Le défi de <strong className="chiffres">{aAnnuler && formatMontant(aAnnuler.montantMise)}</strong> sera retiré de l’arène et votre mise sera
          remboursée, moins la commission de la plateforme.
        </p>
      </ConfirmModal>
    </>
  )
}
