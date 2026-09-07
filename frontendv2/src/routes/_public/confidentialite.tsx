import { createFileRoute } from '@tanstack/react-router'
import { PageLegale } from '@/components/public/page-legale'

export const Route = createFileRoute('/_public/confidentialite')({
  head: () => ({ meta: [{ title: 'Politique de confidentialité — QUI PERD' }] }),
  component: () => (
    <PageLegale
      titre="Politique de confidentialité"
      miseAJour="5 septembre 2026"
      sections={[
        {
          titre: 'Données collectées',
          contenu: (
            <p>
              Pseudo, adresse e-mail, téléphone, pays, identifiants de jeu, historique des défis et des mouvements de portefeuille, preuves de match
              (captures et vidéos), journal des connexions (appareil, adresse IP). Le mot de passe est stocké sous forme hachée.
            </p>
          ),
        },
        {
          titre: 'Finalités',
          contenu: <p>Fonctionnement des défis et du séquestre, arbitrage des litiges, prévention de la fraude, exécution des dépôts et retraits par les prestataires de paiement, notifications liées à vos matchs.</p>,
        },
        {
          titre: 'Preuves de match',
          contenu: <p>Les fichiers sont stockés sur les serveurs de la plateforme et ne sont accessibles qu’aux deux joueurs du match et aux arbitres, via un accès authentifié. Ils ne sont jamais publiés.</p>,
        },
        {
          titre: 'Conservation',
          contenu: <p>Les données financières et le journal d’audit sont conservés le temps nécessaire aux obligations comptables et à la gestion des litiges. Vous pouvez demander la suppression de votre compte par courriel.</p>,
        },
        {
          titre: 'Cookies',
          contenu: <p>Le site utilise un unique cookie de session, strictement nécessaire (HttpOnly), et mémorise localement votre préférence de thème. Aucun traceur publicitaire.</p>,
        },
        {
          titre: 'Vos droits',
          contenu: <p>Accès, rectification, suppression, opposition : écrivez à support@quiperd.com depuis l’adresse liée à votre compte.</p>,
        },
      ]}
    />
  ),
})
