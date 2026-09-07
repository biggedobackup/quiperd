import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatDateRelative } from '@/lib/format'
import { optionsDefis, optionsMatchs, optionsNotifications, optionsPortefeuille } from '@/lib/requetes'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { CarteDefi } from '@/components/joueur/carte-defi'
import { CarteMatch } from '@/components/joueur/carte-match'
import { LienBouton } from '@/components/partages/button/button'
import { CompteurAnime } from '@/components/partages/compteur-anime/compteur-anime'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonCarte, SkeletonTexte } from '@/components/partages/skeleton/skeleton'

const routeJoueur = getRouteApi('/joueur')

export const Route = createFileRoute('/joueur/tableau-de-bord')({
  head: () => ({ meta: [{ title: 'Tableau de bord — QUI PERD' }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(optionsPortefeuille)
  },
  component: TableauDeBord,
})

function TableauDeBord() {
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur
  const { data: portefeuille } = useSuspenseQuery(optionsPortefeuille)
  const matchs = useQuery(optionsMatchs('en_cours'))
  const defis = useQuery(optionsDefis())
  const notifications = useQuery(optionsNotifications)
  const heure = new Date().getHours()
  const salut = heure < 18 ? 'Bonjour' : 'Bonsoir'

  return (
    <>
      <EnTetePage
        surtitre={`${salut}`}
        titre={moi.nomUtilisateur}
        description="Votre arène : solde, matchs en cours, défis à relever."
        actions={
          <>
            <LienBouton to="/joueur/portefeuille" variante="secondaire" iconeDebut={icone.depot}>
              Déposer
            </LienBouton>
            <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.defi}>
              Créer un défi
            </LienBouton>
          </>
        }
      />

      {/*
        Aucune animation d'entrée sur cette page : le tableau de bord est le premier
        écran après la connexion et celui sur lequel on revient sans arrêt. Voir ses
        blocs se remettre en place à chaque passage donne l'impression que la page se
        recharge. Les animations restent là où elles disent quelque chose : un défi qui
        entre dans la liste en direct, un solde qui vient de bouger.
      */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex h-full flex-col justify-between rounded-2xl bg-encre p-6 text-craie">
            <div className="flex items-start justify-between">
              <span className="etiquette text-craie/60">Solde disponible</span>
              <span className="flex size-10 items-center justify-center rounded-xl bg-vert text-craie">
                <FontAwesomeIcon icon={icone.portefeuille} />
              </span>
            </div>
            <CompteurAnime valeur={portefeuille.soldeDisponible} devise={portefeuille.devise} animerAuMontage={false} className="mt-4 text-display-sm font-bold text-volt md:text-display-md" />
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-craie/15 pt-4 text-legende text-craie/70">
              <span>
                Bloqué en séquestre :{' '}
                <CompteurAnime valeur={portefeuille.soldeBloque} devise={portefeuille.devise} animerAuMontage={false} className="font-bold text-craie" />
              </span>
              <Link to="/joueur/portefeuille" className="etiquette ml-auto flex min-h-11 items-center gap-1 text-volt hover:underline">
                Historique <FontAwesomeIcon icon={icone.suivant} />
              </Link>
            </div>
          </div>
        </div>
        <div>
          <div className="flex h-full flex-col rounded-2xl border border-trait bg-papier p-5">
            <div className="flex items-center justify-between">
              <span className="etiquette text-muet">Notifications</span>
              <Link to="/joueur/notifications" className="etiquette inline-flex min-h-11 items-center text-encre hover:underline">
                Tout voir
              </Link>
            </div>
            {notifications.isPending ? (
              <SkeletonTexte lignes={3} className="mt-4" />
            ) : notifications.data && notifications.data.length > 0 ? (
              <ul className="mt-3 divide-y divide-trait">
                {notifications.data.slice(0, 4).map((n) => (
                  <li key={n.id} className="flex items-start gap-2 py-2 text-legende">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.lu ? 'bg-trait' : 'bg-vert'}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className={`truncate ${n.lu ? '' : 'font-bold'}`}>{n.titre}</p>
                      <p className="text-[11px] text-muet">{formatDateRelative(n.dateCreation)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-legende text-muet">Aucune notification pour l’instant.</p>
            )}
          </div>
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3 className="text-h3">Matchs en cours</h3>
          <Link to="/joueur/matchs" className="etiquette flex min-h-11 shrink-0 items-center gap-1 text-vert hover:underline">
            Tous mes matchs <FontAwesomeIcon icon={icone.suivant} />
          </Link>
        </div>
        {matchs.isPending ? (
          <SkeletonCarte nombre={2} />
        ) : matchs.data && matchs.data.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {matchs.data.slice(0, 4).map((m) => (
              <CarteMatch key={m.id} match={m} moiId={moi.id} />
            ))}
          </div>
        ) : (
          <EmptyState icone={icone.match} titre="Aucun match en cours" description="Rejoignez un défi ouvert ou créez le vôtre : le match démarre dès qu’un adversaire accepte." />
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3 className="text-h3">Défis ouverts</h3>
          <Link to="/joueur/defis" className="etiquette flex min-h-11 shrink-0 items-center gap-1 text-vert hover:underline">
            Tous les défis <FontAwesomeIcon icon={icone.suivant} />
          </Link>
        </div>
        {defis.isPending ? (
          <SkeletonCarte nombre={3} />
        ) : defis.data && defis.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {defis.data.slice(0, 3).map((d) => (
              <CarteDefi key={d.id} defi={d} mien={d.createurId === moi.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            icone={icone.defi}
            titre="Aucun défi disponible"
            description="Créez le premier : votre mise est bloquée en séquestre jusqu’à ce qu’un adversaire rejoigne."
            action={
              <LienBouton to="/joueur/defis/nouveau" variante="volt" iconeDebut={icone.ajouter}>
                Créer un défi
              </LienBouton>
            }
          />
        )}
      </section>
    </>
  )
}
