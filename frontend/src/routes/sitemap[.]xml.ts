import { createFileRoute } from '@tanstack/react-router'

const PAGES_PUBLIQUES = ['/', '/defis', '/jeux', '/comment-ca-marche', '/aide', '/cgu', '/confidentialite', '/mentions-legales', '/inscription', '/connexion']

/** Sitemap des pages publiques uniquement (les espaces joueur/admin sont exclus par robots.txt). */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const base = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
        const date = new Date().toISOString().slice(0, 10)
        const urls = PAGES_PUBLIQUES.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${date}</lastmod><changefreq>weekly</changefreq></url>`).join('\n')
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
        return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
      },
    },
  },
})
