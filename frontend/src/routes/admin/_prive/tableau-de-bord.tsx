import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { versNombre } from '@/lib/format'
import { optionsStatistiques } from '@/lib/requetes'
import { optionsMessagesContact } from '@/services/contact'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { StatCard } from '@/components/partages/stat-card/stat-card'
import { GraphiqueRepartition } from '@/components/admin/graphique-repartition'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'

export const Route = createFileRoute('/admin/_prive/tableau-de-bord')({
  head: () => ({ meta: [{ title: 'Administration — Tableau de bord' }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsStatistiques),
      // Préchargé sans bloquer : le tableau de bord s'affiche même si le module contact est indisponible.
      context.queryClient.prefetchQuery(optionsMessagesContact(1, 'nouveau')),
    ])
  },
  component: TableauDeBordAdmin,
})

function TableauDeBordAdmin() {
  const { data: s } = useSuspenseQuery({ ...optionsStatistiques, refetchInterval: 60_000 })
  // Messages « nouveau » : seul le `total` de la première page sert de compteur à traiter.
  const messages = useQuery({ ...optionsMessagesContact(1, 'nouveau'), refetchInterval: 60_000 })
  const messagesATraiter = messages.data?.total ?? 0
  return (
    <>
      <EnTetePage surtitre="Vue d’ensemble" titre="Tableau de bord" description="Chiffres agrégés par le backend (cache 60 s). Les montants sont en FCFA." />
      <Cascade className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ElementCascade className="h-full"><StatCard libelle="Défis ouverts" valeur={s.defisOuverts} icone={icone.defi} accent /></ElementCascade>
        <ElementCascade className="h-full"><StatCard libelle="Matchs en cours" valeur={s.matchsEnCours} icone={icone.match} /></ElementCascade>
        <ElementCascade className="h-full"><StatCard libelle="Litiges ouverts" valeur={s.litigesOuverts} icone={icone.litige} pied={s.litigesOuverts > 0 ? <Link to="/admin/litiges" className="underline">À arbitrer</Link> : 'Aucun en attente'} /></ElementCascade>
        <ElementCascade className="h-full"><StatCard libelle="Matchs terminés" valeur={s.matchsTermines} icone={icone.trophee} /></ElementCascade>
        <ElementCascade className="h-full"><StatCard libelle="Volume misé" valeur={s.volumeMise} format="montant" icone={icone.pieces} /></ElementCascade>
        <ElementCascade className="h-full"><StatCard libelle="Commission cumulée" valeur={s.commissionCumulee} format="montant" icone={icone.couronne} accent /></ElementCascade>
        <ElementCascade className="h-full"><StatCard libelle="Dépôts réussis" valeur={s.depotsReussis} format="montant" icone={icone.depot} /></ElementCascade>
        <ElementCascade className="h-full"><StatCard libelle="Retraits réussis" valeur={s.retraitsReussis} format="montant" icone={icone.retrait} /></ElementCascade>
        <ElementCascade className="h-full">
          <StatCard
            libelle="Messages à traiter"
            valeur={messagesATraiter}
            icone={icone.messages}
            pied={
              messages.isError ? (
                'Module contact indisponible'
              ) : messagesATraiter > 0 ? (
                <Link to="/admin/messages" search={{ page: 1, statut: 'nouveau' }} className="underline">
                  À lire
                </Link>
              ) : (
                'Aucun nouveau message'
              )
            }
          />
        </ElementCascade>
      </Cascade>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GraphiqueRepartition
          titre="Activité de la plateforme"
          donnees={[
            { nom: 'Défis ouverts', valeur: s.defisOuverts },
            { nom: 'Matchs en cours', valeur: s.matchsEnCours },
            { nom: 'Matchs terminés', valeur: s.matchsTermines },
            { nom: 'Litiges ouverts', valeur: s.litigesOuverts },
            { nom: 'Joueurs actifs', valeur: s.utilisateursActifs },
          ]}
        />
        <GraphiqueRepartition
          titre="Flux financiers (FCFA)"
          format="montant"
          donnees={[
            { nom: 'Dépôts', valeur: versNombre(s.depotsReussis) },
            { nom: 'Retraits', valeur: versNombre(s.retraitsReussis) },
            { nom: 'Volume misé', valeur: versNombre(s.volumeMise) },
            { nom: 'Commission', valeur: versNombre(s.commissionCumulee) },
          ]}
        />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Raccourci to="/admin/litiges" icone={icone.arbitrage} titre="Arbitrer les litiges" texte="Preuves, déclarations, décision." />
        <Raccourci to="/admin/matchs" icone={icone.preuve} titre="Vérifier les preuves" texte="Matchs en vérification à régler." />
        <Raccourci to="/admin/paiements" icone={icone.transfert} titre="Suivre les paiements" texte="Dépôts et retraits en attente." />
      </div>
      <p className="mt-6 text-[12px] text-muet">
        {s.utilisateursTotal} comptes joueurs dont {s.utilisateursActifs} actifs.
      </p>
    </>
  )
}

function Raccourci({ to, icone: ic, titre, texte }: { to: string; icone: typeof icone.defi; titre: string; texte: string }) {
  return (
    <Link to={to} className="ticket-sm flex items-center gap-4 border-2 border-encre bg-papier p-4 transition-transform hover:-translate-y-0.5 hover:shadow-tampon">
      <span className="flex size-10 shrink-0 items-center justify-center border-2 border-encre bg-volt text-nuit">
        <FontAwesomeIcon icon={ic} />
      </span>
      <span>
        <span className="block font-titre text-[12px] uppercase">{titre}</span>
        <span className="block text-legende text-muet">{texte}</span>
      </span>
      <FontAwesomeIcon icon={icone.suivant} className="ml-auto text-muet" />
    </Link>
  )
}
