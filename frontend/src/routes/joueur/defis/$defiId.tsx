import { useState, type ReactNode } from 'react'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone, iconePlateforme } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant, formatPourcentage, versNombre } from '@/lib/format'
import { optionsDetailDefi, optionsPortefeuille, optionsRegles } from '@/lib/requetes'
import { annulerDefi, rejoindreDefi } from '@/services/defis'
import { salons } from '@/temps-reel/evenements'
import { useEvenement } from '@/temps-reel/hooks'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { BoutonPartageDefi } from '@/components/joueur/bouton-partage-defi'
import { BlocEmailNonConfirme, estRefusEmail, toastRefusEmail, useEmailNonConfirme } from '@/components/joueur/email-non-verifie'
import { useDefisEnDirect } from '@/components/partages/defis-en-direct/defis-en-direct'
import { CompteAReboursDefi } from '@/components/partages/defis-en-direct/animation-defis'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { Button, LienBouton } from '@/components/partages/button/button'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

/** Ce qui met fin au défi pendant qu'on le regarde — sert de bandeau et d'action suivante. */
type Denouement = { genre: 'rejoint'; matchId: string } | { genre: 'annule' } | { genre: 'expire' }

const routeJoueur = getRouteApi('/joueur')

export const Route = createFileRoute('/joueur/defis/$defiId')({
  head: () => ({ meta: [{ title: 'Détail du défi — Défis en Ligne' }] }),
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
  const [denouement, setDenouement] = useState<Denouement | null>(null)
  // Rejoindre exige une adresse confirmée (403 côté backend) : on remplace le bouton plutôt
  // que de faire ouvrir une confirmation de mise qui échouerait.
  const emailNonConfirmeSession = useEmailNonConfirme()
  const [refuseParLeServeur, setRefuseParLeServeur] = useState(false)
  const emailBloque = emailNonConfirmeSession || refuseParLeServeur

  // Salon public (le défi peut être rejoint par n'importe qui) + salon personnel.
  const ecoutes = [salons.defisPublics, salons.utilisateur(moi.id)]
  useDefisEnDirect({ utilisateurId: moi.id })

  // Le cache est déjà tenu à jour par `useDefisEnDirect` (le bouton « Rejoindre » disparaît de
  // lui-même) ; ici on retient seulement ce qui vient de se passer sous les yeux du joueur.
  useEvenement(
    'defi.rejoint',
    (charge) => {
      if (charge.defiId === defiId) setDenouement({ genre: 'rejoint', matchId: charge.matchId })
    },
    ecoutes,
  )
  useEvenement(
    'defi.annule',
    (charge) => {
      if (charge.defiId === defiId) setDenouement({ genre: 'annule' })
    },
    ecoutes,
  )
  useEvenement(
    'defi.expire',
    (charge) => {
      if (charge.defiId === defiId) setDenouement({ genre: 'expire' })
    },
    ecoutes,
  )

  // Identifiant du match : celui de la fiche, ou celui annoncé à l'instant par le hub.
  const matchId = match?.id ?? (denouement?.genre === 'rejoint' ? denouement.matchId : undefined)
  const ouvert = defi.statut === 'ouvert'

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
        if (estRefusEmail(r)) {
          setRefuseParLeServeur(true)
          toastRefusEmail(r)
          return
        }
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
      toastSucces('Défi annulé', 'Votre mise vous a été rendue en totalité.')
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
            {matchId ? (
              <LienBouton to="/joueur/matchs/$matchId" params={{ matchId }} variante="volt" iconeDebut={icone.match}>
                Voir le match
              </LienBouton>
            ) : ouvert && mien ? (
              <Button variante="danger" onClick={() => setConfirmAnnuler(true)} iconeDebut={icone.interdire}>
                Annuler le défi
              </Button>
            ) : ouvert && emailBloque ? (
              <LienBouton to="/joueur/confirmation-email" search={{ vers: `/joueur/defis/${defiId}` }} variante="secondaire" iconeDebut={icone.courriel}>
                Confirmer mon e-mail
              </LienBouton>
            ) : ouvert ? (
              <Button variante="volt" onClick={() => setConfirmRejoindre(true)} iconeDebut={icone.poigneeDeMain}>
                Rejoindre pour {formatMontant(mise)}
              </Button>
            ) : null}
            {/*
              Partage possible tant que le défi cherche un adversaire — pour son créateur comme
              pour n'importe qui : envoyer le lien à un ami est la façon la plus directe de lui
              trouver un adversaire. Une fois le défi rejoint ou expiré, le lien n'a plus d'objet.
            */}
            {ouvert && <BoutonPartageDefi defiId={defiId} />}
          </>
        }
      />

      {denouement && <BandeauDenouement denouement={denouement} mien={mien} />}

      {ouvert && !mien && emailBloque && (
        <BlocEmailNonConfirme
          action="rejoindre un défi"
          vers={`/joueur/defis/${defiId}`}
          note="Le défi reste ouvert le temps que vous saisissiez le code — sauf si quelqu’un d’autre le rejoint d’abord."
          className="mb-6"
        />
      )}

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
            sousTitre={match ? undefined : ouvert ? 'Défi ouvert — un adversaire peut rejoindre' : undefined}
          />
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-trait bg-trait sm:grid-cols-2">
            <Info libelle="Statut">
              <span className="flex flex-wrap items-center gap-2">
                <BadgeStatut famille="defi" valeur={defi.statut} />
                <IndicateurDirect cliquable />
              </span>
            </Info>
            <Info libelle="Plateforme">
              <span className="flex items-center gap-2">
                <FontAwesomeIcon icon={iconePlateforme(defi.plateformeNom)} /> {defi.plateformeNom}
              </span>
            </Info>
            <Info libelle="Créé">{formatDateHeure(defi.dateCreation)}</Info>
            <Info libelle="Expiration">
              {defi.dateExpiration ? (
                <span className="flex flex-wrap items-center gap-x-2">
                  <span>{formatDateHeure(defi.dateExpiration)}</span>
                  {ouvert && (
                    <CompteAReboursDefi
                      defiId={defiId}
                      echeance={defi.dateExpiration}
                      libelle="dans"
                      surExpiration={() => setDenouement({ genre: 'expire' })}
                    />
                  )}
                </span>
              ) : (
                '—'
              )}
            </Info>
            <Info libelle="Règles du match" large>
              {defi.regles ? <p className="whitespace-pre-line">{defi.regles}</p> : <span className="text-muet">Aucune règle particulière : conditions par défaut du jeu.</span>}
            </Info>
          </dl>
        </div>

        <aside className="h-fit rounded-2xl bg-encre p-5 text-craie">
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
          {!mien && ouvert && (
            <p className={`mt-4 flex items-start gap-2 text-legende ${mise > disponible ? 'text-perte' : 'text-craie/70'}`}>
              <FontAwesomeIcon icon={mise > disponible ? icone.attention : icone.info} className="mt-0.5" />
              {mise > disponible ? `Solde disponible insuffisant (${formatMontant(disponible)}).` : `Votre solde disponible : ${formatMontant(disponible)}.`}
            </p>
          )}
        </aside>
      </div>

      {/* Le défi peut cesser d'être ouvert pendant que la fenêtre est affichée : elle se referme. */}
      <ConfirmModal
        ouvert={confirmRejoindre && ouvert}
        onFermer={() => setConfirmRejoindre(false)}
        onConfirmer={() => mutRejoindre.mutate()}
        titre="Rejoindre ce défi ?"
        variante="volt"
        libelleConfirmer={`Bloquer ${formatMontant(mise)} et jouer`}
        chargement={mutRejoindre.isPending}
      >
        <p>
          <strong className="chiffres">{formatMontant(mise)}</strong> seront immédiatement bloqués sur votre portefeuille. Le match contre{' '}
          <strong>{defi.createurNom}</strong> commence aussitôt : jouez, puis déclarez le résultat et envoyez vos preuves.
        </p>
        <p className="text-legende text-muet">Si les déclarations concordent et que les preuves sont validées, le gagnant reçoit {formatMontant(gainEstime)} (estimation).</p>
      </ConfirmModal>
      <ConfirmModal
        ouvert={confirmAnnuler && ouvert}
        onFermer={() => setConfirmAnnuler(false)}
        onConfirmer={() => mutAnnuler.mutate()}
        titre="Annuler ce défi ?"
        variante="danger"
        libelleConfirmer="Annuler le défi"
        libelleAnnuler="Garder"
        chargement={mutAnnuler.isPending}
      >
        <p>Le défi sera retiré et votre mise de <strong className="chiffres">{formatMontant(mise)}</strong> rendue <strong>en totalité</strong>, sans commission.</p>
      </ConfirmModal>
    </>
  )
}

