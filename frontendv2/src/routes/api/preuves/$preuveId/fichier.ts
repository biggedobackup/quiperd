import { createFileRoute } from '@tanstack/react-router'
import { API_BASE_URL } from '@/server/http-client'
import { jetonDepuisRequete } from '@/server/session'

/**
 * Pont authentifié pour les balises <img>/<video> : relit le cookie, appelle le backend avec
 * le Bearer et re-stream la réponse. Le navigateur ne voit jamais l'URL du backend ni le jeton.
 */
export const Route = createFileRoute('/api/preuves/$preuveId/fichier')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const role = new URL(request.url).searchParams.get('role') === 'admin' ? 'admin' : 'joueur'
        const jeton = jetonDepuisRequete(request, role)
        if (!jeton) return Response.json({ erreur: 'authentification requise' }, { status: 401 })

        const enTetesRequete: Record<string, string> = { Authorization: `Bearer ${jeton}` }
        const range = request.headers.get('range')
        if (range) enTetesRequete.Range = range
        const reponse = await fetch(`${API_BASE_URL}/preuves/${encodeURIComponent(params.preuveId)}/fichier`, { headers: enTetesRequete })
        const enTetes = new Headers()
        for (const nom of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
          const v = reponse.headers.get(nom)
          if (v) enTetes.set(nom, v)
        }
        enTetes.set('Cache-Control', 'private, max-age=300')
        return new Response(reponse.body, { status: reponse.status, headers: enTetes })
      },
    },
  },
})
