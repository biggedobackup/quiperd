import { useMemo, useState } from 'react'
import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatIdentifiant, formatMontant, formatMontantSigne } from '@/lib/format'
import { typesTransaction } from '@/lib/statuts'
import { optionsLitiges, optionsMatchs } from '@/lib/requetes'
import type { DecisionLitige, Litige } from '@/models/litige'
import type { TransactionPortefeuille } from '@/models/transaction-portefeuille'
import { salons } from '@/temps-reel/evenements'
import { useEvenement, useResynchronisation, useSalon } from '@/temps-reel/hooks'
import { ajouterNotification, ajouterTransaction, fusionnerSolde } from '@/temps-reel/cache'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { EmptyState } from '@/components/partages/empty-state/empty-state'
import { SkeletonLignes } from '@/components/partages/skeleton/skeleton'
import { useAttenteDouce } from '@/components/partages/skeleton/attente'
import { Cascade, ElementCascade } from '@/components/partages/animation/animation'
import { toastAttention, toastInfo, toastSucces } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

/** Au-delà, on n'ouvre plus de salon : un joueur n'a jamais des dizaines de matchs vivants. */
const MAX_SALONS_MATCHS = 30

export const Route = createFileRoute('/joueur/litiges')({
  head: () => ({ meta: [{ title: 'Mes litiges — QUI PERD' }] }),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(optionsLitiges()), context.queryClient.ensureQueryData(optionsMatchs())])
  },
  component: PageLitiges,
})

/**
 * Mes litiges — vivants sans aucun rafraîchissement périodique.
 *
 * `match.litige_ouvert` et `match.litige_resolu` ne circulent PAS sur le salon privé du
 * joueur mais sur le salon de chaque match (`backend/litiges/litiges.go`). L'écran s'abonne
 * donc aux salons des matchs concernés — ceux qui portent déjà un litige, plus les matchs
 * encore actifs, sur lesquels un litige peut s'ouvrir pendant la lecture.
 *
 * La charge de ces deux événements ne contient pas le litige entier : on écrit dans le cache
 * les seuls champs qui changent plutôt que de redemander la liste au serveur.
 */
