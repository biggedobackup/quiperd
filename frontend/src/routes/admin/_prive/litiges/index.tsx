import { createFileRoute, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatIdentifiant, pluriel } from '@/lib/format'
import { optionsDetailMatch, optionsLitigesAdmin, optionsStatistiques } from '@/lib/requetes'
import type { Litige } from '@/models/litige'
import { salons } from '@/temps-reel/evenements'
import { useEvenement } from '@/temps-reel/hooks'
import { BandeauNouveautes, useFileTempsReel } from '@/components/admin/temps-reel-admin'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { DataTable, type Colonne } from '@/components/partages/data-table/data-table'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Pagination } from '@/components/partages/pagination/pagination'

/** Match d'un litige (noms des joueurs) : détail par identifiant, mis en cache — les noms ne changent pas. */
const optionsMatchLitige = (matchId: string) => ({ ...optionsDetailMatch(matchId, 'admin'), staleTime: 60_000 })

export const Route = createFileRoute('/admin/_prive/litiges/')({
  head: () => ({ meta: [{ title: 'Administration — Litiges' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    page: typeof s.page === 'number' && s.page > 0 ? Math.floor(s.page) : 1,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const [liste] = await Promise.all([context.queryClient.ensureQueryData(optionsLitigesAdmin(deps.page)), context.queryClient.prefetchQuery(optionsStatistiques)])
    // Joueurs de chaque match de la page, préchargés pour un rendu serveur complet.
    await Promise.all(liste.elements.map((l) => context.queryClient.prefetchQuery(optionsMatchLitige(l.matchId))))
  },
  component: PageLitigesAdmin,
})

function PageLitigesAdmin() {
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data, isPending, isPlaceholderData } = useQuery({ ...optionsLitigesAdmin(page), placeholderData: keepPreviousData })
  const statistiques = useQuery(optionsStatistiques)
  const ouverts = statistiques.data?.litigesOuverts

  // Un litige poussé pendant la lecture n'est PAS inséré dans le tableau : la pagination
  // glisserait sous le curseur. On l'annonce, l'administrateur affiche quand il veut.
  const file = useFileTempsReel()
  useEvenement('admin.litige_ouvert', ({ litigeId }) => file.signaler(litigeId), salons.admin)

  const afficherNouveaux = () => {
    file.vider()
    void queryClient.invalidateQueries({ queryKey: cles.litiges.tous })
    if (page !== 1) void navigate({ search: (prev) => ({ ...prev, page: 1 }) })
  }

  const colonnes: Colonne<Litige>[] = [
    { cle: 'match', entete: 'Match', rendu: (l) => <NomMatch matchId={l.matchId} /> },
    { cle: 'motif', entete: 'Motif', rendu: (l) => <span className="line-clamp-2 max-w-md">{l.motif}</span> },
    { cle: 'statut', entete: 'Statut', rendu: (l) => <BadgeStatut famille="litige" valeur={l.statut} /> },
    { cle: 'decision', entete: 'Décision', rendu: (l) => (l.decision === 'gagnant' ? 'Règlement au gagnant' : l.decision === 'remboursement' ? 'Remboursement' : '—'), secondaire: true },
    { cle: 'date', entete: 'Ouvert le', rendu: (l) => <span className="chiffres">{formatDateHeure(l.dateCreation)}</span>, secondaire: true },
  ]

  return (
    <>
      <EnTetePage
        surtitre="Arbitrage"
        titre="Litiges"
        description={ouverts === undefined ? 'Tous les litiges, du plus récent au plus ancien.' : `${ouverts} ${pluriel(ouverts, 'litige')} en attente de décision · liste du plus récent au plus ancien.`}
      />
      <BandeauNouveautes nombre={file.nombre} singulier="nouveau litige à arbitrer" plurielForme="nouveaux litiges à arbitrer" onAfficher={afficherNouveaux} className="mb-4" />
      <div className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={isPlaceholderData || undefined}>
        <DataTable
          colonnes={colonnes}
          lignes={data?.elements ?? []}
          cleLigne={(l) => l.id}
          chargement={isPending}
          legende="Litiges"
          onClicLigne={(l) => navigate({ to: '/admin/litiges/$litigeId', params: { litigeId: l.id } })}
          vide={<EmptyState icone={icone.arbitrage} titre="Aucun litige" description="Tous les matchs se règlent sans arbitre pour le moment." />}
        />
      </div>
      {data && data.total > 0 && <Pagination page={page} pages={data.pages} total={data.total} onChanger={(p) => navigate({ search: (prev) => ({ ...prev, page: p }) })} className="mt-4" />}
    </>
  )
}

function NomMatch({ matchId }: { matchId: string }) {
  const { data } = useQuery(optionsMatchLitige(matchId))
  if (!data) return <span className="chiffres">{formatIdentifiant(matchId)}</span>
  return (
    <span className="font-bold">
      {data.match.joueur1Nom} vs {data.match.joueur2Nom}
    </span>
  )
}
