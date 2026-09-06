import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import appCss from '@/styles/app.css?url'
import { ToastProvider } from '@/components/partages/toast/toast'
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
      { title: 'QUI PERD — Défiez un adversaire, misez, le gagnant remporte tout' },
      {
        name: 'description',
        content:
          'QUI PERD connecte les gamers : créez un défi sur votre jeu, un adversaire rejoint, le gagnant remporte les deux mises.',
      },
      { property: 'og:site_name', content: 'QUI PERD' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: `${loaderData?.siteUrl ?? ''}/og/accueil.svg` },
      { name: 'theme-color', content: '#ffffff' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/icons/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <Outlet />
      <ToastProvider />
    </>
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