function PageLitiges() {
  const { session } = routeJoueur.useRouteContext()
  const queryClient = useQueryClient()
  const litiges = useQuery(optionsLitiges())
  const matchs = useQuery(optionsMatchs())
  // Squelette différé : rien si la donnée arrive vite, pas de clignotement si elle tarde.
  const attenteLitiges = useAttenteDouce(litiges.isPending)
  const matchDe = (id: string) => matchs.data?.find((m) => m.id === id)

  /** Mouvements d'argent reçus en direct, rangés par match : le règlement du litige, visible. */
  const [mouvements, setMouvements] = useState<Record<string, readonly TransactionPortefeuille[]>>({})
  const [recents, setRecents] = useState<readonly string[]>([])

  const salonsMatchs = useMemo(() => {
    const identifiants = new Set<string>()
    for (const l of litiges.data ?? []) identifiants.add(l.matchId)
    for (const m of matchs.data ?? []) if (m.statut !== 'termine') identifiants.add(m.id)
    return [...identifiants].slice(0, MAX_SALONS_MATCHS).map((id) => salons.match(id))
  }, [litiges.data, matchs.data])

  const salonMoi = salons.utilisateur(session.utilisateur.id)

  // Demande les salons des matchs ; les gestionnaires typés sont posés juste en dessous.
  useSalon(salonsMatchs, () => {})
  useResynchronisation([cles.litiges.tous, cles.matchs.tous])

  useEvenement('match.litige_ouvert', ({ litigeId, matchId, motif }, enveloppe) => {
    queryClient.setQueryData<Litige[]>(optionsLitiges().queryKey, (ancien) => {
      if (!ancien || ancien.some((l) => l.id === litigeId)) return ancien
      const nouveau: Litige = {
        id: litigeId,
        dateCreation: enveloppe.horodatage,
        matchId,
        motif,
        statut: 'en_cours',
        decision: '',
      }
      return [nouveau, ...ancien]
    })
    setRecents((liste) => (liste.includes(litigeId) ? liste : [litigeId, ...liste]))
    toastAttention('Litige ouvert sur votre match', 'Vos deux mises restent bloquées jusqu’à la décision de l’arbitre.')
  })

  useEvenement('match.litige_resolu', ({ litigeId, decision }, enveloppe) => {
    queryClient.setQueryData<Litige[]>(optionsLitiges().queryKey, (ancien) =>
      ancien?.map((l) =>
        l.id === litigeId
          ? { ...l, statut: 'resolu', decision: decision as DecisionLitige, dateResolution: enveloppe.horodatage }
          : l,
      ),
    )
    setRecents((liste) => (liste.includes(litigeId) ? liste : [litigeId, ...liste]))
    toastSucces(
      'Décision rendue',
      decision === 'remboursement'
        ? 'Match annulé : chaque joueur récupère sa mise, moins la commission.'
        : 'L’arbitre a désigné un gagnant : le règlement vient d’être effectué.',
    )
  })

  // Le mouvement d'argent qui accompagne la décision, sur le salon privé du joueur.
  useEvenement('portefeuille.maj', (solde) => fusionnerSolde(queryClient, solde), salonMoi)
  useEvenement(
    'transaction.creee',
    (transaction) => {
      ajouterTransaction(queryClient, transaction)
      if (!transaction.matchId) return
      const matchId = transaction.matchId
      setMouvements((tous) => {
        const existants = tous[matchId] ?? []
        if (existants.some((t) => t.id === transaction.id)) return tous
        return { ...tous, [matchId]: [...existants, transaction] }
      })
    },
    salonMoi,
  )
  useEvenement(
    'notification.nouvelle',
    (notification) => {
      ajouterNotification(queryClient, notification)
      // Le litige a déjà son propre toast : on n'annonce que le reste.
      if (notification.type === 'litige_ouvert' || notification.type === 'litige_resolu') return
      toastInfo(notification.titre, notification.message)
    },
    salonMoi,
  )

  return (
    <>
      <EnTetePage
        surtitre="Arbitrage"
        titre="Mes litiges"
        description="Tant qu’un litige est en cours, les deux mises restent bloquées. L’arbitre règle le match au gagnant ou rend leur mise aux deux joueurs, moins la commission."
        actions={<IndicateurDirect variante="etiquette" cliquable className="self-center" />}
      />
      {attenteLitiges ? (
        <SkeletonLignes lignes={3} colonnes={3} />
      ) : litiges.data && litiges.data.length > 0 ? (
        <Cascade className="space-y-3">
          {litiges.data.map((l) => {
            const m = matchDe(l.matchId)
            const lignes = mouvements[l.matchId] ?? []
            return (
              <ElementCascade key={l.id}>
                <article className={`grid gap-4 rounded-2xl border bg-papier p-5 md:grid-cols-[1fr_auto] ${recents.includes(l.id) ? 'animate-apparition border-vert' : 'border-trait'}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BadgeStatut famille="litige" valeur={l.statut} />
                      {l.decision && <span className="etiquette text-muet">Décision : {l.decision === 'gagnant' ? 'règlement au gagnant' : 'remboursement des deux joueurs'}</span>}
                      {recents.includes(l.id) && <span className="etiquette rounded-full bg-vert px-2 py-0.5 text-craie">En direct</span>}
                    </div>
                    <h3 className="mt-2 text-h3">{m ? `${m.joueur1Nom} vs ${m.joueur2Nom}` : `Match ${formatIdentifiant(l.matchId)}`}</h3>
                    <p className="mt-1 text-legende text-muet">
                      {m && `${m.jeuNom} · ${formatMontant(m.montantMise)} par joueur · `}
                      ouvert le {formatDateHeure(l.dateCreation)}
                      {l.dateResolution && ` · résolu le ${formatDateHeure(l.dateResolution)}`}
                    </p>
                    <p className="mt-3 border-l border-trait pl-3 text-legende">« {l.motif} »</p>
                    {lignes.length > 0 && (
                      <ul className="mt-3 space-y-1 border-l border-vert pl-3">
                        {lignes.map((t) => {
                          const sens = typesTransaction[t.type]?.sens ?? 'neutre'
                          return (
                            <li key={t.id} className="flex flex-wrap items-center gap-2 text-legende">
                              <span className="etiquette text-muet">{typesTransaction[t.type]?.libelle ?? t.type}</span>
                              <span className={`chiffres font-bold ${sens === 'credit' ? 'text-gain' : sens === 'debit' ? 'text-perte' : 'text-muet'}`}>
                                {formatMontantSigne(t.montant, sens)}
                              </span>
                              <span className="text-muet">{t.description}</span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                  <Link to="/joueur/matchs/$matchId" params={{ matchId: l.matchId }} className="etiquette flex h-11 items-center gap-2 self-start rounded-[10px] border border-trait px-3.5 transition-colors hover:border-vert hover:text-vert">
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
