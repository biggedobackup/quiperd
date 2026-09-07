import { createFileRoute, type SearchSchemaInput } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { icone } from '@/lib/icones'
import { formatDateHeure, formatIdentifiant } from '@/lib/format'
import { libellesActionsAudit } from '@/lib/statuts'
import { optionsJournal, optionsUtilisateur } from '@/lib/requetes'
import type { JournalAudit } from '@/models/administration'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Select } from '@/components/partages/select/select'
import { DataTable, type Colonne } from '@/components/partages/data-table/data-table'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Pagination } from '@/components/partages/pagination/pagination'
import { NomUtilisateur } from '@/components/admin/nom-utilisateur'

export const Route = createFileRoute('/admin/_prive/journal-audit')({
  head: () => ({ meta: [{ title: 'Administration — Journal d’audit' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    action: typeof s.action === 'string' ? s.action : '',
    page: typeof s.page === 'number' && s.page > 0 ? Math.floor(s.page) : 1,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const liste = await context.queryClient.ensureQueryData(optionsJournal(deps.action, deps.page))
    // Pseudos des joueurs acteurs de la page (détail par identifiant, mis en cache) pour un rendu serveur complet.
    const ids = [...new Set(liste.elements.flatMap((j) => (j.utilisateurId ? [j.utilisateurId] : [])))]
    await Promise.all(ids.map((id) => context.queryClient.prefetchQuery(optionsUtilisateur(id))))
  },
  component: PageJournal,
})

function PageJournal() {
  const { action, page } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isPending, isPlaceholderData } = useQuery({ ...optionsJournal(action, page), placeholderData: keepPreviousData })

  const colonnes: Colonne<JournalAudit>[] = [
    { cle: 'date', entete: 'Date', rendu: (j) => <span className="chiffres whitespace-nowrap">{formatDateHeure(j.dateCreation)}</span> },
    {
      cle: 'action',
      entete: 'Action',
      rendu: (j) => (
        <div>
          <p className="font-bold">{libellesActionsAudit[j.action] ?? j.action}</p>
          <p className="chiffres text-[11px] text-muet">{j.action}</p>
        </div>
      ),
    },
    {
      cle: 'acteur',
      entete: 'Acteur',
      rendu: (j) => (j.administrateurId ? <span className="etiquette text-info">Admin</span> : j.utilisateurId ? <NomUtilisateur id={j.utilisateurId} /> : <span className="text-muet">Système</span>),
    },
    { cle: 'cible', entete: 'Cible', rendu: (j) => <span className="chiffres text-[12px]">{j.tableCible} {j.identifiantCible ? formatIdentifiant(j.identifiantCible) : ''}</span>, secondaire: true },
    {
      cle: 'valeurs',
      entete: 'Valeurs',
      rendu: (j) => (
        <span className="chiffres block max-w-xs truncate text-[11px] text-muet" title={`${j.ancienneValeur ?? ''} → ${j.nouvelleValeur ?? ''}`}>
          {j.ancienneValeur ? `${j.ancienneValeur} → ` : ''}
          {j.nouvelleValeur ?? '—'}
        </span>
      ),
      secondaire: true,
    },
    { cle: 'ip', entete: 'IP', rendu: (j) => <span className="chiffres text-[11px] text-muet">{j.adresseIp ?? '—'}</span>, secondaire: true },
  ]

  return (
    <>
      <EnTetePage surtitre="Traçabilité" titre="Journal d’audit" description="Lecture seule : toute action financière ou administrative notable, avec son auteur et son adresse IP." />
      <div className="mb-4 lg:max-w-sm">
        <Select aria-label="Filtrer par action" placeholder="Toutes les actions" options={Object.entries(libellesActionsAudit).map(([valeur, libelle]) => ({ valeur, libelle }))} value={action} onChange={(e) => navigate({ search: { action: e.target.value, page: 1 } })} />
      </div>
      <div className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={isPlaceholderData || undefined}>
        <DataTable colonnes={colonnes} lignes={data?.elements ?? []} cleLigne={(j) => j.id} chargement={isPending} legende="Journal d'audit" vide={<EmptyState icone={icone.tableau} titre="Aucune entrée" description="Aucune action enregistrée pour ce filtre." />} />
      </div>
      {data && data.total > 0 && <Pagination page={page} pages={data.pages} total={data.total} onChanger={(p) => navigate({ search: (prev) => ({ ...prev, page: p }) })} className="mt-4" />}
    </>
  )
}
