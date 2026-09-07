import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { optionsSessionAdmin } from '@/lib/requetes'
import { LayoutAdmin } from '@/components/admin/layout-admin'

/** Tableau admin : garde de rôle administrateur, session dans le contexte de route. */
export const Route = createFileRoute('/admin/_prive')({
  beforeLoad: async ({ context }) => {
    // Même raison que pour l'espace joueur : cette garde tourne à chaque navigation
    // interne, elle ne doit pas coûter un aller-retour réseau à chaque fois.
    const session = await context.queryClient.ensureQueryData(optionsSessionAdmin)
    if (!session) throw redirect({ to: '/admin/connexion' })
    return { session }
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex,nofollow' }] }),
  component: EspaceAdmin,
})

function EspaceAdmin() {
  const { session } = Route.useRouteContext()
  return (
    <LayoutAdmin administrateur={session.administrateur}>
      <Outlet />
    </LayoutAdmin>
  )
}
