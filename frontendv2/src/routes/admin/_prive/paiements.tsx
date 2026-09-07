import { useState } from 'react'
import { createFileRoute, type SearchSchemaInput } from '@tanstack/react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant, formatReference } from '@/lib/format'
import { libellesPrestataires } from '@/lib/statuts'
import { optionsPaiements, optionsUtilisateur } from '@/lib/requetes'
import { changerStatutPaiement } from '@/services/paiements'
import type { Paiement, StatutPaiement } from '@/models/paiement'
import { salons } from '@/temps-reel/evenements'
import { useEvenement } from '@/temps-reel/hooks'
import { BandeauNouveautes, useFileTempsReel } from '@/components/admin/temps-reel-admin'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button } from '@/components/partages/button/button'
import { Select } from '@/components/partages/select/select'
import { DataTable, type Colonne } from '@/components/partages/data-table/data-table'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Pagination } from '@/components/partages/pagination/pagination'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'
import { NomUtilisateur } from '@/components/admin/nom-utilisateur'

type Cible = Extract<StatutPaiement, 'reussi' | 'echoue' | 'rembourse'>

export const Route = createFileRoute('/admin/_prive/paiements')({
  head: () => ({ meta: [{ title: 'Administration — Paiements' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    type: typeof s.type === 'string' ? s.type : '',
    statut: typeof s.statut === 'string' ? s.statut : 'en_attente',
    page: typeof s.page === 'number' && s.page > 0 ? Math.floor(s.page) : 1,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const liste = await context.queryClient.ensureQueryData(optionsPaiements(deps.type, deps.statut, deps.page))
    // Pseudos des joueurs de la page (détail par identifiant, mis en cache) pour un rendu serveur complet.
    await Promise.all([...new Set(liste.elements.map((p) => p.utilisateurId))].map((id) => context.queryClient.prefetchQuery(optionsUtilisateur(id))))
  },
  component: PagePaiements,
})

function PagePaiements() {
  const { type, statut, page } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isPending, isPlaceholderData } = useQuery({ ...optionsPaiements(type, statut, page), placeholderData: keepPreviousData })
  const queryClient = useQueryClient()
  const changer = useServerFn(changerStatutPaiement)
  const [action, setAction] = useState<{ paiement: Paiement; statut: Cible } | null>(null)

  // `admin.paiement_a_traiter` n'est poussé que pour des paiements en attente : on ne
  // l'annonce que si les filtres courants les montreraient. Aucune insertion dans le tableau,
  // l'administrateur affiche quand il veut (la pagination ne bouge pas sous ses doigts).
  const file = useFileTempsReel()
  useEvenement(
    'admin.paiement_a_traiter',
    ({ paiementId, type: typePaiement }) => {
      if (statut && statut !== 'en_attente') return
      if (type && type !== typePaiement) return
      file.signaler(paiementId)
    },
    salons.admin,
  )

  const afficherNouveaux = () => {
    file.vider()
    void queryClient.invalidateQueries({ queryKey: cles.admin.paiementsTous })
    if (page !== 1) void navigate({ search: (prev) => ({ ...prev, page: 1 }) })
  }

  const mutation = useMutation({
    mutationFn: (a: { paiement: Paiement; statut: Cible }) => changer({ data: { id: a.paiement.id, statut: a.statut } }),
    onSuccess: (r, a) => {
      setAction(null)
      if (!r.ok) {
        toastErreur('Mise à jour impossible', r.message)
        return
      }
      toastSucces(`Paiement ${a.statut}`, a.paiement.type === 'depot' && a.statut === 'reussi' ? 'Le portefeuille du joueur a été crédité.' : a.paiement.type === 'retrait' && a.statut === 'echoue' ? 'Montant et frais recrédités au joueur.' : undefined)
      void queryClient.invalidateQueries({ queryKey: cles.admin.paiementsTous })
      void queryClient.invalidateQueries({ queryKey: cles.admin.statistiques })
    },
  })

  const actionsPour = (p: Paiement): Array<{ statut: Cible; libelle: string; variante: 'primaire' | 'danger' | 'secondaire' }> => {
    if (p.statut === 'en_attente') {
      return [
        { statut: 'reussi', libelle: p.type === 'depot' ? 'Créditer' : 'Réussi', variante: 'primaire' },
        { statut: 'echoue', libelle: 'Échec', variante: 'danger' },
      ]
    }
    if (p.type === 'depot' && p.statut === 'reussi') return [{ statut: 'rembourse', libelle: 'Rembourser', variante: 'secondaire' }]
    return []
  }

  const colonnes: Colonne<Paiement>[] = [
    {
      cle: 'joueur',
      entete: 'Joueur',
      rendu: (p) => (
        <div>
          <p className="font-bold">
            <NomUtilisateur id={p.utilisateurId} />
          </p>
          <p className="chiffres text-[11px] text-muet">{formatReference(p.reference, 18)}</p>
        </div>
      ),
    },
    { cle: 'type', entete: 'Type', rendu: (p) => <span className="etiquette">{p.type === 'depot' ? 'Dépôt' : 'Retrait'}</span> },
    { cle: 'prestataire', entete: 'Prestataire', rendu: (p) => libellesPrestataires[p.prestataire] ?? p.prestataire, secondaire: true },
    { cle: 'montant', entete: 'Montant', droite: true, rendu: (p) => <span className="font-bold">{formatMontant(p.montant, p.devise)}</span> },
    { cle: 'frais', entete: 'Frais', droite: true, rendu: (p) => (p.type === 'retrait' ? formatMontant(p.frais, p.devise) : '—'), secondaire: true },
    { cle: 'statut', entete: 'Statut', rendu: (p) => <BadgeStatut famille="paiement" valeur={p.statut} /> },
    { cle: 'date', entete: 'Date', rendu: (p) => <span className="chiffres">{formatDateHeure(p.dateCreation)}</span>, secondaire: true },
    {
      cle: 'actions',
      entete: 'Actions',
      droite: true,
      rendu: (p) => (
        <span className="flex justify-end gap-2">
          {actionsPour(p).map((a) => (
            <Button key={a.statut} taille="sm" variante={a.variante} onClick={() => setAction({ paiement: p, statut: a.statut })}>
              {a.libelle}
            </Button>
          ))}
        </span>
      ),
    },
  ]

  return (
    <>
      <EnTetePage surtitre="Finances" titre="Paiements" description="Validation manuelle quand le prestataire n’a pas confirmé ; un dépôt n’est jamais crédité deux fois." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-lg">
        <Select aria-label="Type" placeholder="Dépôts et retraits" options={[{ valeur: 'depot', libelle: 'Dépôts' }, { valeur: 'retrait', libelle: 'Retraits' }]} value={type} onChange={(e) => navigate({ search: { type: e.target.value, statut, page: 1 } })} />
        <Select
          aria-label="Statut"
          placeholder="Tous les statuts"
          options={[
            { valeur: 'en_attente', libelle: 'En attente' },
            { valeur: 'reussi', libelle: 'Réussis' },
            { valeur: 'echoue', libelle: 'Échoués' },
            { valeur: 'rembourse', libelle: 'Remboursés' },
          ]}
          value={statut}
          onChange={(e) => navigate({ search: { type, statut: e.target.value, page: 1 } })}
        />
      </div>
      <BandeauNouveautes nombre={file.nombre} singulier="nouveau paiement à traiter" plurielForme="nouveaux paiements à traiter" onAfficher={afficherNouveaux} className="mb-4" />
      <div className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={isPlaceholderData || undefined}>
        <DataTable colonnes={colonnes} lignes={data?.elements ?? []} cleLigne={(p) => p.id} chargement={isPending} legende="Paiements" vide={<EmptyState icone={icone.transfert} titre="Aucun paiement" description="Aucun paiement ne correspond à ces filtres." />} />
      </div>
      {data && data.total > 0 && <Pagination page={page} pages={data.pages} total={data.total} onChanger={(p) => navigate({ search: (prev) => ({ ...prev, page: p }) })} className="mt-4" />}
      <ConfirmModal
        ouvert={action !== null}
        onFermer={() => setAction(null)}
        onConfirmer={() => action && mutation.mutate(action)}
        titre={action?.statut === 'reussi' ? 'Marquer comme réussi ?' : action?.statut === 'echoue' ? 'Marquer comme échoué ?' : 'Rembourser ce dépôt ?'}
        variante={action?.statut === 'echoue' ? 'danger' : 'primaire'}
        libelleConfirmer="Confirmer"
        chargement={mutation.isPending}
      >
        {action && (
          <>
            <p>
              {action.paiement.type === 'depot' ? 'Dépôt' : 'Retrait'} de <strong className="chiffres">{formatMontant(action.paiement.montant)}</strong> ({libellesPrestataires[action.paiement.prestataire]}) pour{' '}
              <strong>
                <NomUtilisateur id={action.paiement.utilisateurId} />
              </strong>
              .
            </p>
            <p className="text-legende text-muet">
              {action.paiement.type === 'depot' && action.statut === 'reussi' && 'Le portefeuille sera crédité du montant (opération idempotente).'}
              {action.paiement.type === 'depot' && action.statut === 'rembourse' && 'Le montant sera débité du solde disponible du joueur.'}
              {action.paiement.type === 'retrait' && action.statut === 'reussi' && 'Les mouvements retrait + frais deviennent définitifs.'}
              {action.paiement.type === 'retrait' && action.statut === 'echoue' && `Montant + frais (${formatMontant(action.paiement.frais)}) seront recrédités au joueur.`}
              {action.paiement.type === 'depot' && action.statut === 'echoue' && 'Le dépôt sera marqué échoué, sans mouvement de portefeuille.'}
            </p>
          </>
        )}
      </ConfirmModal>
    </>
  )
}
