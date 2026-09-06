import { createFileRoute, getRouteApi, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { icone } from '@/lib/icones'
import { statuts } from '@/lib/statuts'
import { optionsMatchs } from '@/lib/requetes'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { CarteMatch } from '@/components/joueur/carte-match'
import { LienBouton } from '@/components/partages/button/button'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonCarte } from '@/components/partages/skeleton/skeleton'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'

const routeJoueur = getRouteApi('/joueur')
const STATUTS = ['', 'en_cours', 'verification', 'litige', 'termine'] as const

export const Route = createFileRoute('/joueur/matchs/')({
  head: () => ({ meta: [{ title: 'Mes matchs — QUI PERD' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    statut: typeof s.statut === 'string' && (STATUTS as readonly string[]).includes(s.statut) ? (s.statut as (typeof STATUTS)[number]) : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(optionsMatchs(deps.statut || undefined))
  },
  component: MesMatchs,
})

function MesMatchs() {
  const { statut } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { session } = routeJoueur.useRouteContext()
  const { data, isPending } = useQuery(optionsMatchs(statut || undefined))

  return (
    <>
      <EnTetePage surtitre="Arène" titre="Mes matchs" description="Tous vos matchs, du premier coup d’envoi au règlement." />
      <div role="tablist" className="mb-6 inline-flex max-w-full overflow-x-auto border-2 border-encre bg-papier">
        {STATUTS.map((s) => (
          <button
            key={s || 'tous'}
            type="button"
            role="tab"
            aria-selected={statut === s}
            onClick={() => navigate({ search: { statut: s } })}
            className={`etiquette h-10 shrink-0 px-4 transition-colors ${statut === s ? 'bg-encre text-craie' : 'text-muet hover:bg-volt-fond hover:text-encre'}`}
          >
            {s ? statuts.match[s]?.libelle : 'Tous'}
          </button>
        ))}
      </div>
      {isPending ? (
        <SkeletonCarte nombre={4} />
      ) : data && data.length > 0 ? (
        <Cascade className="grid gap-3 lg:grid-cols-2">
          {data.map((m) => (
            <ElementCascade key={m.id} className="h-full">
              <CarteMatch match={m} moiId={session.utilisateur.id} />
            </ElementCascade>
          ))}
        </Cascade>
      ) : (
        <EmptyState
          icone={icone.match}
          titre={statut ? 'Aucun match dans cet état' : 'Aucun match pour l’instant'}
          description="Un match est créé dès qu’un défi est rejoint : par vous, ou par un adversaire sur l’un de vos défis."
          action={
            <LienBouton to="/joueur/defis" variante="volt" iconeDebut={icone.defi}>
              Voir les défis ouverts
            </LienBouton>
          }
        />
      )}
    </>
  )
}
