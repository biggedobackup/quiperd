import { useEffect, useRef, useState } from 'react'
import { createFileRoute, getRouteApi, type SearchSchemaInput } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant, formatMontantSigne, formatReference, versNombre } from '@/lib/format'
import { typesTransaction } from '@/lib/statuts'
import { TAILLE_PAGE, optionsPortefeuille, optionsPrestataires, optionsRegles, optionsTransactions } from '@/lib/requetes'
import { deposer, retirer } from '@/services/paiements'
import type { DemandeDepot, DemandeRetrait, Paiement } from '@/models/paiement'
import type { TransactionPortefeuille } from '@/models/transaction-portefeuille'
import { salons } from '@/temps-reel/evenements'
import { useEvenement, useResynchronisation } from '@/temps-reel/hooks'
import { ajouterNotification, ajouterTransaction, fusionnerSolde } from '@/temps-reel/cache'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { DepotModal } from '@/components/joueur/modals/depot-modal'
import { RetraitModal } from '@/components/joueur/modals/retrait-modal'
import { PaiementModal } from '@/components/joueur/modals/paiement-modal'
import { BlocEmailNonConfirme, estRefusEmail, toastRefusEmail, useEmailNonConfirme } from '@/components/joueur/email-non-verifie'
import { Button, LienBouton } from '@/components/partages/button/button'
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
      context.queryClient.ensureQueryData(optionsPrestataires),
      context.queryClient.ensureQueryData(optionsTransactions(deps.page)),
    ])
  },
  component: PagePortefeuille,
})

/** Dépôt ou retrait dont l'écran suit l'aboutissement en direct (`paiement.statut`). */
interface PaiementSuivi {
  id: string
  type: string
  montant: string
  devise: string
  statut: string
  /** Page hébergée du prestataire : permet de rouvrir un paiement fermé par mégarde. */
  url?: string
}

/** Ce que le joueur doit comprendre, en une phrase, pour chaque issue d'un paiement. */
function aidePaiement(p: PaiementSuivi): string {
  if (p.statut === 'en_attente') {
    return p.type === 'depot'
      ? 'Validez la demande sur votre téléphone : le solde se met à jour ici tout seul.'
      : 'Transfert en cours de traitement vers votre numéro Mobile Money.'
  }
  if (p.statut === 'reussi') {
    return p.type === 'depot' ? 'Montant crédité sur votre solde disponible.' : 'Transfert envoyé vers votre numéro Mobile Money.'
  }
  if (p.statut === 'echoue') {
    return p.type === 'depot'
      ? 'Rien n’a été débité. Vérifiez votre solde Mobile Money, puis réessayez.'
      : 'Montant et frais ont été recrédités sur votre solde disponible.'
  }
  if (p.statut === 'rembourse') return 'Le dépôt a été remboursé : le montant a été repris sur votre solde.'
  return ''
}

/** `true` pendant 2,4 s après un changement de valeur — sert à signaler un solde qui vient de bouger. */
function useEclair(valeur: string): boolean {
  const [actif, setActif] = useState(false)
  const precedent = useRef(valeur)
  useEffect(() => {
    if (precedent.current === valeur) return
    precedent.current = valeur
    setActif(true)
    const minuterie = window.setTimeout(() => setActif(false), 2400)
    return () => window.clearTimeout(minuterie)
  }, [valeur])
  return actif
}

/**
 * Portefeuille du joueur — entièrement poussé par le serveur : aucun `refetchInterval`.
 *
 * Trois événements du salon privé `utilisateur:<id>` :
 *   - `portefeuille.maj`  : les deux soldes, réanimés par `CompteurAnime` ;
 *   - `transaction.creee` : la ligne entre en tête de la page 1 sans décaler la pagination ;
 *   - `paiement.statut`   : le dépôt Mobile Money passe de « en attente » à « réussi » sous
 *     les yeux du joueur, au lieu de le laisser recharger la page sans savoir.
 */
