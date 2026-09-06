/** Module `notifications` — mes notifications, marquage lu. */
import { createServerFn } from '@tanstack/react-start'
import { enResultat, type Resultat } from '@/server/http-client'
import { appelJoueur } from '@/server/session'
import type { Notification } from '@/models/notification'

export const listerNotifications = createServerFn({ method: 'GET' }).handler(async () =>
  appelJoueur<Notification[]>('/notifications'),
)

export const marquerNotificationLue = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Resultat<{ lu: boolean }>> =>
    enResultat(appelJoueur<{ lu: boolean }>(`/notifications/${data.id}/lue`, { methode: 'POST' })),
  )
