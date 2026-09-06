import { useState } from 'react'
import { Link, createFileRoute, type SearchSchemaInput } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatDateHeure, formatDateRelative, formatIdentifiant, pluriel } from '@/lib/format'
import { clesContact, modifierMessageContact, optionsMessagesContact, supprimerMessageContact } from '@/services/contact'
import { estStatutContact, type MessageContact, type StatutContact } from '@/models/contact'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button, classesBouton } from '@/components/partages/button/button'
import { Select } from '@/components/partages/select/select'
import { Textarea } from '@/components/partages/textarea/textarea'
import { DataTable, type Colonne } from '@/components/partages/data-table/data-table'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { Modal } from '@/components/partages/modal/modal'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { Pagination } from '@/components/partages/pagination/pagination'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

interface Recherche {
  page: number
  statut: StatutContact | ''
}

interface Modification {
  id: string
  statut?: StatutContact
  noteAdmin?: string
}

const OPTIONS_STATUT = [
  { valeur: 'nouveau', libelle: 'Nouveaux' },
  { valeur: 'lu', libelle: 'Lus' },
  { valeur: 'traite', libelle: 'Traités' },
]

export const Route = createFileRoute('/admin/_prive/messages')({
  head: () => ({ meta: [{ title: 'Administration — Messages' }] }),
  // `& SearchSchemaInput` : tous les paramètres sont optionnels en entrée (un <Link> sans `search` reste valide).
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput): Recherche => ({
    page: typeof s.page === 'number' && Number.isInteger(s.page) && s.page > 0 ? s.page : 1,
    statut: estStatutContact(s.statut) ? s.statut : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(optionsMessagesContact(deps.page, deps.statut))
  },
  component: PageMessages,
})

/** Aperçu court d'un message pour la liste (le texte complet s'affiche dans la fenêtre de détail). */
function apercu(texte: string, longueur = 90): string {
  const plat = texte.replace(/\s+/g, ' ').trim()
  return plat.length > longueur ? `${plat.slice(0, longueur)}…` : plat
}

