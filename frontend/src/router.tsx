import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { preparerEntetesSecurite } from '@/server/csp'
import { PageErreur, PageIntrouvable } from '@/components/partages/etats/pages-erreur'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Actions financières : jamais de nouvelle tentative automatique (risque de doublon).
        retry: false,
      },
    },
  })

  // En-têtes de sécurité + nonce de la politique de sécurité du contenu : posés ici
  // parce que `getRouter()` est appelé une fois par requête au rendu serveur, ce qui
  // est le seul endroit où l'en-tête et le nonce des balises peuvent être tirés
  // ensemble. Côté navigateur, la fonction ne fait rien.
  const nonce = preparerEntetesSecurite()

  const router = createRouter({
    routeTree,
    context: { queryClient },
    ...(nonce ? { ssr: { nonce } } : {}),
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: PageIntrouvable,
    defaultErrorComponent: PageErreur,
  })

  // Hydratation SSR du cache TanStack Query + <QueryClientProvider> (wrapQueryClient par défaut).
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
