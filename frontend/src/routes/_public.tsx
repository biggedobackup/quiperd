import { Outlet, createFileRoute } from '@tanstack/react-router'
import { obtenirSessionJoueur } from '@/server/session-fns'
import { optionsRegles } from '@/lib/requetes'
import { Header } from '@/components/public/header'
import { Footer } from '@/components/public/footer'

/** Layout du site public : header + footer ; la session (si présente) adapte les boutons. */
export const Route = createFileRoute('/_public')({
  loader: async ({ context }) => {
    const [session] = await Promise.all([obtenirSessionJoueur(), context.queryClient.ensureQueryData(optionsRegles)])
    return { connecte: session !== null }
  },
  component: LayoutPublic,
})

function LayoutPublic() {
  const { connecte } = Route.useLoaderData()
  return (
    <div className="flex min-h-dvh flex-col">
      <Header connecte={connecte} />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer connecte={connecte} />
    </div>
  )
}
