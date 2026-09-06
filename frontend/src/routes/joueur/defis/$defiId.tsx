import { useState, type ReactNode } from 'react'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone, iconePlateforme } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatDateRelative, formatMontant, formatPourcentage, versNombre } from '@/lib/format'
import { optionsDetailDefi, optionsPortefeuille, optionsRegles } from '@/lib/requetes'
import { annulerDefi, rejoindreDefi } from '@/services/defis'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button, LienBouton } from '@/components/partages/button/button'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

export const Route = createFileRoute('/joueur/defis/$defiId')({
  head: () => ({ meta: [{ title: 'Détail du défi — QUI PERD' }] }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsDetailDefi(params.defiId)),
      context.queryClient.ensureQueryData(optionsRegles),
      context.queryClient.ensureQueryData(optionsPortefeuille),
    ])
  },
  component: DetailDefi,
})

function DetailDefi() {
  const { defiId } = Route.useParams()
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur
  const { data } = useSuspenseQuery(optionsDetailDefi(defiId))
  const { data: regles } = useSuspenseQuery(optionsRegles)
  const { data: portefeuille } = useSuspenseQuery(optionsPortefeuille)
  const defi = data.defi
  const match = data.match
  const mien = defi.createurId === moi.id
  const mise = versNombre(defi.montantMise)
  const disponible = versNombre(portefeuille.soldeDisponible)
  const total = mise * 2
  const gainEstime = total - total * regles.commissionDefi

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const rejoindre = useServerFn(rejoindreDefi)
  const annuler = useServerFn(annulerDefi)
  const [confirmRejoindre, setConfirmRejoindre] = useState(false)
  const [confirmAnnuler, setConfirmAnnuler] = useState(false)

  const invalider = () => {
    void queryClient.invalidateQueries({ queryKey: cles.defis.tous })
    void queryClient.invalidateQueries({ queryKey: cles.matchs.tous })
    void queryClient.invalidateQueries({ queryKey: cles.portefeuille.tous })
  }

  const mutRejoindre = useMutation({
    mutationFn: () => rejoindre({ data: { id: defiId } }),
    onSuccess: async (r) => {
      setConfirmRejoindre(false)
      if (!r.ok) {
        toastErreur(r.statut === 422 ? 'Solde insuffisant' : 'Impossible de rejoindre', r.message)
        invalider()
        return
      }
      toastSucces('Défi rejoint !', `${formatMontant(mise)} bloqués. Le match peut commencer.`)
      invalider()
      await navigate({ to: '/joueur/matchs/$matchId', params: { matchId: r.donnees.id } })
    },
  })

  const mutAnnuler = useMutation({
    mutationFn: () => annuler({ data: { id: defiId } }),
    onSuccess: async (r) => {
      setConfirmAnnuler(false)
      if (!r.ok) {
        toastErreur('Annulation impossible', r.message)
        invalider()
        return
      }
      toastSucces('Défi annulé', 'Votre mise vous a été rendue, moins la commission.')
      invalider()
      await navigate({ to: '/joueur/defis', search: { onglet: 'mes' } })
    },
  })

  return (
    <>
      <EnTetePage
        surtitre={`Défi · ${defi.jeuNom}`}
        titre={formatMontant(defi.montantMise, defi.devise)}
        description={mien ? 'Vous avez créé ce défi.' : `Proposé par ${defi.createurNom}.`}
        actions={
          <>
            <LienBouton to="/joueur/defis" variante="fantome" iconeDebut={icone.precedent}>
              Retour
            </LienBouton>
            {match ? (
              <LienBouton to="/joueur/matchs/$matchId" params={{ matchId: match.id }} variante="volt" iconeDebut={icone.match}>
                Voir le match
              </LienBouton>
            ) : defi.statut === 'ouvert' && mien ? (
              <Button variante="danger" onClick={() => setConfirmAnnuler(true)} iconeDebut={icone.interdire}>
                Annuler le défi
              </Button>
            ) : defi.statut === 'ouvert' ? (
              <Button variante="volt" onClick={() => setConfirmRejoindre(true)} iconeDebut={icone.poigneeDeMain}>
                Rejoindre pour {formatMontant(mise)}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <TableauScore
            joueur1={defi.createurNom}
            joueur2={match ? match.joueur2Nom : mien ? 'En attente…' : 'Vous ?'}
            score1={match?.scoreJoueur1 ?? null}
            score2={match?.scoreJoueur2 ?? null}
            gagnant={match?.gagnantId ? (match.gagnantId === match.joueur1Id ? 1 : 2) : null}
            etiquette={`${defi.jeuNom} · ${defi.plateformeNom}`}
            enDirect={match?.statut === 'en_cours'}
            sousTitre={match ? undefined : defi.statut === 'ouvert' ? 'Défi ouvert — un adversaire peut rejoindre' : undefined}
          />
          <dl className="grid gap-px border-2 border-encre bg-encre sm:grid-cols-2">
            <Info libelle="Statut">
              <BadgeStatut famille="defi" valeur={defi.statut} />
            </Info>
            <Info libelle="Plateforme">
              <span className="flex items-center gap-2">
                <FontAwesomeIcon icon={iconePlateforme(defi.plateformeNom)} /> {defi.plateformeNom}
              </span>
            </Info>
            <Info libelle="Créé">{formatDateHeure(defi.dateCreation)}</Info>
            <Info libelle="Expiration">
              {defi.dateExpiration ? `${formatDateHeure(defi.dateExpiration)} (${formatDateRelative(defi.dateExpiration)})` : '—'}
            </Info>
            <Info libelle="Règles du match" large>
              {defi.regles ? <p className="whitespace-pre-line">{defi.regles}</p> : <span className="text-muet">Aucune règle particulière : conditions par défaut du jeu.</span>}
            </Info>
          </dl>
        </div>

        <aside className="ticket-sm h-fit border-2 border-encre bg-nuit p-5 text-craie">
          <span className="etiquette text-craie/60">Enjeu</span>
          <dl className="mt-3 space-y-2 text-legende">
            <LigneEnjeu libelle="Mise par joueur" valeur={formatMontant(mise)} />
            <LigneEnjeu libelle="Total en séquestre" valeur={formatMontant(total)} fort />
            <LigneEnjeu libelle={`Commission (${formatPourcentage(regles.commissionDefi)})`} valeur={`− ${formatMontant(total * regles.commissionDefi)}`} />
          </dl>
          <div className="mt-4 border-t border-craie/15 pt-4">
            <span className="etiquette text-craie/60">Gain estimé du vainqueur</span>
            <p className="chiffres mt-1 text-h1 font-bold text-volt">{formatMontant(gainEstime)}</p>
          </div>
          {!mien && defi.statut === 'ouvert' && (
            <p className={`mt-4 flex items-start gap-2 text-legende ${mise > disponible ? 'text-perte' : 'text-craie/70'}`}>
              <FontAwesomeIcon icon={mise > disponible ? icone.attention : icone.info} className="mt-0.5" />
              {mise > disponible ? `Solde disponible insuffisant (${formatMontant(disponible)}).` : `Votre solde disponible : ${formatMontant(disponible)}.`}
            </p>
          )}
        </aside>
      </div>

      <ConfirmModal
        ouvert={confirmRejoindre}
        onFermer={() => setConfirmRejoindre(false)}
        onConfirmer={() => mutRejoindre.mutate()}
        titre="Rejoindre ce défi ?"
        variante="volt"
        libelleConfirmer={`Bloquer ${formatMontant(mise)} et jouer`}
        chargement={mutRejoindre.isPending}
      >
        <p>
          <strong className="chiffres">{formatMontant(mise)}</strong> seront immédiatement bloqués sur votre portefeuille. Le match contre{' '}
          <strong>{defi.createurNom}</strong> commence aussitôt : jouez, puis déclarez le score et envoyez vos preuves.
        </p>
        <p className="text-legende text-muet">Si les déclarations concordent et que les preuves sont validées, le gagnant reçoit {formatMontant(gainEstime)} (estimation).</p>
      </ConfirmModal>
      <ConfirmModal
        ouvert={confirmAnnuler}
        onFermer={() => setConfirmAnnuler(false)}
        onConfirmer={() => mutAnnuler.mutate()}
        titre="Annuler ce défi ?"
        variante="danger"
        libelleConfirmer="Annuler le défi"
        libelleAnnuler="Garder"
        chargement={mutAnnuler.isPending}
      >
        <p>Le défi sera retiré et votre mise de <strong className="chiffres">{formatMontant(mise)}</strong> remboursée, moins la commission de la plateforme.</p>
      </ConfirmModal>
    </>
  )
}

function Info({ libelle, children, large = false }: { libelle: string; children: ReactNode; large?: boolean }) {
  return (
    <div className={`bg-papier px-4 py-3 ${large ? 'sm:col-span-2' : ''}`}>
      <dt className="etiquette text-muet">{libelle}</dt>
      <dd className="mt-1 text-corps">{children}</dd>
    </div>
  )
}

function LigneEnjeu({ libelle, valeur, fort = false }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={fort ? 'font-bold text-craie' : 'text-craie/70'}>{libelle}</dt>
      <dd className={`chiffres ${fort ? 'font-bold' : ''}`}>{valeur}</dd>
    </div>
  )
}
