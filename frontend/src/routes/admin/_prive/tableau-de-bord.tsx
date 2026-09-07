import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatDateRelative, versNombre } from '@/lib/format'
import { optionsStatistiques } from '@/lib/requetes'
import { optionsMessagesContact } from '@/services/contact'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { StatCard } from '@/components/partages/stat-card/stat-card'
import { GraphiqueRepartition } from '@/components/admin/graphique-repartition'
import { useJournalAdmin, type EvenementAdmin, type GenreEvenementAdmin } from '@/components/admin/temps-reel-admin'

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

/**
 * Aucun `refetchInterval` : les compteurs sont poussés par le serveur (`admin.kpi`, fusionné
 * dans le cache par `AbonnementAdmin`, monté une seule fois dans la coquille admin). La seule
 * invalidation restante est la resynchronisation d'après coupure du socket.
 */
function TableauDeBordAdmin() {
  const { data: s } = useSuspenseQuery(optionsStatistiques)
  // Messages « nouveau » : seul le `total` de la première page sert de compteur à traiter.
  const messages = useQuery(optionsMessagesContact(1, 'nouveau'))
  const messagesATraiter = messages.data?.total ?? 0
  const journal = useJournalAdmin()

  return (
    <>
      <EnTetePage surtitre="Vue d’ensemble" titre="Tableau de bord" description="Compteurs agrégés par le backend et poussés en direct : rien n’est réinterrogé en boucle. Les montants sont en FCFA." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-full"><StatCard libelle="Défis ouverts" valeur={s.defisOuverts} icone={icone.defi} accent /></div>
        <div className="h-full"><StatCard libelle="Matchs en cours" valeur={s.matchsEnCours} icone={icone.match} /></div>
        <div className="h-full"><StatCard libelle="Litiges ouverts" valeur={s.litigesOuverts} icone={icone.litige} pied={s.litigesOuverts > 0 ? <Link to="/admin/litiges" className="inline-flex min-h-11 items-center underline">À arbitrer</Link> : 'Aucun en attente'} /></div>
        <div className="h-full"><StatCard libelle="Matchs terminés" valeur={s.matchsTermines} icone={icone.trophee} /></div>
        <div className="h-full"><StatCard libelle="Volume misé" valeur={s.volumeMise} format="montant" icone={icone.pieces} /></div>
        <div className="h-full"><StatCard libelle="Commission cumulée" valeur={s.commissionCumulee} format="montant" icone={icone.couronne} accent /></div>
        <div className="h-full"><StatCard libelle="Dépôts réussis" valeur={s.depotsReussis} format="montant" icone={icone.depot} /></div>
        <div className="h-full"><StatCard libelle="Retraits réussis" valeur={s.retraitsReussis} format="montant" icone={icone.retrait} /></div>
        <div className="h-full">
          <StatCard
            libelle="Messages à traiter"
            valeur={messagesATraiter}
            icone={icone.messages}
            pied={
              messages.isError ? (
                'Module contact indisponible'
              ) : messagesATraiter > 0 ? (
                <Link to="/admin/messages" search={{ page: 1, statut: 'nouveau' }} className="inline-flex min-h-11 items-center underline">
                  À lire
                </Link>
              ) : (
                'Aucun nouveau message'
              )
            }
          />
        </div>
      </div>
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
      <JournalDirect entrees={journal} />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Raccourci to="/admin/litiges" icone={icone.arbitrage} titre="Arbitrer les litiges" texte="Preuves, déclarations, décision." />
        <Raccourci to="/admin/matchs" icone={icone.preuve} titre="Vérifier les preuves" texte="Preuves requises et matchs à régler." />
        <Raccourci to="/admin/paiements" icone={icone.transfert} titre="Suivre les paiements" texte="Dépôts et retraits en attente." />
      </div>
      <p className="mt-6 text-[12px] text-muet">
        {s.utilisateursTotal} comptes joueurs dont {s.utilisateursActifs} actifs.
      </p>
    </>
  )
}

const DESTINATION: Record<GenreEvenementAdmin, { to: string; icone: typeof icone.defi }> = {
  litige: { to: '/admin/litiges', icone: icone.litige },
  paiement: { to: '/admin/paiements', icone: icone.transfert },
  preuve: { to: '/admin/matchs', icone: icone.preuve },
}

/**
 * Ce qui est arrivé depuis l'ouverture de l'onglet, poussé par le salon `admin`. Le bloc
 * n'existe que s'il y a quelque chose à montrer : un tableau de bord vide ne s'encombre pas
 * d'un cadre « aucune activité ».
 */
function JournalDirect({ entrees }: { entrees: readonly EvenementAdmin[] }) {
  if (entrees.length === 0) return null
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-trait bg-papier shadow-carte">
      <div className="flex items-center gap-2 border-b border-trait bg-gris px-4 py-2.5">
        <span className="inline-block size-2 animate-pulsation rounded-full bg-vert" aria-hidden="true" />
        <h3 className="etiquette">Activité en direct</h3>
      </div>
      <ul className="divide-y divide-trait">
        {entrees.map((e) => {
          const destination = DESTINATION[e.genre]
          return (
            <li key={e.cle}>
              <Link to={destination.to} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-vert-pale">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-vert text-craie">
                  <FontAwesomeIcon icon={destination.icone} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-legende font-bold">{e.libelle}</span>
                  <span className="block truncate text-legende text-muet">{e.detail}</span>
                </span>
                <span className="chiffres shrink-0 text-[11px] text-muet">{formatDateRelative(e.horodatage)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Raccourci({ to, icone: ic, titre, texte }: { to: string; icone: typeof icone.defi; titre: string; texte: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-2xl border border-trait bg-papier p-4 shadow-carte transition-shadow duration-150 hover:shadow-carte-forte">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-vert text-craie">
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