function PagePortefeuille() {
  const { page, paiement } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { session } = routeJoueur.useRouteContext()
  const { data: portefeuille } = useSuspenseQuery(optionsPortefeuille)
  const { data: regles } = useSuspenseQuery(optionsRegles)
  const { data: prestataires } = useSuspenseQuery(optionsPrestataires)
  const transactions = useQuery(optionsTransactions(page))
  const queryClient = useQueryClient()
  const depot = useServerFn(deposer)
  const retrait = useServerFn(retirer)
  const [modalDepot, setModalDepot] = useState(false)
  const [modalRetrait, setModalRetrait] = useState(false)
  /** Page de paiement du prestataire, ouverte DANS la plateforme (jamais une redirection). */
  const [paiementOuvert, setPaiementOuvert] = useState<{ url: string; id: string } | null>(null)
  // Le retrait exige une adresse confirmée (403 côté backend) ; le dépôt, lui, reste ouvert.
  const emailNonConfirmeSession = useEmailNonConfirme()
  const [refuseParLeServeur, setRefuseParLeServeur] = useState(false)
  const retraitBloque = emailNonConfirmeSession || refuseParLeServeur

  const salonMoi = salons.utilisateur(session.utilisateur.id)
  const [suivis, setSuivis] = useState<readonly PaiementSuivi[]>([])
  /** Identifiants des mouvements arrivés en direct : mis en avant dans le tableau. */
  const [recents, setRecents] = useState<readonly string[]>([])
  /** Mouvements reçus alors que le joueur lit une page ancienne de l'historique. */
  const [horsPage, setHorsPage] = useState(0)

  const eclairDisponible = useEclair(portefeuille.soldeDisponible)
  const eclairBloque = useEclair(portefeuille.soldeBloque)

  // Changer de page repart d'un historique propre (les repères « nouveau » ne valent que
  // pour la page qu'on regardait).
  useEffect(() => {
    setRecents([])
    setHorsPage(0)
  }, [page])

  const suivre = (p: PaiementSuivi) =>
    setSuivis((liste) => {
      const index = liste.findIndex((s) => s.id === p.id)
      if (index < 0) return [p, ...liste].slice(0, 4)
      const copie = [...liste]
      // `url` n'arrive qu'à la création : un événement de statut ne doit pas l'effacer.
      copie[index] = { ...copie[index], ...p, url: p.url ?? copie[index]?.url }
      return copie
    })

  // Seule invalidation autorisée : une par (re)connexion du socket (rattrapage de coupure).
  useResynchronisation(cles.portefeuille.tous)

  useEvenement('portefeuille.maj', (solde) => fusionnerSolde(queryClient, solde), salonMoi)

  useEvenement(
    'transaction.creee',
    (transaction) => {
      ajouterTransaction(queryClient, transaction)
      if (page === 1) setRecents((liste) => (liste.includes(transaction.id) ? liste : [transaction.id, ...liste].slice(0, 12)))
      else setHorsPage((n) => n + 1)
    },
    salonMoi,
  )

  useEvenement(
    'paiement.statut',
    ({ paiementId, type, statut, montant, devise }) => {
      suivre({ id: paiementId, type, statut, montant, devise })
      const somme = formatMontant(montant, devise)
      if (statut === 'reussi') {
        toastSucces(type === 'depot' ? 'Dépôt confirmé' : 'Retrait envoyé', type === 'depot' ? `${somme} crédités sur votre solde disponible.` : `${somme} transférés vers votre numéro Mobile Money.`)
      } else if (statut === 'echoue') {
        toastErreur(
          type === 'depot' ? 'Dépôt échoué' : 'Retrait échoué',
          type === 'depot' ? 'Aucun montant n’a été débité. Vérifiez votre solde Mobile Money, puis réessayez.' : 'Montant et frais ont été recrédités sur votre solde disponible.',
        )
      } else if (statut === 'rembourse') {
        toastInfo('Dépôt remboursé', `${somme} ont été repris sur votre solde disponible.`)
      }
      // L'issue est connue : la page de paiement n'a plus rien à montrer.
      if (statut !== 'en_attente') setPaiementOuvert((ouvert) => (ouvert?.id === paiementId ? null : ouvert))
      // Le bandeau « retour du prestataire » n'a plus lieu d'être non plus.
      if (paiement && statut !== 'en_attente') void navigate({ search: { page, paiement: undefined } })
    },
    salonMoi,
  )

  // Le compteur de la navigation lit la même clé de cache : il se met à jour tout seul.
  useEvenement(
    'notification.nouvelle',
    (notification) => {
      ajouterNotification(queryClient, notification)
      toastInfo(notification.titre, notification.message)
    },
    salonMoi,
  )

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
        // Le joueur reste sur QUI PERD : la page hébergée s'ouvre dans une fenêtre
        // de la plateforme, et le socket dira ici même comment le paiement finit.
        suivreLePaiement(r.donnees.paiement, r.donnees.urlPaiement)
        setPaiementOuvert({ url: r.donnees.urlPaiement, id: r.donnees.paiement.id })
        return
      }
      toastInfo('Dépôt enregistré', r.donnees.message ?? 'En attente de confirmation du prestataire.')
      suivreLePaiement(r.donnees.paiement)
      invalider()
    },
  })

  const mutRetrait = useMutation({
    mutationFn: (d: DemandeRetrait) => retrait({ data: d }),
    onSuccess: (r) => {
      setModalRetrait(false)
      if (!r.ok) {
        if (estRefusEmail(r)) {
          setRefuseParLeServeur(true)
          toastRefusEmail(r)
          return
        }
        toastErreur(r.statut === 422 ? 'Solde insuffisant' : 'Retrait impossible', r.message)
        invalider()
        return
      }
      toastSucces('Retrait demandé', `${formatMontantSigne(r.donnees.montant, 'neutre')} + ${formatMontantSigne(r.donnees.frais, 'neutre')} de frais débités. Traitement en cours.`)
      suivreLePaiement(r.donnees)
      invalider()
    },
  })

  function suivreLePaiement(p: Paiement | undefined, url?: string) {
    if (!p?.id) return
    suivre({ id: p.id, type: p.type, montant: p.montant, devise: p.devise, statut: p.statut, url })
  }

  const colonnes: Colonne<TransactionPortefeuille>[] = [
    {
      cle: 'type',
      entete: 'Mouvement',
      rendu: (t) => (
        <div>
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {typesTransaction[t.type]?.libelle ?? t.type}
            {recents.includes(t.id) && <span className="etiquette animate-apparition rounded-full bg-vert px-2 py-0.5 text-craie">Nouveau</span>}
          </p>
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
          // L'indicateur passe en dernier : sur un écran étroit, les deux boutons d'action
          // restent sur la même ligne et c'est lui qui va à la ligne.
          <>
            {retraitBloque ? (
              // Le bouton mène à ce qui débloque le retrait, plutôt que d'ouvrir une modale
              // dont la confirmation serait refusée par le backend.
              <LienBouton to="/joueur/confirmation-email" search={{ vers: '/joueur/portefeuille' }} variante="secondaire" iconeDebut={icone.courriel}>
                Confirmer pour retirer
              </LienBouton>
            ) : (
              <Button variante="secondaire" onClick={() => setModalRetrait(true)} iconeDebut={icone.retrait}>
                Retirer
              </Button>
            )}
            <Button variante="volt" onClick={() => setModalDepot(true)} iconeDebut={icone.depot}>
              Déposer
            </Button>
            <IndicateurDirect variante="etiquette" cliquable className="self-center" />
          </>
        }
      />

      {retraitBloque && (
        <BlocEmailNonConfirme
          action="demander un retrait"
          vers="/joueur/portefeuille"
          note="Le dépôt, lui, reste possible : vous pouvez alimenter votre portefeuille dès maintenant."
          className="mb-6"
        />
      )}

      {paiement && (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-info bg-info-fond p-3 text-legende text-info">
          <FontAwesomeIcon icon={icone.info} className="mt-0.5" />
          {paiement === 'annule' ? 'Paiement annulé : aucun montant n’a été crédité.' : 'Retour du prestataire : votre solde se mettra à jour ici même, sans recharger la page.'}
          <button type="button" className="ml-auto underline" onClick={() => navigate({ search: { page, paiement: undefined } })}>
            Fermer
          </button>
        </p>
      )}

      {suivis.length > 0 && (
        <section aria-label="Paiements en cours" className="mb-6 space-y-3">
          {suivis.map((p) => (
            <article key={p.id} className="animate-apparition flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-trait bg-papier px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-vert-pale text-vert">
                <FontAwesomeIcon icon={p.type === 'depot' ? icone.depot : icone.retrait} />
              </span>
              <span className="min-w-0">
                <span className="block text-legende font-bold">
                  {p.type === 'depot' ? 'Dépôt' : 'Retrait'} de <span className="chiffres">{formatMontant(p.montant, p.devise)}</span>
                </span>
                <span className="block text-legende text-muet">{aidePaiement(p)}</span>
              </span>
              {p.statut === 'en_attente' && p.url && (
                // Fenêtre fermée par mégarde : le paiement reste valable, on rouvre la
                // page hébergée au lieu d'obliger le joueur à refaire un dépôt.
                <Button variante="secondaire" taille="sm" className="ml-auto" onClick={() => setPaiementOuvert({ url: p.url!, id: p.id })}>
                  Reprendre le paiement
                </Button>
              )}
              <BadgeStatut famille="paiement" valeur={p.statut} className={p.statut === 'en_attente' && p.url ? '' : 'ml-auto'} />
              <button
                type="button"
                onClick={() => setSuivis((liste) => liste.filter((s) => s.id !== p.id))}
                aria-label="Masquer ce suivi de paiement"
                className="etiquette flex min-h-11 items-center rounded-full border border-transparent px-3 text-muet transition-colors hover:border-trait hover:text-encre sm:min-h-9"
              >
                Masquer
              </button>
            </article>
          ))}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className={`rounded-2xl border bg-encre p-6 text-craie transition-colors ${eclairDisponible ? 'border-volt' : 'border-encre'}`}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="etiquette text-craie/60">Disponible</span>
            {eclairDisponible && <span className="etiquette animate-apparition rounded-full bg-volt px-2 py-0.5 text-nuit">Mis à jour</span>}
          </span>
          <CompteurAnime valeur={portefeuille.soldeDisponible} devise={portefeuille.devise} className="mt-2 block text-display-sm font-bold text-volt" />
          <p className="mt-2 text-legende text-craie/60">Misable et retirable.</p>
        </div>
        <div className={`rounded-2xl border bg-papier p-6 transition-colors ${eclairBloque ? 'border-vert' : 'border-trait'}`}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="etiquette text-muet">Bloqué en séquestre</span>
            {eclairBloque && <span className="etiquette animate-apparition rounded-full bg-vert px-2 py-0.5 text-craie">Mis à jour</span>}
          </span>
          <CompteurAnime valeur={portefeuille.soldeBloque} devise={portefeuille.devise} className="mt-2 block text-display-sm font-bold" />
          <p className="mt-2 text-legende text-muet">Vos mises engagées sur des défis ou matchs en cours.</p>
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-h3">Historique</h3>
          <span className="text-legende text-muet">{TAILLE_PAGE} mouvements par page</span>
        </div>
        {horsPage > 0 && (
          <p role="status" aria-live="polite" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-vert bg-vert-pale px-4 py-3 text-legende">
            <span className="inline-block size-2 shrink-0 animate-pulsation rounded-full bg-vert" aria-hidden="true" />
            <span className="font-semibold">
              <span className="chiffres">{horsPage}</span> {horsPage > 1 ? 'nouveaux mouvements' : 'nouveau mouvement'} sur votre compte
            </span>
            <Button variante="secondaire" taille="sm" className="ml-auto min-h-11 sm:min-h-0" onClick={() => navigate({ search: { page: 1, paiement } })}>
              Voir la page 1
            </Button>
          </p>
        )}
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

      <DepotModal ouvert={modalDepot} onFermer={() => setModalDepot(false)} onDeposer={async (d) => mutDepot.mutateAsync(d).then(() => undefined)} chargement={mutDepot.isPending} telephone={session.utilisateur.telephone} prestataires={prestataires} />
      <PaiementModal ouvert={!!paiementOuvert} url={paiementOuvert?.url ?? null} onFermer={() => setPaiementOuvert(null)} />
      <RetraitModal
        ouvert={modalRetrait}
        onFermer={() => setModalRetrait(false)}
        onRetirer={async (d) => mutRetrait.mutateAsync(d).then(() => undefined)}
        chargement={mutRetrait.isPending}
        disponible={versNombre(portefeuille.soldeDisponible)}
        fraisRetrait={regles.fraisRetrait}
        telephone={session.utilisateur.telephone}
        prestataires={prestataires}
      />
    </>
  )
}
