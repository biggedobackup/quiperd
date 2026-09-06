import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { formatDateHeure, formatIdentifiant, formatMontant } from '@/lib/format'
import { optionsLitiges, optionsMatchs } from '@/lib/requetes'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonLignes } from '@/components/partages/skeleton/skeleton'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'

export const Route = createFileRoute('/joueur/litiges')({
  head: () => ({ meta: [{ title: 'Mes litiges — QUI PERD' }] }),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(optionsLitiges()), context.queryClient.prefetchQuery(optionsMatchs())])
  },
  component: PageLitiges,
})

function PageLitiges() {
  const litiges = useQuery(optionsLitiges())
  const matchs = useQuery(optionsMatchs())
  const matchDe = (id: string) => matchs.data?.find((m) => m.id === id)

  return (
    <>
      <EnTetePage surtitre="Arbitrage" titre="Mes litiges" description="Tant qu’un litige est en cours, les deux mises restent bloquées. L’arbitre règle le match au gagnant ou rend leur mise aux deux joueurs, moins la commission." />
      {litiges.isPending ? (
        <SkeletonLignes lignes={3} colonnes={3} />
      ) : litiges.data && litiges.data.length > 0 ? (
        <Cascade className="space-y-3">
          {litiges.data.map((l) => {
            const m = matchDe(l.matchId)
            return (
              <ElementCascade key={l.id}>
                <article className="ticket-sm grid gap-4 border-2 border-encre bg-papier p-5 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BadgeStatut famille="litige" valeur={l.statut} />
                      {l.decision && <span className="etiquette text-muet">Décision : {l.decision === 'gagnant' ? 'règlement au gagnant' : 'remboursement des deux joueurs'}</span>}
                    </div>
                    <h3 className="mt-2 text-h3">{m ? `${m.joueur1Nom} vs ${m.joueur2Nom}` : `Match ${formatIdentifiant(l.matchId)}`}</h3>
                    <p className="mt-1 text-legende text-muet">
                      {m && `${m.jeuNom} · ${formatMontant(m.montantMise)} par joueur · `}
                      ouvert le {formatDateHeure(l.dateCreation)}
                      {l.dateResolution && ` · résolu le ${formatDateHeure(l.dateResolution)}`}
                    </p>
                    <p className="mt-3 border-l-2 border-trait pl-3 text-legende">« {l.motif} »</p>
                  </div>
                  <Link to="/joueur/matchs/$matchId" params={{ matchId: l.matchId }} className="etiquette flex h-9 items-center gap-2 self-start border-2 border-encre px-3 hover:bg-volt hover:text-nuit">
                    Voir le match <FontAwesomeIcon icon={icone.suivant} />
                  </Link>
                </article>
              </ElementCascade>
            )
          })}
        </Cascade>
      ) : (
        <EmptyState icone={icone.litige} titre="Aucun litige" description="Tant mieux : vos matchs se règlent sans arbitre." />
      )}
    </>
  )
}
