/**
 * Mes matchs — liste vivante. Aucun `refetchInterval` : l'écran s'abonne au salon de chacun
 * de ses matchs (et à son salon privé pour les matchs qui démarrent) et écrit les événements
 * dans le cache. Une seule invalidation à la (re)connexion du socket.
 */
import { createFileRoute, getRouteApi, useNavigate, type SearchSchemaInput } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { statuts } from '@/lib/statuts'
import { optionsMatchs } from '@/lib/requetes'
import type { MatchEnrichi } from '@/models/match'
import { salons } from '@/temps-reel/evenements'
import { useEvenement, useResynchronisation, useSalon } from '@/temps-reel/hooks'
import { remplacerMatch } from '@/temps-reel/cache'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { CarteMatch } from '@/components/joueur/carte-match'
import { LienBouton } from '@/components/partages/button/button'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonCarte } from '@/components/partages/skeleton/skeleton'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'

const routeJoueur = getRouteApi('/joueur')

/**
 * Onglets du parcours joueur. `verification` n'y figure plus : deux déclarations concordantes
 * règlent le match immédiatement. Les rares lignes historiques dans cet état restent visibles
 * sous « Tous » et gardent leur badge.
 */
const STATUTS = ['', 'en_cours', 'preuve_requise', 'nul_en_attente', 'litige', 'termine'] as const

export const Route = createFileRoute('/joueur/matchs/')({
  head: () => ({ meta: [{ title: 'Mes matchs — QUI PERD' }] }),
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    statut: typeof s.statut === 'string' && (STATUTS as readonly string[]).includes(s.statut) ? (s.statut as (typeof STATUTS)[number]) : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(optionsMatchs(deps.statut || undefined))
  },
  component: MesMatchs,
})

function MesMatchs() {
  const { statut } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur
  const queryClient = useQueryClient()
  const { data, isPending } = useQuery(optionsMatchs(statut || undefined))

  useResynchronisation(cles.matchs.tous)

  // Un match qui démarre arrive sur le salon privé de chaque joueur.
  useEvenement('match.cree', (m) => remplacerMatch(queryClient, m, { ajouter: true }), salons.utilisateur(moi.id))

  /**
   * Les événements de match sont diffusés sur `match:<id>` : on s'abonne aux matchs affichés
   * qui peuvent encore bouger. Un match terminé n'émet plus rien — l'exclure garde la liste
   * d'abonnements courte même quand l'historique est long. Le serveur n'accepte ces salons
   * que pour les deux joueurs du match.
   */
  const salonsMatchs = (data ?? []).filter((m) => m.statut !== 'termine').map((m) => salons.match(m.id))

  /** Applique un correctif à un match de la liste sans aucun appel réseau. */
  const patcher = (matchId: string, patch: Partial<MatchEnrichi>) => {
    const courant = (data ?? []).find((m) => m.id === matchId)
    if (courant) remplacerMatch(queryClient, { ...courant, ...patch })
  }

  useSalon(salonsMatchs, (evenement) => {
    switch (evenement.evenement) {
      case 'match.termine':
        remplacerMatch(queryClient, evenement.charge)
        return
      case 'match.score_propose':
        patcher(evenement.charge.matchId, {
          manche: evenement.charge.manche,
          echeance: evenement.charge.echeanceConfirmation,
          echeanceType: 'confirmation',
        })
        return
      case 'match.desaccord':
        patcher(evenement.charge.matchId, {
          statut: 'preuve_requise',
          echeance: evenement.charge.echeancePreuve,
          echeanceType: 'preuve',
        })
        return
      case 'match.nul':
        patcher(evenement.charge.matchId, {
          statut: 'nul_en_attente',
          echeance: evenement.charge.echeanceChoix,
          echeanceType: 'choix_nul',
        })
        return
      case 'match.rejoue':
        patcher(evenement.charge.matchId, {
          statut: 'en_cours',
          manche: evenement.charge.manche,
          scoreJoueur1: undefined,
          scoreJoueur2: undefined,
          gagnantId: undefined,
          perdantId: undefined,
          echeance: undefined,
          echeanceType: '',
        })
        return
      case 'match.litige_ouvert':
        patcher(evenement.charge.matchId, { statut: 'litige', echeance: undefined, echeanceType: '' })
        return
      case 'match.chrono':
        patcher(evenement.charge.matchId, { echeance: evenement.charge.echeance, echeanceType: evenement.charge.type })
        return
      default:
        return
    }
  })

  return (
    <>
      <EnTetePage
        surtitre="Arène"
        titre="Mes matchs"
        description="Tous vos matchs, du premier coup d’envoi au règlement."
        actions={<IndicateurDirect variante="etiquette" cliquable className="self-center" />}
      />
      <div role="tablist" className="mb-6 flex max-w-full flex-wrap gap-1 rounded-2xl border border-trait bg-papier p-1 sm:inline-flex sm:flex-nowrap sm:rounded-full">
        {STATUTS.map((s) => (
          <button
            key={s || 'tous'}
            type="button"
            role="tab"
            aria-selected={statut === s}
            onClick={() => navigate({ search: { statut: s } })}
            className={`etiquette h-11 shrink-0 rounded-full px-4 transition-colors sm:h-9 ${statut === s ? 'bg-vert text-craie' : 'text-muet hover:bg-vert-pale hover:text-vert'}`}
          >
            {s ? statuts.match[s]?.libelle : 'Tous'}
          </button>
        ))}
      </div>
      {isPending ? (
        <SkeletonCarte nombre={4} />
      ) : data && data.length > 0 ? (
        <Cascade className="grid gap-3 lg:grid-cols-2">
          {data.map((m) => (
            <ElementCascade key={m.id} className="h-full">
              <CarteMatch match={m} moiId={moi.id} />
            </ElementCascade>
          ))}
        </Cascade>
      ) : (
        <EmptyState
          icone={icone.match}
          titre={statut ? 'Aucun match dans cet état' : 'Aucun match pour l’instant'}
          description="Un match est créé dès qu’un défi est rejoint : par vous, ou par un adversaire sur l’un de vos défis."
          action={
            <LienBouton to="/joueur/defis" variante="volt" iconeDebut={icone.defi}>
              Voir les défis ouverts
            </LienBouton>
          }
        />
      )}
    </>
  )
}
