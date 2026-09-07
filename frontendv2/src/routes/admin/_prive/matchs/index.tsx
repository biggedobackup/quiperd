import { createFileRoute, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant } from '@/lib/format'
import { optionsMatchsAdmin } from '@/lib/requetes'
import type { MatchEnrichi } from '@/models/match'
import { salons } from '@/temps-reel/evenements'
import { useEvenement } from '@/temps-reel/hooks'
import { AIDE_STATUT_MATCH, STATUTS_MATCH_ADMIN, libelleStatutMatch } from '@/components/admin/statuts-match'
import { BandeauNouveautes, useFileTempsReel } from '@/components/admin/temps-reel-admin'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { DataTable, type Colonne } from '@/components/partages/data-table/data-table'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Pagination } from '@/components/partages/pagination/pagination'

export const Route = createFileRoute('/admin/_prive/matchs/')({
  head: () => ({ meta: [{ title: 'Administration — Matchs' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    // `verification` a quitté le parcours joueur : le filtre par défaut ne peut plus être lui,
    // il n'y aurait plus rien à montrer. On ouvre sur la liste complète.
    statut:
      typeof s.statut === 'string' && (STATUTS_MATCH_ADMIN as readonly string[]).includes(s.statut)
        ? (s.statut as (typeof STATUTS_MATCH_ADMIN)[number])
        : '',
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
  const queryClient = useQueryClient()
  const { data, isPending, isPlaceholderData } = useQuery({ ...optionsMatchsAdmin(statut, page), placeholderData: keepPreviousData })

  // Preuves déposées pendant la lecture : annoncées, jamais insérées de force dans le tableau.
  const file = useFileTempsReel()
  useEvenement('admin.preuve_a_verifier', ({ preuveId }) => file.signaler(preuveId), salons.admin)

  const afficherNouveaux = () => {
    file.vider()
    void queryClient.invalidateQueries({ queryKey: cles.matchs.tous })
    if (page !== 1) void navigate({ search: (prev) => ({ ...prev, page: 1 }) })
  }

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
      <EnTetePage
        surtitre="Arbitrage"
        titre="Matchs & preuves"
        description="Deux déclarations concordantes règlent le match immédiatement, sans preuve ni arbitre. Les preuves ne sont exigées qu’en cas de désaccord."
      />
      <div role="tablist" className="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-trait bg-papier p-1">
        {STATUTS_MATCH_ADMIN.map((s) => (
          <button
            key={s || 'tous'}
            type="button"
            role="tab"
            aria-selected={statut === s}
            onClick={() => navigate({ search: { statut: s, page: 1 } })}
            className={`etiquette h-11 shrink-0 rounded-full px-4 transition-colors ${statut === s ? 'bg-vert text-craie' : 'text-muet hover:bg-vert-pale hover:text-vert'}`}
          >
            {libelleStatutMatch(s)}
          </button>
        ))}
      </div>
      <p className="mb-4 max-w-3xl text-legende text-muet">{AIDE_STATUT_MATCH[statut]}</p>
      <BandeauNouveautes nombre={file.nombre} singulier="nouvelle preuve à vérifier" plurielForme="nouvelles preuves à vérifier" onAfficher={afficherNouveaux} className="mb-4" />
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
