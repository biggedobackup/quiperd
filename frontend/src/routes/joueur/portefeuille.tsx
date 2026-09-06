import { useState } from 'react'
import { createFileRoute, getRouteApi, type SearchSchemaInput } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontantSigne, formatReference, versNombre } from '@/lib/format'
import { typesTransaction } from '@/lib/statuts'
import { TAILLE_PAGE, optionsPortefeuille, optionsRegles, optionsTransactions } from '@/lib/requetes'
import { deposer, retirer } from '@/services/paiements'
import type { DemandeDepot, DemandeRetrait } from '@/models/paiement'
import type { TransactionPortefeuille } from '@/models/transaction-portefeuille'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { DepotModal } from '@/components/joueur/modals/depot-modal'
import { RetraitModal } from '@/components/joueur/modals/retrait-modal'
import { Button } from '@/components/partages/button/button'
import { CompteurAnime } from '@/components/partages/compteur-anime/compteur-anime'
import { DataTable, type Colonne } from '@/components/partages/data-table/data-table'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Pagination } from '@/components/partages/pagination/pagination'
import { toastErreur, toastInfo, toastSucces } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

export const Route = createFileRoute('/joueur/portefeuille')({
  head: () => ({ meta: [{ title: 'Portefeuille — QUI PERD' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    page: typeof s.page === 'number' && s.page > 0 ? s.page : 1,
    paiement: typeof s.paiement === 'string' ? s.paiement : undefined,
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsPortefeuille),
      context.queryClient.ensureQueryData(optionsRegles),
      context.queryClient.ensureQueryData(optionsTransactions(deps.page)),
    ])
  },
  component: PagePortefeuille,
})

