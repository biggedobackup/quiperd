import { createFileRoute } from '@tanstack/react-router'
import { API_BASE_URL } from '@/server/http-client'
import { jetonDepuisRequete } from '@/server/session'

/**
 * Pont d'upload : le navigateur envoie le multipart ici en XMLHttpRequest (progression),
 * la route relaie le formulaire au backend avec le Bearer du joueur.
 */
export const Route = createFileRoute('/api/matchs/$matchId/preuves')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const jeton = jetonDepuisRequete(request, 'joueur')
        if (!jeton) return Response.json({ erreur: 'authentification requise' }, { status: 401 })

        let formulaire: FormData
        try {
          formulaire = await request.formData()
        } catch {
          return Response.json({ erreur: 'formulaire invalide' }, { status: 400 })
        }
        const reponse = await fetch(`${API_BASE_URL}/matchs/${encodeURIComponent(params.matchId)}/preuves`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jeton}` },
          body: formulaire,
        })
        const corps = await reponse.text()
        return new Response(corps, {
          status: reponse.status,
          headers: { 'Content-Type': reponse.headers.get('content-type') ?? 'application/json' },
        })
      },
    },
  },
})
