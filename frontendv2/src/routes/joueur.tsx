import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { optionsNotifications, optionsPortefeuille, optionsSessionJoueur } from '@/lib/requetes'
import { LayoutJoueur } from '@/components/joueur/layout-joueur'
import { emailNonConfirme } from '@/components/joueur/email-non-verifie'

/** Seuls écrans accessibles tant que l'adresse n'est pas confirmée : la saisie du code et le profil. */
const OUVERT_SANS_CONFIRMATION = ['/joueur/confirmation-email', '/joueur/profil']

/** Espace joueur : garde de rôle dans beforeLoad, session partagée via le contexte de route. */
export const Route = createFileRoute('/joueur')({
  beforeLoad: async ({ context, location }) => {
    // Session lue depuis le cache de requêtes : ce `beforeLoad` s'exécute à chaque
    // navigation interne, et un aller-retour réseau ici retarde l'affichage de TOUTES
    // les pages de l'espace joueur.
    const session = await context.queryClient.ensureQueryData(optionsSessionJoueur)
    if (!session) throw redirect({ to: '/connexion' })
    // Adresse non confirmée : l'espace joueur est fermé, le tableau de bord compris. Le joueur
    // est renvoyé sur la saisie du code ; `vers` conserve la page qu'il voulait, rouverte une
    // fois la confirmation faite. Seuls la confirmation elle-même et le profil restent ouverts.
    const ouvert = OUVERT_SANS_CONFIRMATION.some(
      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
    )
    if (emailNonConfirme(session.utilisateur) && !ouvert) {
      throw redirect({ to: '/joueur/confirmation-email', search: { vers: location.pathname } })
    }
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
