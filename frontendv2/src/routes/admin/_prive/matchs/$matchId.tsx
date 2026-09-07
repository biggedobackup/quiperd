import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant } from '@/lib/format'
import { optionsDetailMatch } from '@/lib/requetes'
import type { DetailMatch } from '@/models/match'
import { validerMatch } from '@/services/matchs'
import { salons } from '@/temps-reel/evenements'
import { useEvenement } from '@/temps-reel/hooks'
import { remplacerMatch } from '@/temps-reel/cache'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { VerificationPreuves } from '@/components/admin/verification-preuves'
import { AIDE_STATUT_MATCH } from '@/components/admin/statuts-match'
import { BandeauNouveautes, useFileTempsReel } from '@/components/admin/temps-reel-admin'
import { Button, LienBouton } from '@/components/partages/button/button'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

export const Route = createFileRoute('/admin/_prive/matchs/$matchId')({
  head: () => ({ meta: [{ title: 'Administration — Match' }] }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(optionsDetailMatch(params.matchId, 'admin'))
  },
  component: DetailMatchAdmin,
})

function DetailMatchAdmin() {
  const { matchId } = Route.useParams()
  const { data } = useSuspenseQuery(optionsDetailMatch(matchId, 'admin'))
  const match = data.match
  const nomDe = (id: string) => (id === match.joueur1Id ? match.joueur1Nom : id === match.joueur2Id ? match.joueur2Nom : 'Joueur')
  const queryClient = useQueryClient()
  const valider = useServerFn(validerMatch)
  const [confirm, setConfirm] = useState(false)

  // Salon du match : les administrateurs y sont admis au même titre que les deux joueurs.
  // Une preuve déposée pendant la lecture est annoncée (le lecteur vidéo ouvert n'est jamais
  // remplacé sous les yeux de l'arbitre) ; la fin de match, elle, s'écrit dans le cache.
  const file = useFileTempsReel()
  const salonMatch = salons.match(matchId)
  useEvenement('match.preuve_envoyee', ({ preuveId }) => file.signaler(preuveId), salonMatch)
  useEvenement('match.termine', (m) => remplacerMatch(queryClient, m), salonMatch)
  // Bascule en litige : la charge ne porte pas le match entier, on écrit le seul champ qui
  // change plutôt que de redemander la fiche au serveur.
  useEvenement(
    'match.litige_ouvert',
    () =>
      queryClient.setQueryData<DetailMatch>(optionsDetailMatch(matchId, 'admin').queryKey, (ancien) =>
        ancien ? { ...ancien, match: { ...ancien.match, statut: 'litige' } } : ancien,
      ),
    salonMatch,
  )

  const afficherPreuves = () => {
    file.vider()
    void queryClient.invalidateQueries({ queryKey: cles.matchs.preuves(matchId) })
  }

  const mutation = useMutation({
    mutationFn: () => valider({ data: { id: matchId } }),
    onSuccess: (r) => {
      setConfirm(false)
      if (!r.ok) {
        toastErreur('Validation impossible', r.message)
        return
      }
      toastSucces(r.donnees.statut === 'termine' ? 'Match réglé' : 'Aucun règlement', r.donnees.statut === 'termine' ? 'Le gagnant a été crédité, les mises soldées.' : `Le match est en statut « ${r.donnees.statut} », rien n’a été payé.`)
      void queryClient.invalidateQueries({ queryKey: cles.matchs.tous })
      void queryClient.invalidateQueries({ queryKey: cles.admin.statistiques })
    },
  })

  return (
    <>
      <EnTetePage
        surtitre={`${match.jeuNom} · ${match.plateformeNom}`}
        titre={`${match.joueur1Nom} vs ${match.joueur2Nom}`}
        description={`Mise ${formatMontant(match.montantMise, match.devise)} par joueur · créé le ${formatDateHeure(match.dateCreation)}`}
        actions={
          <>
            <LienBouton to="/admin/matchs" variante="fantome" iconeDebut={icone.precedent}>
              Matchs
            </LienBouton>
            {match.statut === 'verification' && (
              <Button variante="volt" onClick={() => setConfirm(true)} iconeDebut={icone.trophee}>
                Régler le match
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-6">
        <TableauScore joueur1={match.joueur1Nom} joueur2={match.joueur2Nom} score1={match.scoreJoueur1 ?? null} score2={match.scoreJoueur2 ?? null} gagnant={match.gagnantId ? (match.gagnantId === match.joueur1Id ? 1 : 2) : null} etiquette="Score déclaré" enDirect={match.statut === 'en_cours'} sousTitre={match.statut === 'termine' ? `Réglé le ${formatDateHeure(match.dateFin)}` : undefined} />
        <section className="rounded-2xl border border-trait bg-papier p-5 shadow-carte">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h3">Déclarations</h3>
            <BadgeStatut famille="match" valeur={match.statut} />
          </div>
          <p className="mt-2 text-legende text-muet">{AIDE_STATUT_MATCH[match.statut]}</p>
          {data.declarations.length === 0 ? (
            <p className="mt-3 text-legende text-muet">Aucune déclaration.</p>
          ) : (
            <ul className="mt-3 divide-y divide-trait">
              {data.declarations.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-legende">
                  <span>
                    <strong>{nomDe(d.utilisateurId)}</strong> déclare <span className="chiffres font-bold">{d.scorePour} — {d.scoreContre}</span> (gagnant : {d.gagnantDeclareId ? nomDe(d.gagnantDeclareId) : 'nul'})
                    {d.commentaire && <span className="text-muet"> · « {d.commentaire} »</span>}
                  </span>
                  <span className="chiffres text-[12px] text-muet">{formatDateHeure(d.dateDeclaration)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-3 text-h3">Preuves</h3>
          <BandeauNouveautes nombre={file.nombre} singulier="nouvelle preuve envoyée" plurielForme="nouvelles preuves envoyées" onAfficher={afficherPreuves} className="mb-3" />
          <VerificationPreuves matchId={matchId} nomDe={nomDe} />
        </section>
      </div>
      <ConfirmModal ouvert={confirm} onFermer={() => setConfirm(false)} onConfirmer={() => mutation.mutate()} titre="Régler ce match maintenant ?" variante="volt" libelleConfirmer="Régler et payer le gagnant" chargement={mutation.isPending}>
        <p>
          Le gagnant déclaré, <strong>{match.gagnantId ? nomDe(match.gagnantId) : '—'}</strong>, recevra les deux mises moins la commission. Cette opération est irréversible et ne peut pas être rejouée.
        </p>
      </ConfirmModal>
    </>
  )
}
