import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateRelative } from '@/lib/format'
import { typesNotification } from '@/lib/statuts'
import { optionsNotifications } from '@/lib/requetes'
import { marquerNotificationLue } from '@/services/notifications'
import type { Notification } from '@/models/notification'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button } from '@/components/partages/button/button'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonLignes } from '@/components/partages/skeleton/skeleton'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'
import { toastErreur } from '@/components/partages/toast/toast'

export const Route = createFileRoute('/joueur/notifications')({
  head: () => ({ meta: [{ title: 'Notifications — QUI PERD' }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(optionsNotifications)
  },
  component: PageNotifications,
})

const ICONES: Record<string, typeof icone.defi> = {
  defi_rejoint: icone.poigneeDeMain,
  defi_expire: icone.horloge,
  match_termine: icone.trophee,
  match_a_valider: icone.match,
  litige_ouvert: icone.litige,
  litige_resolu: icone.arbitrage,
  paiement_confirme: icone.depot,
  paiement_echoue: icone.attention,
}

function PageNotifications() {
  const { data, isPending } = useQuery(optionsNotifications)
  const queryClient = useQueryClient()
  const marquer = useServerFn(marquerNotificationLue)
  const mutation = useMutation({
    mutationFn: (id: string) => marquer({ data: { id } }),
    onSuccess: (r) => {
      if (!r.ok) toastErreur('Impossible de marquer comme lue', r.message)
      void queryClient.invalidateQueries({ queryKey: cles.notifications })
    },
  })
  const nonLues = data?.filter((n) => !n.lu) ?? []

  const toutMarquer = async () => {
    for (const n of nonLues) await mutation.mutateAsync(n.id)
  }

  return (
    <>
      <EnTetePage
        surtitre="Activité"
        titre="Notifications"
        description={nonLues.length > 0 ? `${nonLues.length} non lue(s).` : 'Vous êtes à jour.'}
        actions={
          nonLues.length > 0 && (
            <Button variante="secondaire" onClick={() => void toutMarquer()} chargement={mutation.isPending} iconeDebut={icone.valider}>
              Tout marquer comme lu
            </Button>
          )
        }
      />
      {isPending ? (
        <SkeletonLignes lignes={5} colonnes={2} />
      ) : data && data.length > 0 ? (
        <Cascade className="divide-y-2 divide-trait border-2 border-encre bg-papier">
          {data.map((n) => (
            <ElementCascade key={n.id}>
              <Ligne notification={n} onLire={() => mutation.mutate(n.id)} />
            </ElementCascade>
          ))}
        </Cascade>
      ) : (
        <EmptyState icone={icone.notification} titre="Aucune notification" description="Défi rejoint, match réglé, litige, dépôt confirmé : tout arrive ici." />
      )}
    </>
  )
}

function Ligne({ notification: n, onLire }: { notification: Notification; onLire: () => void }) {
  return (
    <div className={`flex items-start gap-4 px-4 py-4 ${n.lu ? '' : 'bg-volt-fond'}`}>
      <span className={`flex size-9 shrink-0 items-center justify-center border-2 ${n.lu ? 'border-trait text-muet' : 'border-encre bg-volt text-nuit'}`}>
        <FontAwesomeIcon icon={ICONES[n.type] ?? icone.notification} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className={`text-corps ${n.lu ? '' : 'font-bold'}`}>{n.titre}</p>
          <span className="etiquette text-muet">{typesNotification[n.type] ?? n.type}</span>
        </div>
        <p className="mt-0.5 text-legende text-muet">{n.message}</p>
        <p className="chiffres mt-1 text-[11px] text-muet">{formatDateRelative(n.dateCreation)}</p>
      </div>
      {!n.lu && (
        <button type="button" onClick={onLire} className="etiquette shrink-0 border-2 border-transparent px-2 py-1 text-encre hover:border-encre" aria-label="Marquer comme lue">
          Lu
        </button>
      )}
    </div>
  )
}