/**
 * Le défi vient de changer d'état sous les yeux du joueur : on le dit tout de suite et on propose
 * l'action suivante, plutôt que de laisser un bouton « Rejoindre » qui échouerait.
 */
function BandeauDenouement({ denouement, mien }: { denouement: Denouement; mien: boolean }) {
  const contenu: { icone: IconDefinition; cadre: string; titre: string; texte: string; action: ReactNode } =
    denouement.genre === 'rejoint'
      ? {
          icone: icone.poigneeDeMain,
          cadre: 'border-vert bg-vert-pale',
          titre: mien ? 'Un adversaire vient de rejoindre votre défi' : 'Ce défi vient d’être rejoint',
          texte: mien
            ? 'Les deux mises sont bloquées : le match peut commencer.'
            : 'Un autre joueur a été plus rapide. Votre solde n’a pas bougé.',
          action: mien ? (
            <LienBouton to="/joueur/matchs/$matchId" params={{ matchId: denouement.matchId }} variante="volt" iconeDebut={icone.match}>
              Voir le match
            </LienBouton>
          ) : (
            <LienBouton to="/joueur/defis" variante="secondaire" iconeDebut={icone.precedent}>
              Voir les autres défis
            </LienBouton>
          ),
        }
      : denouement.genre === 'annule'
        ? {
            icone: icone.interdire,
            cadre: 'border-trait bg-gris',
            titre: 'Ce défi vient d’être annulé',
            texte: mien ? 'Votre mise vous a été rendue en totalité.' : 'Son créateur l’a retiré de l’arène.',
            action: (
              <LienBouton to="/joueur/defis" variante="secondaire" iconeDebut={icone.precedent}>
                Retour aux défis
              </LienBouton>
            ),
          }
        : {
            icone: icone.horloge,
            cadre: 'border-alerte bg-alerte-fond',
            titre: 'Ce défi vient d’expirer',
            texte: mien ? 'Aucun adversaire ne l’a rejoint : votre mise vous est rendue en totalité.' : 'Personne ne l’a rejoint à temps.',
            action: (
              <LienBouton to="/joueur/defis" variante="secondaire" iconeDebut={icone.precedent}>
                Retour aux défis
              </LienBouton>
            ),
          }

  return (
    <div className="mb-6">
      <div role="status" aria-live="polite" className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${contenu.cadre}`}>
        <div className="flex items-start gap-3">
          <FontAwesomeIcon icon={contenu.icone} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-bold leading-tight">{contenu.titre}</p>
            <p className="mt-0.5 text-legende text-muet">{contenu.texte}</p>
          </div>
        </div>
        <div className="shrink-0">{contenu.action}</div>
      </div>
    </div>
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
