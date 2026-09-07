import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { optionsRegles } from '@/lib/requetes'
import { formatMontant, formatPourcentage } from '@/lib/format'
import { PageLegale } from '@/components/public/page-legale'

export const Route = createFileRoute('/_public/cgu')({
  head: () => ({ meta: [{ title: 'Conditions générales d’utilisation — QUI PERD' }, { name: 'robots', content: 'index,follow' }] }),
  component: PageCgu,
})

function PageCgu() {
  const { data: regles } = useSuspenseQuery(optionsRegles)
  return (
    <PageLegale
      titre="Conditions générales d’utilisation"
      miseAJour="5 septembre 2026"
      sections={[
        {
          titre: 'Objet',
          contenu: (
            <p>
              QUI PERD met en relation des joueurs majeurs pour des défis 1 contre 1 sur des jeux vidéo. La plateforme conserve les mises en
              séquestre, enregistre les déclarations et les preuves, et règle le match au gagnant. Elle n’organise pas les parties : elles se jouent
              sur les serveurs des éditeurs, avec les comptes des joueurs.
            </p>
          ),
        },
        {
          titre: 'Compte et éligibilité',
          contenu: (
            <>
              <p>L’inscription est réservée aux personnes majeures. Un seul compte par personne ; un compte suspendu par l’administration ne peut plus se connecter.</p>
              <p>Le joueur renseigne ses identifiants de jeu (comptes gamers) sous sa responsabilité.</p>
            </>
          ),
        },
        {
          titre: 'Mises et séquestre',
          contenu: (
            <>
              <p>
                La mise par joueur est comprise entre {formatMontant(regles.miseMinimale)} et {formatMontant(regles.miseMaximale)}. À la création ou
                au rejoindre d’un défi, elle passe du solde disponible au solde bloqué et n’est plus utilisable.
              </p>
              <p>Un défi non rejoint expire à l’échéance choisie et la mise est rendue au joueur <strong>en totalité</strong> : aucune commission n’est prélevée tant qu’aucun adversaire n’a rejoint le défi. Un défi encore ouvert peut être annulé par son créateur, aux mêmes conditions.</p>
            </>
          ),
        },
        {
          titre: 'Règlement du match et commission',
          contenu: (
            <p>
              Lorsque les déclarations concordent et que les preuves sont validées, le gagnant reçoit la somme des deux mises diminuée de la commission
              de la plateforme, actuellement {formatPourcentage(regles.commissionDefi)}. Les valeurs applicables sont celles publiées sur le site au moment du défi.
            </p>
          ),
        },
        {
          titre: 'Litiges et arbitrage',
          contenu: (
            <p>
              En cas de déclarations divergentes ou de contestation, le match passe en litige : les mises restent bloquées et un arbitre décide, sur la base
              des preuves, soit du règlement au gagnant qu’il désigne, soit du remboursement des deux joueurs. Sa décision est définitive.
            </p>
          ),
        },
        {
          titre: 'Dépôts, retraits et frais',
          contenu: (
            <p>
              Les dépôts et retraits s’effectuent par Mobile Money via les prestataires partenaires. Un retrait est débité immédiatement du solde
              disponible, augmenté de frais de {formatPourcentage(regles.fraisRetrait)} ; en cas d’échec du retrait, montant et frais sont recrédités.
            </p>
          ),
        },
        {
          titre: 'Comportements interdits',
          contenu: <p>Preuves falsifiées ou réutilisées, comptes multiples, entente entre joueurs, abandon volontaire de connexion : la plateforme peut suspendre le compte et régler le litige au détriment du contrevenant.</p>,
        },
      ]}
    />
  )
}
