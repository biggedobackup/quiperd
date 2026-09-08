import { createFileRoute } from '@tanstack/react-router'
import { PageLegale } from '@/components/public/page-legale'

export const Route = createFileRoute('/_public/mentions-legales')({
  head: () => ({ meta: [{ title: 'Mentions légales — Défis en Ligne' }] }),
  component: () => (
    <PageLegale
      titre="Mentions légales"
      miseAJour="5 septembre 2026"
      sections={[
        {
          titre: 'Éditeur',
          contenu: <p>Défis en Ligne — plateforme de défis entre joueurs. Contact : support@defisenligne.com. Les informations d’immatriculation et l’adresse du siège sont complétées avant l’ouverture publique du service.</p>,
        },
        {
          titre: 'Hébergement',
          contenu: <p>Application et données hébergées sur un serveur dédié administré par l’éditeur, avec chiffrement TLS de bout en bout.</p>,
        },
        {
          titre: 'Propriété intellectuelle',
          contenu: <p>Les jeux proposés dans le catalogue sont des marques de leurs éditeurs respectifs. Défis en Ligne n’est affilié à aucun d’eux et n’organise pas les parties.</p>,
        },
        {
          titre: 'Jeu responsable',
          contenu: <p>Le service est réservé aux adultes. Ne misez que ce que vous pouvez perdre ; un défi perdu est une mise perdue.</p>,
        },
      ]}
    />
  ),
})