function PagePortefeuille() {
  const { page, paiement } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { session } = routeJoueur.useRouteContext()
  const { data: portefeuille } = useSuspenseQuery({ ...optionsPortefeuille, refetchInterval: 20_000 })
  const { data: regles } = useSuspenseQuery(optionsRegles)
  const transactions = useQuery(optionsTransactions(page))
  const queryClient = useQueryClient()
  const depot = useServerFn(deposer)
  const retrait = useServerFn(retirer)
  const [modalDepot, setModalDepot] = useState(false)
  const [modalRetrait, setModalRetrait] = useState(false)

  const invalider = () => void queryClient.invalidateQueries({ queryKey: cles.portefeuille.tous })

  const mutDepot = useMutation({
    mutationFn: (d: DemandeDepot) => depot({ data: d }),
    onSuccess: (r) => {
      setModalDepot(false)
      if (!r.ok) {
        toastErreur('Dépôt impossible', r.message)
        return
      }
      if (r.donnees.urlPaiement) {
        toastInfo('Redirection vers le paiement…')
        window.location.href = r.donnees.urlPaiement
        return
      }
      toastInfo('Dépôt enregistré', r.donnees.message ?? 'En attente de confirmation du prestataire.')
      invalider()
    },
  })

  const mutRetrait = useMutation({
    mutationFn: (d: DemandeRetrait) => retrait({ data: d }),
    onSuccess: (r) => {
      setModalRetrait(false)
      if (!r.ok) {
        toastErreur(r.statut === 422 ? 'Solde insuffisant' : 'Retrait impossible', r.message)
        invalider()
        return
      }
      toastSucces('Retrait demandé', `${formatMontantSigne(r.donnees.montant, 'neutre')} + ${formatMontantSigne(r.donnees.frais, 'neutre')} de frais débités. Traitement en cours.`)
      invalider()
    },
  })

  const colonnes: Colonne<TransactionPortefeuille>[] = [
    {
      cle: 'type',
      entete: 'Mouvement',
      rendu: (t) => (
        <div>
          <p className="font-semibold">{typesTransaction[t.type]?.libelle ?? t.type}</p>
          <p className="max-w-xs truncate text-[12px] text-muet">{t.description}</p>
        </div>
      ),
    },
    { cle: 'date', entete: 'Date', rendu: (t) => <span className="chiffres text-[12px]">{formatDateHeure(t.dateCreation)}</span>, secondaire: true },
    { cle: 'reference', entete: 'Référence', rendu: (t) => <span className="chiffres text-[12px] text-muet">{formatReference(t.reference, 16)}</span>, secondaire: true },
    { cle: 'statut', entete: 'Statut', rendu: (t) => <BadgeStatut famille="transaction" valeur={t.statut} /> },
    {
      cle: 'montant',
      entete: 'Montant',
      droite: true,
      rendu: (t) => {
        const sens = typesTransaction[t.type]?.sens ?? 'neutre'
        // Commission liée à un match ou à une mise rendue : déjà déduite du gain/remboursement, affichée à titre informatif.
        const informatif = t.type === 'commission' && (!!t.matchId || !!t.miseId)
        return <span className={`font-bold ${informatif ? 'text-muet' : sens === 'credit' ? 'text-gain' : sens === 'debit' ? 'text-perte' : ''}`}>{formatMontantSigne(t.montant, informatif ? 'neutre' : sens)}</span>
      },
    },
  ]

  return (
    <>
      <EnTetePage
        surtitre="Argent"
        titre="Portefeuille"
        description="Le solde bloqué correspond à vos mises engagées ; seul le solde disponible peut être misé ou retiré."
        actions={
          <>
            <Button variante="secondaire" onClick={() => setModalRetrait(true)} iconeDebut={icone.retrait}>
              Retirer
            </Button>
            <Button variante="volt" onClick={() => setModalDepot(true)} iconeDebut={icone.depot}>
              Déposer
            </Button>
          </>
        }
      />

      {paiement && (
        <p className="mb-6 flex items-start gap-2 border-2 border-info bg-info-fond p-3 text-legende text-info">
          <FontAwesomeIcon icon={icone.info} className="mt-0.5" />
          {paiement === 'annule' ? 'Paiement annulé : aucun montant n’a été crédité.' : 'Retour du prestataire : votre solde sera mis à jour dès confirmation du paiement.'}
          <button type="button" className="ml-auto underline" onClick={() => navigate({ search: { page, paiement: undefined } })}>
            Fermer
          </button>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="ticket border-2 border-encre bg-nuit p-6 text-craie">
          <span className="etiquette text-craie/60">Disponible</span>
          <CompteurAnime valeur={portefeuille.soldeDisponible} devise={portefeuille.devise} className="mt-2 block text-display-sm font-bold text-volt" />
          <p className="mt-2 text-legende text-craie/60">Misable et retirable.</p>
        </div>
        <div className="ticket border-2 border-encre bg-papier p-6">
          <span className="etiquette text-muet">Bloqué en séquestre</span>
          <CompteurAnime valeur={portefeuille.soldeBloque} devise={portefeuille.devise} className="mt-2 block text-display-sm font-bold" />
          <p className="mt-2 text-legende text-muet">Vos mises engagées sur des défis ou matchs en cours.</p>
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-h3">Historique</h3>
          <span className="text-legende text-muet">{TAILLE_PAGE} mouvements par page</span>
        </div>
        <DataTable
          colonnes={colonnes}
          lignes={transactions.data ?? []}
          cleLigne={(t) => t.id}
          chargement={transactions.isPending}
          legende="Historique des mouvements du portefeuille"
          vide={<EmptyState icone={icone.transfert} titre="Aucune transaction" description="Votre premier dépôt apparaîtra ici." action={<Button variante="volt" onClick={() => setModalDepot(true)} iconeDebut={icone.depot}>Déposer</Button>} />}
        />
        {(transactions.data?.length ?? 0) > 0 && (
          <Pagination page={page} suivantePossible={(transactions.data?.length ?? 0) >= TAILLE_PAGE} onChanger={(p) => navigate({ search: { page: p, paiement } })} className="mt-4" />
        )}
      </section>

      <DepotModal ouvert={modalDepot} onFermer={() => setModalDepot(false)} onDeposer={async (d) => mutDepot.mutateAsync(d).then(() => undefined)} chargement={mutDepot.isPending} telephone={session.utilisateur.telephone} />
      <RetraitModal
        ouvert={modalRetrait}
        onFermer={() => setModalRetrait(false)}
        onRetirer={async (d) => mutRetrait.mutateAsync(d).then(() => undefined)}
        chargement={mutRetrait.isPending}
        disponible={versNombre(portefeuille.soldeDisponible)}
        fraisRetrait={regles.fraisRetrait}
        telephone={session.utilisateur.telephone}
      />
    </>
  )
}
