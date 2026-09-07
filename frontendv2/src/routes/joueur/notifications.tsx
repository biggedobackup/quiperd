import { useState } from 'react'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
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
import { salons } from '@/temps-reel/evenements'
import { useEvenement, useResynchronisation } from '@/temps-reel/hooks'
import { ajouterNotification } from '@/temps-reel/cache'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button } from '@/components/partages/button/button'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonLignes } from '@/components/partages/skeleton/skeleton'
import { useAttenteDouce } from '@/components/partages/skeleton/attente'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'
import { toastErreur } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

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

/**
 * Notifications du joueur — poussées par le salon privé `utilisateur:<id>`, jamais
 * réinterrogées en boucle. La notification entre en tête de la liste, et le compteur de la
 * navigation (barre latérale et cloche de l'en-tête) se met à jour du même coup : il lit la
 * même clé de cache `cles.notifications`.
 *
 * Aucun toast ici : le joueur regarde déjà l'écran, la ligne qui apparaît suffit.
 */
function PageNotifications() {
  const { session } = routeJoueur.useRouteContext()
  const { data, isPending } = useQuery(optionsNotifications)
  // Squelette différé : rien si la donnée arrive vite, pas de clignotement si elle tarde.
  const attente = useAttenteDouce(isPending)
  const queryClient = useQueryClient()
  const marquer = useServerFn(marquerNotificationLue)
  const [recentes, setRecentes] = useState<readonly string[]>([])

  useResynchronisation(cles.notifications)
  useEvenement(
    'notification.nouvelle',
    (notification) => {
      ajouterNotification(queryClient, notification)
      setRecentes((liste) => (liste.includes(notification.id) ? liste : [notification.id, ...liste].slice(0, 20)))
    },
    salons.utilisateur(session.utilisateur.id),
  )

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
          <>
            {nonLues.length > 0 && (
              <Button variante="secondaire" onClick={() => void toutMarquer()} chargement={mutation.isPending} iconeDebut={icone.valider}>
                Tout marquer comme lu
              </Button>
            )}
            <IndicateurDirect variante="etiquette" cliquable className="self-center" />
          </>
        }
      />
      {attente ? (
        <SkeletonLignes lignes={5} colonnes={2} />
      ) : data && data.length > 0 ? (
        <Cascade className="divide-y divide-trait overflow-hidden rounded-2xl border border-trait bg-papier">
          {data.map((n) => (
            <ElementCascade key={n.id}>
              <Ligne notification={n} nouvelle={recentes.includes(n.id)} onLire={() => mutation.mutate(n.id)} />
            </ElementCascade>
          ))}
        </Cascade>
      ) : (
        <EmptyState icone={icone.notification} titre="Aucune notification" description="Défi rejoint, match réglé, litige, dépôt confirmé : tout arrive ici." />
      )}
    </>
  )
}

function Ligne({ notification: n, nouvelle, onLire }: { notification: Notification; nouvelle: boolean; onLire: () => void }) {
  return (
    <div className={`flex items-start gap-4 px-4 py-4 ${nouvelle ? 'animate-apparition' : ''} ${n.lu ? '' : 'bg-vert-pale'}`}>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${n.lu ? 'border-trait text-muet' : 'border-transparent bg-vert text-craie'}`}>
        <FontAwesomeIcon icon={ICONES[n.type] ?? icone.notification} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className={`text-corps ${n.lu ? '' : 'font-bold'}`}>{n.titre}</p>
          <span className="etiquette text-muet">{typesNotification[n.type] ?? n.type}</span>
          {nouvelle && <span className="etiquette rounded-full bg-vert px-2 py-0.5 text-craie">À l’instant</span>}
        </div>
        <p className="mt-0.5 text-legende text-muet">{n.message}</p>
        <p className="chiffres mt-1 text-[11px] text-muet">{formatDateRelative(n.dateCreation)}</p>
      </div>
      {!n.lu && (
        <button type="button" onClick={onLire} className="etiquette flex min-h-11 shrink-0 items-center rounded-full border border-transparent px-3 text-encre transition-colors hover:border-vert hover:text-vert" aria-label="Marquer comme lue">
          Lu
        </button>
      )}
    </div>
  )
}
