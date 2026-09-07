import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import appCss from '@/styles/app.css?url'
import { ToastProvider } from '@/components/partages/toast/toast'
import { FournisseurTempsReel } from '@/temps-reel/fournisseur'
import { obtenirSiteUrl } from '@/server/session-fns'

// Importé pour son effet de bord : config.autoAddCss = false (voir lib/icones.ts).
import '@/lib/icones'

export interface ContexteRouteur {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<ContexteRouteur>()({
  loader: async () => ({ siteUrl: await obtenirSiteUrl() }),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Défis en Ligne — Défiez un adversaire, misez, le gagnant remporte tout' },
      {
        name: 'description',
        content:
          'Défis en Ligne connecte les gamers : créez un défi sur votre jeu, un adversaire rejoint, le gagnant remporte les deux mises.',
      },
      { property: 'og:site_name', content: 'Défis en Ligne' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: `${loaderData?.siteUrl ?? ''}/og/accueil.svg` },
      { name: 'theme-color', content: '#ffffff' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/icons/favicon-40.png', type: 'image/png', sizes: '40x40' },
      { rel: 'icon', href: '/icons/icone-192.png', type: 'image/png', sizes: '192x192' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png', sizes: '180x180' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
})

function RootComponent() {
  // Un seul socket temps réel pour toute l'application (site public, joueur, admin).
  // Le provider n'ouvre rien au rendu serveur : la connexion démarre dans un effet.
  return (
    <FournisseurTempsReel>
      <Outlet />
      <ToastProvider />
    </FournisseurTempsReel>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-craie text-encre antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
