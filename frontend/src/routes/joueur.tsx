import { Outlet, createFileRoute } from '@tanstack/react-router'
import { gardeJoueur } from '@/server/gardes'
import { optionsNotifications, optionsPortefeuille } from '@/lib/requetes'
import { LayoutJoueur } from '@/components/joueur/layout-joueur'

/** Espace joueur : garde de rôle dans beforeLoad, session partagée via le contexte de route. */
export const Route = createFileRoute('/joueur')({
  beforeLoad: async () => {
    const session = await gardeJoueur()
    return { session }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(optionsPortefeuille),
      context.queryClient.prefetchQuery(optionsNotifications),
    ])
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: EspaceJoueur,
})

function EspaceJoueur() {
  const { session } = Route.useRouteContext()
  return (
    <LayoutJoueur utilisateur={session.utilisateur}>
      <Outlet />
    </LayoutJoueur>
  )
}
