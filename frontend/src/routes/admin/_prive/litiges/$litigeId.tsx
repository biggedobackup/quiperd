import { useState } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant } from '@/lib/format'
import { optionsDetailMatch, optionsLitiges, optionsRegles, optionsUtilisateurs } from '@/lib/requetes'
import { deciderLitige } from '@/services/litiges'
import type { DecisionArbitrale, DecisionLitige, Litige } from '@/models/litige'
import { salons } from '@/temps-reel/evenements'
import { useEvenement } from '@/temps-reel/hooks'
import { remplacerMatch } from '@/temps-reel/cache'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { VerificationPreuves } from '@/components/admin/verification-preuves'
import { BandeauNouveautes, useFileTempsReel } from '@/components/admin/temps-reel-admin'
import { DecisionLitigeModal } from '@/components/admin/modals/decision-litige-modal'
import { Button, LienBouton } from '@/components/partages/button/button'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

export const Route = createFileRoute('/admin/_prive/litiges/$litigeId')({
  head: () => ({ meta: [{ title: 'Administration — Litige' }] }),
  loader: async ({ context, params }) => {
    const litiges = await context.queryClient.ensureQueryData(optionsLitiges('admin'))
    const litige = litiges.find((l) => l.id === params.litigeId)
    if (!litige) throw notFound()
    await Promise.all([
      context.queryClient.ensureQueryData(optionsDetailMatch(litige.matchId, 'admin')),
      context.queryClient.ensureQueryData(optionsRegles),
      context.queryClient.prefetchQuery(optionsUtilisateurs()),
    ])
    return { matchId: litige.matchId }
  },
  component: DetailLitige,
})

function DetailLitige() {
  const { litigeId } = Route.useParams()
  const { matchId } = Route.useLoaderData()
  const { data: litiges } = useSuspenseQuery(optionsLitiges('admin'))
  const { data } = useSuspenseQuery(optionsDetailMatch(matchId, 'admin'))
  const { data: regles } = useSuspenseQuery(optionsRegles)
  const litige = litiges.find((l) => l.id === litigeId)
  const match = data.match
  const nomDe = (id: string) => (id === match.joueur1Id ? match.joueur1Nom : id === match.joueur2Id ? match.joueur2Nom : 'Joueur')
  const queryClient = useQueryClient()
  const decider = useServerFn(deciderLitige)
  const [modal, setModal] = useState(false)

  // Salon du match (les administrateurs y sont admis) : une preuve déposée pendant l'examen
  // est annoncée, et une décision rendue par un autre arbitre arrive sans rechargement.
  const file = useFileTempsReel()
  const salonMatch = salons.match(matchId)
  useEvenement('match.preuve_envoyee', ({ preuveId }) => file.signaler(preuveId), salonMatch)
  useEvenement('match.termine', (m) => remplacerMatch(queryClient, m), salonMatch)
  useEvenement(
    'match.litige_resolu',
    ({ litigeId: id, decision }, enveloppe) => {
      queryClient.setQueryData<Litige[]>(optionsLitiges('admin').queryKey, (ancien) =>
        ancien?.map((l) =>
          l.id === id
            ? { ...l, statut: 'resolu', decision: decision as DecisionLitige, dateResolution: enveloppe.horodatage }
            : l,
        ),
      )
    },
    salonMatch,
  )

  const afficherPreuves = () => {
    file.vider()
    void queryClient.invalidateQueries({ queryKey: cles.matchs.preuves(matchId) })
  }

  const mutation = useMutation({
    mutationFn: (d: DecisionArbitrale) => decider({ data: { id: litigeId, ...d } }),
    onSuccess: (r) => {
      setModal(false)
      if (!r.ok) {
        toastErreur('Décision impossible', r.message)
        return
      }
      toastSucces('Litige résolu', r.donnees.decision === 'gagnant' ? 'Le gagnant a été crédité.' : 'Les deux joueurs ont récupéré leur mise, moins la commission.')
      void queryClient.invalidateQueries({ queryKey: cles.litiges.tous })
      void queryClient.invalidateQueries({ queryKey: cles.matchs.tous })
      void queryClient.invalidateQueries({ queryKey: cles.admin.statistiques })
    },
  })

  if (!litige) return null

  return (
    <>
      <EnTetePage
        surtitre={`Litige · ${match.jeuNom}`}
        titre={`${match.joueur1Nom} vs ${match.joueur2Nom}`}
        description={`Ouvert le ${formatDateHeure(litige.dateCreation)}${litige.ouvertParId ? ` par ${nomDe(litige.ouvertParId)}` : ' automatiquement (déclarations divergentes)'} · mise ${formatMontant(match.montantMise)} par joueur.`}
        actions={
          <>
            <LienBouton to="/admin/litiges" variante="fantome" iconeDebut={icone.precedent}>
              Litiges
            </LienBouton>
            {litige.statut === 'en_cours' && (
              <Button variante="volt" onClick={() => setModal(true)} iconeDebut={icone.arbitrage}>
                Rendre la décision
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <BadgeStatut famille="litige" valeur={litige.statut} />
          {litige.decision && <span className="etiquette text-muet">Décision : {litige.decision === 'gagnant' ? `règlement à ${match.gagnantId ? nomDe(match.gagnantId) : '—'}` : 'remboursement des deux joueurs'}</span>}
          {litige.dateResolution && <span className="chiffres text-legende text-muet">résolu le {formatDateHeure(litige.dateResolution)}</span>}
        </div>
        <blockquote className="rounded-xl border-l-4 border-perte bg-papier px-4 py-3 text-corps shadow-carte">« {litige.motif} »</blockquote>
        <TableauScore joueur1={match.joueur1Nom} joueur2={match.joueur2Nom} score1={match.scoreJoueur1 ?? null} score2={match.scoreJoueur2 ?? null} gagnant={match.gagnantId ? (match.gagnantId === match.joueur1Id ? 1 : 2) : null} etiquette="Issue enregistrée" sousTitre="Chaque joueur a déclaré de son point de vue" />
        <section className="rounded-2xl border border-trait bg-papier p-5 shadow-carte">
          <h3 className="text-h3">Déclarations</h3>
          {data.declarations.length === 0 ? (
            <p className="mt-3 text-legende text-muet">Aucune déclaration : litige ouvert avant la fin du match.</p>
          ) : (
            <ul className="mt-3 divide-y divide-trait">
              {data.declarations.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-legende">
                  <span>
                    <strong>{nomDe(d.utilisateurId)}</strong> :{' '}
                    <span className="font-bold">
                      {d.scorePour === d.scoreContre ? 'match nul' : d.scorePour > d.scoreContre ? 'se déclare vainqueur' : 'se déclare battu'}
                    </span>{' '}· gagnant déclaré {d.gagnantDeclareId ? nomDe(d.gagnantDeclareId) : 'nul'}
                    {d.commentaire && <span className="text-muet"> · « {d.commentaire} »</span>}
                  </span>
                  <span className="chiffres text-[12px] text-muet">{formatDateHeure(d.dateDeclaration)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-3 text-h3">Preuves des deux joueurs</h3>
          <BandeauNouveautes nombre={file.nombre} singulier="nouvelle preuve envoyée" plurielForme="nouvelles preuves envoyées" onAfficher={afficherPreuves} className="mb-3" />
          <VerificationPreuves matchId={matchId} nomDe={nomDe} />
        </section>
      </div>
      <DecisionLitigeModal ouvert={modal} onFermer={() => setModal(false)} onDecider={(d) => mutation.mutate(d)} match={match} commission={regles.commissionDefi} chargement={mutation.isPending} />
    </>
  )
}
