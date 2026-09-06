import { createFileRoute, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { icone } from '@/lib/icones'
import { statuts } from '@/lib/statuts'
import { formatDateHeure, formatMontant } from '@/lib/format'
import { optionsMatchsAdmin } from '@/lib/requetes'
import type { MatchEnrichi } from '@/models/match'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { DataTable, type Colonne } from '@/components/partages/data-table/data-table'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Pagination } from '@/components/partages/pagination/pagination'

const STATUTS = ['', 'en_cours', 'verification', 'litige', 'termine'] as const

export const Route = createFileRoute('/admin/_prive/matchs/')({
  head: () => ({ meta: [{ title: 'Administration — Matchs' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    statut: typeof s.statut === 'string' && (STATUTS as readonly string[]).includes(s.statut) ? (s.statut as (typeof STATUTS)[number]) : 'verification',
    page: typeof s.page === 'number' && s.page > 0 ? Math.floor(s.page) : 1,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(optionsMatchsAdmin(deps.statut, deps.page))
  },
  component: PageMatchsAdmin,
})

function PageMatchsAdmin() {
  const { statut, page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data, isPending, isPlaceholderData } = useQuery({ ...optionsMatchsAdmin(statut, page), placeholderData: keepPreviousData })

  const colonnes: Colonne<MatchEnrichi>[] = [
    {
      cle: 'joueurs',
      entete: 'Match',
      rendu: (m) => (
        <span className="font-bold">
          {m.joueur1Nom} <span className="chiffres text-muet">{m.scoreJoueur1 ?? '–'} — {m.scoreJoueur2 ?? '–'}</span> {m.joueur2Nom}
        </span>
      ),
    },
    { cle: 'jeu', entete: 'Jeu', rendu: (m) => `${m.jeuNom} · ${m.plateformeNom}`, secondaire: true },
    { cle: 'mise', entete: 'Mise', droite: true, rendu: (m) => formatMontant(m.montantMise, m.devise) },
    { cle: 'statut', entete: 'Statut', rendu: (m) => <BadgeStatut famille="match" valeur={m.statut} /> },
    { cle: 'date', entete: 'Créé le', rendu: (m) => <span className="chiffres">{formatDateHeure(m.dateCreation)}</span>, secondaire: true },
  ]

  return (
    <>
      <EnTetePage surtitre="Arbitrage" titre="Matchs & preuves" description="Un match en vérification est réglé automatiquement dès que chaque joueur a une preuve validée." />
      <div role="tablist" className="mb-4 inline-flex max-w-full overflow-x-auto border-2 border-encre bg-papier">
        {STATUTS.map((s) => (
          <button key={s || 'tous'} type="button" role="tab" aria-selected={statut === s} onClick={() => navigate({ search: { statut: s, page: 1 } })} className={`etiquette h-10 shrink-0 px-4 transition-colors ${statut === s ? 'bg-encre text-craie' : 'text-muet hover:bg-volt-fond hover:text-encre'}`}>
            {s ? statuts.match[s]?.libelle : 'Tous'}
          </button>
        ))}
      </div>
      <div className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={isPlaceholderData || undefined}>
        <DataTable
          colonnes={colonnes}
          lignes={data?.elements ?? []}
          cleLigne={(m) => m.id}
          chargement={isPending}
          legende="Matchs"
          onClicLigne={(m) => navigate({ to: '/admin/matchs/$matchId', params: { matchId: m.id } })}
          vide={<EmptyState icone={icone.match} titre="Aucun match" description={statut ? 'Aucun match dans cet état.' : 'Aucun match joué pour le moment.'} />}
        />
      </div>
      {data && data.total > 0 && <Pagination page={page} pages={data.pages} total={data.total} onChanger={(p) => navigate({ search: (prev) => ({ ...prev, page: p }) })} className="mt-4" />}
    </>
  )
}
