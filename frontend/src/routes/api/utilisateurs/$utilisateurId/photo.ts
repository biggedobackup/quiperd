import { createFileRoute } from '@tanstack/react-router'
import { API_BASE_URL } from '@/server/http-client'
import { jetonDepuisRequete } from '@/server/session'

/**
 * Photo de profil : pont authentifié entre le navigateur et le backend.
 *
 *   POST   envoie le fichier choisi par le joueur (multipart) ;
 *   DELETE retire la photo ;
 *   GET    relaie l'image pour les balises <img>, sans jamais exposer le jeton.
 *
 * Les photos ne sont pas servies depuis un dossier statique ouvert : côté backend, la
 * route exige une session. Ce pont est ce qui permet malgré tout de les afficher.
 */
export const Route = createFileRoute('/api/utilisateurs/$utilisateurId/photo')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const jeton = jetonDepuisRequete(request, 'joueur') ?? jetonDepuisRequete(request, 'admin')
        if (!jeton) return Response.json({ erreur: 'authentification requise' }, { status: 401 })
        const reponse = await fetch(`${API_BASE_URL}/utilisateurs/${encodeURIComponent(params.utilisateurId)}/photo`, {
          headers: { Authorization: `Bearer ${jeton}` },
        })
        if (!reponse.ok) return new Response(null, { status: reponse.status })
        const enTetes = new Headers()
        for (const nom of ['content-type', 'content-length', 'last-modified']) {
          const v = reponse.headers.get(nom)
          if (v) enTetes.set(nom, v)
        }
        // Ces octets viennent d'un téléversement : le navigateur ne doit pas deviner leur
        // type, et la mise en cache reste privée au visiteur.
        enTetes.set('Cache-Control', 'private, max-age=300')
        enTetes.set('X-Content-Type-Options', 'nosniff')
        enTetes.set('Content-Security-Policy', "default-src 'none'; sandbox")
        return new Response(reponse.body, { status: reponse.status, headers: enTetes })
      },

      POST: async ({ request }) => {
        const jeton = jetonDepuisRequete(request, 'joueur')
        if (!jeton) return Response.json({ erreur: 'authentification requise' }, { status: 401 })
        let formulaire: FormData
        try {
          formulaire = await request.formData()
        } catch {
          return Response.json({ erreur: 'formulaire invalide' }, { status: 400 })
        }
        const reponse = await fetch(`${API_BASE_URL}/utilisateurs/moi/photo`, {
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

      DELETE: async ({ request }) => {
        const jeton = jetonDepuisRequete(request, 'joueur')
        if (!jeton) return Response.json({ erreur: 'authentification requise' }, { status: 401 })
        const reponse = await fetch(`${API_BASE_URL}/utilisateurs/moi/photo`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${jeton}` },
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
