import { useState } from 'react'
import { createFileRoute, type SearchSchemaInput } from '@tanstack/react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDate } from '@/lib/format'
import { optionsUtilisateurs } from '@/lib/requetes'
import { changerStatutUtilisateur, supprimerUtilisateur } from '@/services/utilisateurs'
import type { Utilisateur } from '@/models/utilisateur'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button } from '@/components/partages/button/button'
import { Input } from '@/components/partages/input/input'
import { Select } from '@/components/partages/select/select'
import { DataTable, type Colonne } from '@/components/partages/data-table/data-table'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Pagination } from '@/components/partages/pagination/pagination'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'
import { UtilisateurModal, type ModeUtilisateurModal } from '@/components/admin/modals/utilisateur-modal'
import { DetailUtilisateurModal } from '@/components/admin/modals/detail-utilisateur-modal'

/** Cibles tactiles ≥ 44 px dans les cartes mobiles, hauteur compacte dans le tableau. */
const CLASSE_ACTION = 'min-h-11 md:min-h-0'

const OPTIONS_STATUT = [
  { valeur: 'actif', libelle: 'Actifs' },
  { valeur: 'suspendu', libelle: 'Suspendus' },
  { valeur: 'supprime', libelle: 'Supprimés' },
]

type Formulaire = { mode: 'creation' } | { mode: 'edition'; utilisateur: Utilisateur }