function lienReponse(m: MessageContact): string {
  return `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.sujet}`)}`
}

function PageMessages() {
  const { page, statut } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isPending } = useQuery(optionsMessagesContact(page, statut))
  const queryClient = useQueryClient()
  const modifier = useServerFn(modifierMessageContact)
  const supprimer = useServerFn(supprimerMessageContact)
  const [selection, setSelection] = useState<MessageContact | null>(null)
  const [note, setNote] = useState('')
  const [aSupprimer, setASupprimer] = useState<MessageContact | null>(null)

  const elements = data?.elements ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 0
  const noteModifiee = selection !== null && note !== (selection.noteAdmin || '')

  const allerPage = (p: number) => navigate({ search: { page: p, statut } })
  const ouvrir = (m: MessageContact) => {
    setSelection(m)
    setNote(m.noteAdmin || '')
  }
  const invalider = () => queryClient.invalidateQueries({ queryKey: clesContact.tous })

  const mutModifier = useMutation({
    mutationFn: (v: Modification) => modifier({ data: v }),
    onSuccess: (r, v) => {
      if (!r.ok) {
        toastErreur('Mise à jour impossible', r.message)
        return
      }
      setSelection(r.donnees)
      setNote(r.donnees.noteAdmin || '')
      const noteAussi = v.statut !== undefined && v.noteAdmin !== undefined ? ' La note a aussi été enregistrée.' : undefined
      if (v.statut === 'lu') toastSucces('Message marqué comme lu', noteAussi)
      else if (v.statut === 'traite') toastSucces('Message marqué comme traité', noteAussi)
      else toastSucces('Note enregistrée')
      void invalider()
    },
  })

  const mutSupprimer = useMutation({
    mutationFn: (m: MessageContact) => supprimer({ data: { id: m.id } }),
    onSuccess: (r, m) => {
      setASupprimer(null)
      if (!r.ok) {
        toastErreur('Suppression impossible', r.message)
        return
      }
      setSelection(null)
      toastSucces('Message supprimé', `Le message de ${m.nom} a été effacé définitivement.`)
      void invalider()
      // Dernier message de la page : on recule d'une page plutôt que d'afficher une page vide.
      if (elements.length === 1 && page > 1) void allerPage(page - 1)
    },
  })

  /** Changement de statut ; une note modifiée mais non enregistrée part dans le même appel. */
  const marquer = (cible: StatutContact) => {
    if (!selection) return
    mutModifier.mutate({ id: selection.id, statut: cible, ...(noteModifiee ? { noteAdmin: note } : {}) })
  }
  const enregistrerNote = () => {
    if (!selection || !noteModifiee) return
    mutModifier.mutate({ id: selection.id, noteAdmin: note })
  }
  const enCours = (cible?: StatutContact) => mutModifier.isPending && mutModifier.variables?.statut === cible

  const colonnes: Colonne<MessageContact>[] = [
    {
      cle: 'date',
      entete: 'Reçu le',
      rendu: (m) => <span className="chiffres whitespace-nowrap">{formatDateHeure(m.dateCreation)}</span>,
    },
    {
      cle: 'expediteur',
      entete: 'Expéditeur',
      rendu: (m) => (
        <div className="min-w-0">
          <p className="font-bold">{m.nom}</p>
          <p className="break-all text-[12px] text-muet">{m.email}</p>
        </div>
      ),
    },
    {
      cle: 'sujet',
      entete: 'Sujet',
      rendu: (m) => (
        <div className="min-w-0">
          <p className="line-clamp-1 font-semibold">{m.sujet}</p>
          <p className="line-clamp-1 text-[12px] text-muet">{apercu(m.message)}</p>
        </div>
      ),
    },
    { cle: 'statut', entete: 'Statut', rendu: (m) => <BadgeStatut famille="contact" valeur={m.statut} /> },
    {
      cle: 'actions',
      entete: 'Action',
      droite: true,
      rendu: (m) => (
        <Button
          taille="sm"
          variante="secondaire"
          iconeDebut={icone.voir}
          onClick={(e) => {
            e.stopPropagation()
            ouvrir(m)
          }}
        >
          Ouvrir
        </Button>
      ),
    },
  ]

  return (
    <>
      <EnTetePage
        surtitre="Support"
        titre="Messages"
        description="Messages reçus depuis le formulaire « Nous contacter » du site. Répondez par e-mail depuis votre messagerie, puis marquez le message comme traité."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-lg">
        <Select
          aria-label="Statut"
          placeholder="Tous les messages"
          options={OPTIONS_STATUT}
          value={statut}
          onChange={(e) => {
            const valeur = e.target.value
            void navigate({ search: { page: 1, statut: estStatutContact(valeur) ? valeur : '' } })
          }}
        />
      </div>
      <DataTable
        colonnes={colonnes}
        lignes={elements}
        cleLigne={(m) => m.id}
        chargement={isPending}
        legende="Messages de contact"
        onClicLigne={ouvrir}
        vide={
          <EmptyState
            icone={icone.messages}
            titre="Aucun message"
            description={statut ? 'Aucun message avec ce statut.' : 'Les messages envoyés depuis la page Aide du site apparaîtront ici.'}
            action={
              statut ? (
                <Button variante="secondaire" onClick={() => navigate({ search: { page: 1, statut: '' } })}>
                  Voir tous les messages
                </Button>
              ) : undefined
            }
          />
        }
      />
      {total > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-legende text-muet">
            <span className="chiffres">{total}</span> {pluriel(total, 'message')}
            {pages > 1 && (
              <>
                {' '}
                sur <span className="chiffres">{pages}</span> pages
              </>
            )}
          </p>
          <Pagination page={page} pages={pages} suivantePossible={page < pages} onChanger={allerPage} />
        </div>
      )}

      <Modal
        ouvert={selection !== null}
        onFermer={() => setSelection(null)}
        titre={selection?.sujet ?? 'Message'}
        description={selection ? `De ${selection.nom} · ${formatDateHeure(selection.dateCreation)}` : undefined}
        taille="lg"
        verrouille={mutModifier.isPending || aSupprimer !== null}
        pied={
          selection && (
            <>
              <Button variante="danger" className="mr-auto" iconeDebut={icone.supprimer} onClick={() => setASupprimer(selection)} disabled={mutModifier.isPending}>
                Supprimer
              </Button>
              <a href={lienReponse(selection)} className={classesBouton('secondaire')}>
                <FontAwesomeIcon icon={icone.repondre} /> Répondre
              </a>
              {selection.statut === 'nouveau' && (
                <Button variante="secondaire" iconeDebut={icone.voir} onClick={() => marquer('lu')} chargement={enCours('lu')} disabled={mutModifier.isPending}>
                  Marquer comme lu
                </Button>
              )}
              {selection.statut !== 'traite' && (
                <Button variante="volt" iconeDebut={icone.traite} onClick={() => marquer('traite')} chargement={enCours('traite')} disabled={mutModifier.isPending}>
                  Marquer comme traité
                </Button>
              )}
            </>
          )
        }
      >
        {selection && (
          <div className="space-y-5">
            <dl className="grid gap-x-6 gap-y-4 text-legende sm:grid-cols-2">
              <div>
                <dt className="etiquette text-muet">Expéditeur</dt>
                <dd className="mt-1 font-semibold">{selection.nom}</dd>
              </div>
              <div className="min-w-0">
                <dt className="etiquette text-muet">E-mail</dt>
                <dd className="mt-1 break-all">
                  <a href={lienReponse(selection)} className="font-semibold underline decoration-2 underline-offset-4 hover:decoration-volt">
                    {selection.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="etiquette text-muet">Reçu le</dt>
                <dd className="chiffres mt-1">
                  {formatDateHeure(selection.dateCreation)} <span className="text-muet">({formatDateRelative(selection.dateCreation)})</span>
                </dd>
              </div>
              <div>
                <dt className="etiquette text-muet">Statut</dt>
                <dd className="mt-1">
                  <BadgeStatut famille="contact" valeur={selection.statut} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="etiquette text-muet">Compte joueur</dt>
                <dd className="mt-1">
                  {selection.utilisateurId ? (
                    <>
                      <span className="chiffres">{formatIdentifiant(selection.utilisateurId)}</span>
                      {' · '}
                      <Link to="/admin/utilisateurs" search={{ recherche: selection.email, statut: '' }} className="font-semibold underline decoration-2 underline-offset-4 hover:decoration-volt">
                        Voir le compte
                      </Link>
                    </>
                  ) : (
                    <span className="text-muet">Visiteur non connecté</span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="perforation" />
            <div>
              <span className="etiquette text-muet">Message</span>
              <p className="mt-2 whitespace-pre-wrap break-words border-2 border-trait bg-gris px-4 py-3 text-corps">{selection.message}</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                enregistrerNote()
              }}
            >
              <Textarea
                label="Note interne (invisible pour l’expéditeur)"
                rows={3}
                placeholder="Ex. répondu le 12/09, en attente du retour du joueur."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={mutModifier.isPending}
              />
              <div className="mt-2 flex justify-end">
                <Button type="submit" variante="secondaire" taille="sm" disabled={!noteModifiee || mutModifier.isPending} chargement={enCours(undefined) && mutModifier.variables?.noteAdmin !== undefined}>
                  Enregistrer la note
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      <ConfirmModal
        ouvert={aSupprimer !== null}
        onFermer={() => setASupprimer(null)}
        onConfirmer={() => aSupprimer && mutSupprimer.mutate(aSupprimer)}
        titre="Supprimer ce message ?"
        variante="danger"
        libelleConfirmer="Supprimer"
        chargement={mutSupprimer.isPending}
      >
        {aSupprimer && (
          <>
            <p>
              Message de <strong>{aSupprimer.nom}</strong> ({aSupprimer.email}) : « {aSupprimer.sujet} ».
            </p>
            <p className="text-legende text-muet">La suppression est définitive ; la note interne disparaît avec le message.</p>
          </>
        )}
      </ConfirmModal>
    </>
  )
}
