import { Outlet, createFileRoute } from '@tanstack/react-router'
import { gardeAdmin } from '@/server/gardes'
import { LayoutAdmin } from '@/components/admin/layout-admin'

/** Tableau admin : garde de rôle administrateur, session dans le contexte de route. */
export const Route = createFileRoute('/admin/_prive')({
  beforeLoad: async () => {
    const session = await gardeAdmin()
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