export const Route = createFileRoute('/admin/_prive/utilisateurs')({
  head: () => ({ meta: [{ title: 'Administration — Utilisateurs' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    recherche: typeof s.recherche === 'string' ? s.recherche : '',
    statut: typeof s.statut === 'string' ? s.statut : '',
    page: typeof s.page === 'number' && s.page > 0 ? Math.floor(s.page) : 1,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(optionsUtilisateurs(deps.recherche, deps.statut, deps.page))
  },
  component: PageUtilisateurs,
})

function PageUtilisateurs() {
  const { recherche, statut, page } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isPending, isPlaceholderData } = useQuery({ ...optionsUtilisateurs(recherche, statut, page), placeholderData: keepPreviousData })
  const queryClient = useQueryClient()
  const changer = useServerFn(changerStatutUtilisateur)
  const supprimer = useServerFn(supprimerUtilisateur)
  const [saisie, setSaisie] = useState(recherche)
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null)
  const [detail, setDetail] = useState<Utilisateur | null>(null)
  const [cibleStatut, setCibleStatut] = useState<Utilisateur | null>(null)
  const [aSupprimer, setASupprimer] = useState<Utilisateur | null>(null)

  const invalider = () => {
    void queryClient.invalidateQueries({ queryKey: cles.admin.utilisateursTous })
    void queryClient.invalidateQueries({ queryKey: cles.admin.statistiques })
  }

  const mutStatut = useMutation({
    mutationFn: (u: Utilisateur) => changer({ data: { id: u.id, statut: u.statut === 'suspendu' ? 'actif' : 'suspendu' } }),
    onSuccess: (r, u) => {
      setCibleStatut(null)
      if (!r.ok) {
        toastErreur('Modification impossible', r.message)
        return
      }
      toastSucces(u.statut === 'suspendu' ? `${u.nomUtilisateur} réactivé` : `${u.nomUtilisateur} suspendu`, u.statut === 'suspendu' ? undefined : 'Toutes ses sessions ont été fermées.')
      invalider()
    },
  })

  const mutSupprimer = useMutation({
    mutationFn: (u: Utilisateur) => supprimer({ data: { id: u.id } }),
    onSuccess: (r, u) => {
      setASupprimer(null)
      if (!r.ok) {
        // 409 : mise bloquée, défi ouvert ou match en cours — le message de l'API dit lequel.
        toastErreur(r.statut === 409 ? 'Suppression refusée' : 'Suppression impossible', r.message)
        return
      }
      toastSucces(`${u.nomUtilisateur} supprimé`, 'Compte anonymisé : il ne peut plus se connecter, son historique est conservé.')
      invalider()
    },
  })

  const surEnregistrement = (u: Utilisateur, mode: ModeUtilisateurModal) => {
    setFormulaire(null)
    toastSucces(mode === 'creation' ? `${u.nomUtilisateur} créé` : `${u.nomUtilisateur} modifié`, mode === 'creation' ? 'Le joueur peut se connecter dès maintenant.' : undefined)
    invalider()
  }

  const colonnes: Colonne<Utilisateur>[] = [
    {
      cle: 'pseudo',
      entete: 'Joueur',
      rendu: (u) => (
        <div>
          <p className="font-bold">{u.nomUtilisateur}</p>
          <p className="text-[12px] text-muet">{u.email}</p>
        </div>
      ),
    },
    { cle: 'pays', entete: 'Pays', rendu: (u) => u.pays || '—', secondaire: true },
    { cle: 'telephone', entete: 'Téléphone', rendu: (u) => <span className="chiffres">{u.telephone || '—'}</span>, secondaire: true },
    { cle: 'statut', entete: 'Statut', rendu: (u) => <BadgeStatut famille="utilisateur" valeur={u.statut} /> },
    { cle: 'inscription', entete: 'Inscrit le', rendu: (u) => <span className="chiffres">{formatDate(u.dateCreation)}</span>, secondaire: true },
    {
      cle: 'actions',
      entete: 'Actions',
      droite: true,
      rendu: (u) => (
        // La ligne entière ouvre la fiche : les boutons ne doivent pas la déclencher.
        <span className="flex flex-wrap justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {u.statut === 'supprime' ? (
            <Button taille="sm" variante="secondaire" className={CLASSE_ACTION} iconeDebut={icone.voir} onClick={() => setDetail(u)}>
              Voir
            </Button>
          ) : (
            <>
              <Button taille="sm" variante="secondaire" className={CLASSE_ACTION} iconeDebut={icone.modifier} onClick={() => setFormulaire({ mode: 'edition', utilisateur: u })}>
                Modifier
              </Button>
              <Button taille="sm" variante="secondaire" className={CLASSE_ACTION} iconeDebut={u.statut === 'suspendu' ? icone.reactiver : icone.suspendre} onClick={() => setCibleStatut(u)}>
                {u.statut === 'suspendu' ? 'Réactiver' : 'Suspendre'}
              </Button>
              <Button taille="sm" variante="danger" className={CLASSE_ACTION} iconeDebut={icone.supprimer} onClick={() => setASupprimer(u)}>
                Supprimer
              </Button>
            </>
          )}
        </span>
      ),
    },
  ]

  return (
    <>
      <EnTetePage
        surtitre="Comptes"
        titre="Utilisateurs"
        description="Créez, modifiez, suspendez ou supprimez un compte. La suppression anonymise le joueur et conserve son historique ; elle est refusée tant qu’il a une mise bloquée, un défi ouvert ou un match en cours."
        actions={
          <Button variante="volt" iconeDebut={icone.ajouterUtilisateur} onClick={() => setFormulaire({ mode: 'creation' })}>
            Nouvel utilisateur
          </Button>
        }
      />
      <form
        className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          void navigate({ search: { recherche: saisie, statut, page: 1 } })
        }}
      >
        <Input aria-label="Rechercher" placeholder="Pseudo ou e-mail" iconeDebut={icone.rechercher} value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        <Select aria-label="Statut" placeholder="Tous les statuts" options={OPTIONS_STATUT} value={statut} onChange={(e) => navigate({ search: { recherche, statut: e.target.value, page: 1 } })} />
        <Button type="submit" variante="secondaire" iconeDebut={icone.filtrer}>
          Filtrer
        </Button>
      </form>
      <div className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={isPlaceholderData || undefined}>
        <DataTable
          colonnes={colonnes}
          lignes={data?.elements ?? []}
          cleLigne={(u) => u.id}
          chargement={isPending}
          legende="Comptes joueurs"
          onClicLigne={(u) => setDetail(u)}
          vide={<EmptyState icone={icone.utilisateurs} titre="Aucun utilisateur" description={recherche || statut ? 'Aucun compte ne correspond à ces critères.' : 'Créez le premier compte depuis « Nouvel utilisateur ».'} />}
        />
      </div>
      {data && data.total > 0 && <Pagination page={page} pages={data.pages} total={data.total} onChanger={(p) => navigate({ search: (prev) => ({ ...prev, page: p }) })} className="mt-4" />}

      <UtilisateurModal ouvert={formulaire !== null} utilisateur={formulaire?.mode === 'edition' ? formulaire.utilisateur : null} onFermer={() => setFormulaire(null)} onEnregistre={surEnregistrement} />
      <DetailUtilisateurModal utilisateur={detail} onFermer={() => setDetail(null)} />

      <ConfirmModal
        ouvert={cibleStatut !== null}
        onFermer={() => setCibleStatut(null)}
        onConfirmer={() => cibleStatut && mutStatut.mutate(cibleStatut)}
        titre={cibleStatut?.statut === 'suspendu' ? 'Réactiver ce compte ?' : 'Suspendre ce compte ?'}
        variante={cibleStatut?.statut === 'suspendu' ? 'primaire' : 'danger'}
        libelleConfirmer={cibleStatut?.statut === 'suspendu' ? 'Réactiver' : 'Suspendre'}
        chargement={mutStatut.isPending}
      >
        <p>
          <strong>{cibleStatut?.nomUtilisateur}</strong> ({cibleStatut?.email}).
        </p>
        <p className="text-legende text-muet">{cibleStatut?.statut === 'suspendu' ? 'Le joueur pourra de nouveau se connecter, créer et rejoindre des défis.' : 'Ses sessions seront fermées et toute connexion refusée. Ses mises bloquées restent en séquestre.'}</p>
      </ConfirmModal>

      <ConfirmModal ouvert={aSupprimer !== null} onFermer={() => setASupprimer(null)} onConfirmer={() => aSupprimer && mutSupprimer.mutate(aSupprimer)} titre="Supprimer ce compte ?" variante="danger" libelleConfirmer="Supprimer" chargement={mutSupprimer.isPending}>
        <p>
          <strong>{aSupprimer?.nomUtilisateur}</strong> ({aSupprimer?.email}).
        </p>
        <p className="text-legende text-muet">Suppression logique : le compte passe au statut « Supprimé », son e-mail et son pseudo sont anonymisés et ses sessions fermées. Ses matchs et paiements passés restent consultables.</p>
        <p className="text-legende font-semibold text-perte">Refusée si le joueur a une mise bloquée, un défi ouvert ou un match en cours.</p>
      </ConfirmModal>
    </>
  )
}
