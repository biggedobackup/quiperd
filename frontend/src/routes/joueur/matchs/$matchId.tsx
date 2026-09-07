/**
 * Écran de match — entièrement piloté par le direct.
 *
 * Aucun `refetchInterval`, aucun `setInterval` de rafraîchissement : l'écran s'abonne au
 * salon `match:<id>` et écrit les événements reçus directement dans le cache TanStack Query.
 * Les seules requêtes déclenchées après le chargement sont :
 *   - la resynchronisation à chaque (re)connexion du socket (`useResynchronisation`) ;
 *   - une invalidation ponctuelle quand une preuve est déposée (l'événement ne porte pas le
 *     fichier) ou quand un chrono expire alors que le direct est peut-être coupé.
 *
 * Parcours de fin de match : deux déclarations identiques règlent tout immédiatement (aucune
 * preuve, aucun arbitre) ; une divergence exige une preuve des deux côtés ; un nul déclaré
 * des deux côtés ouvre le choix rejouer / partager ; l'absence de réponse dans le délai donne
 * la victoire au joueur qui avait déclaré.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant } from '@/lib/format'
import { optionsDetailMatch, optionsPreuves, optionsRegles } from '@/lib/requetes'
import { choisirApresNul, confirmerScore, declarerScore, ouvrirLitige } from '@/services/matchs'
import {
  numeroManche,
  type ChoixNulMatch,
  type ChoixNulValeur,
  type Declaration as SaisieResultat,
  type DetailMatch as DonneesMatch,
  type MatchEnrichi,
} from '@/models/match'
import type { ResultatDeclare } from '@/models/resultat-declare'
import { salons } from '@/temps-reel/evenements'
import {
  useClientTempsReel,
  useEtatTempsReel,
  useEvenement,
  usePresence,
  useResynchronisation,
  useSalon,
} from '@/temps-reel/hooks'
import { ajouterTransaction, fusionnerSolde, remplacerMatch } from '@/temps-reel/cache'
import { IndicateurDirect } from '@/temps-reel/indicateur-direct'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { ChronologieMatch } from '@/components/joueur/chronologie-match'
import { CompteARebours } from '@/components/joueur/compte-a-rebours'
import { ConfirmationResultat } from '@/components/joueur/confirmation-resultat'
import { AvatarJoueur } from '@/components/joueur/avatar-joueur'
import { PresenceAdversaire } from '@/components/joueur/presence-adversaire'
import { ResultatMatch, type DetailAbandon, type DetailPartage } from '@/components/joueur/resultat-match'
import { PanneauAttente, PanneauNul, PanneauPreuveRequise } from '@/components/joueur/panneaux-match'
import { UploadPreuve } from '@/components/joueur/upload-preuve'
import { ChoixNulModal } from '@/components/joueur/modals/choix-nul-modal'
import { DeclarationResultatModal } from '@/components/joueur/modals/declaration-resultat-modal'
import { LitigeModal } from '@/components/joueur/modals/litige-modal'
import { Button, LienBouton } from '@/components/partages/button/button'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'
import { LecteurPreuve } from '@/components/partages/lecteur-preuve/lecteur-preuve'
import { SkeletonTexte } from '@/components/partages/skeleton/skeleton'
import { toastErreur, toastInfo, toastSucces } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

export const Route = createFileRoute('/joueur/matchs/$matchId')({
  head: () => ({ meta: [{ title: 'Match — QUI PERD' }] }),
  // Les deux requêtes sont ATTENDUES, en parallèle. Un `prefetchQuery` non attendu se
  // résolvait après l'envoi du HTML mais avant l'hydratation : le serveur rendait le
  // squelette et le compteur vide, le client la liste — React signalait une différence
  // d'hydratation à chaque ouverture de l'écran.
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsDetailMatch(params.matchId)),
      context.queryClient.ensureQueryData(optionsPreuves(params.matchId)),
    ])
  },
  component: EcranMatch,
})

function EcranMatch() {
  const { matchId } = Route.useParams()
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur

  const queryClient = useQueryClient()
  const cleDetail = useMemo(() => optionsDetailMatch(matchId).queryKey, [matchId])
  const { data } = useSuspenseQuery(optionsDetailMatch(matchId))
  const preuves = useQuery(optionsPreuves(matchId))
  const regles = useQuery(optionsRegles)

  const match = data.match
  const manche = numeroManche(match)
  const jeSuisJ1 = match.joueur1Id === moi.id
  const nomMoi = jeSuisJ1 ? match.joueur1Nom : match.joueur2Nom
  const nomAdversaire = jeSuisJ1 ? match.joueur2Nom : match.joueur1Nom
  const idAdversaire = jeSuisJ1 ? match.joueur2Id : match.joueur1Id
  const photoAdversaire = jeSuisJ1 ? match.joueur2Photo : match.joueur1Photo
  const nomDe = (id: string) => (id === match.joueur1Id ? match.joueur1Nom : match.joueur2Nom)

  // Déclarations et choix de la manche EN COURS : le backend renvoie tout l'historique,
  // chaque ligne portant son numéro de manche.
  const declarationsManche = data.declarations.filter((d) => numeroManche(d) === manche)
  const maDeclaration = declarationsManche.find((d) => d.utilisateurId === moi.id)
  const declarationAdverse = declarationsManche.find((d) => d.utilisateurId !== moi.id)
  const choixManche = (data.choixNuls ?? []).filter((c) => numeroManche(c) === manche)
  const monChoix = choixManche.find((c) => c.utilisateurId === moi.id)
  const choixAdverse = choixManche.find((c) => c.utilisateurId !== moi.id)

  const statut = match.statut
  const gagne = match.gagnantId ? match.gagnantId === moi.id : null
  const aConfirmer = statut === 'en_cours' && !!declarationAdverse && !maDeclaration
  const peutDeclarer = statut === 'en_cours' && !maDeclaration
  const peutEnvoyerPreuve = statut !== 'termine'
  const peutOuvrirLitige =
    statut === 'en_cours' || statut === 'preuve_requise' || statut === 'nul_en_attente' || statut === 'verification'

  // ─── État poussé par le direct (non présent dans la fiche du match) ────────────────
  const [gain, setGain] = useState<string | undefined>(undefined)
  const [partage, setPartage] = useState<DetailPartage | undefined>(undefined)
  const [abandon, setAbandon] = useState<DetailAbandon | undefined>(undefined)
  const [presenceAdverse, setPresenceAdverse] = useState<boolean | null>(null)
  const [modalScore, setModalScore] = useState(false)
  const [modalLitige, setModalLitige] = useState(false)
  const [modalNul, setModalNul] = useState(false)

  const etatDirect = useEtatTempsReel()
  const client = useClientTempsReel()
  const salonMatch = salons.match(matchId)

  // ─── Écritures ciblées dans le cache ───────────────────────────────────────────────
  const majMatch = useCallback(
    (patch: Partial<MatchEnrichi>) => {
      queryClient.setQueryData<DonneesMatch>(cleDetail, (ancien) =>
        ancien ? { ...ancien, match: { ...ancien.match, ...patch } } : ancien,
      )
    },
    [queryClient, cleDetail],
  )

  const ajouterDeclaration = useCallback(
    (declaration: ResultatDeclare) => {
      queryClient.setQueryData<DonneesMatch>(cleDetail, (ancien) => {
        if (!ancien) return ancien
        const existe = ancien.declarations.some(
          (d) => d.utilisateurId === declaration.utilisateurId && numeroManche(d) === numeroManche(declaration),
        )
        return existe ? ancien : { ...ancien, declarations: [...ancien.declarations, declaration] }
      })
    },
    [queryClient, cleDetail],
  )

  const ajouterChoixNul = useCallback(
    (choix: ChoixNulMatch) => {
      queryClient.setQueryData<DonneesMatch>(cleDetail, (ancien) => {
        if (!ancien) return ancien
        const liste = ancien.choixNuls ?? []
        const existe = liste.some(
          (c) => c.utilisateurId === choix.utilisateurId && numeroManche(c) === numeroManche(choix),
        )
        return existe ? ancien : { ...ancien, choixNuls: [...liste, choix] }
      })
    },
    [queryClient, cleDetail],
  )

  /**
   * Rattrapage ponctuel : une seule invalidation par échéance atteinte. Le serveur tranche de
   * son côté (worker Asynq) et pousse le résultat ; ceci ne sert qu'au cas où le socket serait
   * coupé au moment précis de la bascule. Jamais en boucle : la garde mémorise l'échéance.
   */
  const echeancesRattrapees = useRef(new Set<string>())
  const rattraperEcheance = useCallback(() => {
    const echeance = match.echeance
    if (!echeance || echeancesRattrapees.current.has(echeance)) return
    echeancesRattrapees.current.add(echeance)
    void queryClient.invalidateQueries({ queryKey: cleDetail })
  }, [match.echeance, queryClient, cleDetail])

  const rafraichirPreuves = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: cles.matchs.preuves(matchId) })
  }, [queryClient, matchId])

  // ─── Direct ────────────────────────────────────────────────────────────────────────

  // Une invalidation à chaque (re)connexion : rattrape ce qui a été manqué pendant la coupure.
  useResynchronisation([cles.matchs.tous, cles.litiges.tous, cles.portefeuille.tous])

  // « Je suis sur la page » : l'adversaire voit la pastille de présence.
  usePresence(salonMatch)

  // Le hub ne renvoie pas d'instantané de présence à l'arrivée : on répond une fois à
  // l'annonce d'un adversaire déjà présent pour qu'il nous voie aussi. Le drapeau évite
  // l'aller-retour infini (il retombe quand l'adversaire quitte la page).
  const dejaSalue = useRef(false)
  useEffect(() => {
    dejaSalue.current = false
  }, [salonMatch])

  useSalon(salonMatch, (evenement) => {
    switch (evenement.evenement) {
      case 'match.score_propose': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        majMatch({
          statut: 'en_cours',
          manche: c.manche,
          echeance: c.echeanceConfirmation,
          echeanceType: 'confirmation',
        })
        ajouterDeclaration({
          // Ligne reconstituée depuis l'événement : elle sera remplacée par celle du serveur
          // à la prochaine lecture complète. L'identifiant est stable pour éviter un doublon.
          id: `direct:${c.declarant}:${c.manche}`,
          dateCreation: evenement.horodatage,
          matchId,
          utilisateurId: c.declarant,
          manche: c.manche,
          scorePour: c.scorePour,
          scoreContre: c.scoreContre,
          gagnantDeclareId:
            c.scorePour === c.scoreContre
              ? undefined
              : c.scorePour > c.scoreContre
                ? c.declarant
                : c.declarant === match.joueur1Id
                  ? match.joueur2Id
                  : match.joueur1Id,
          commentaire: '',
          dateDeclaration: evenement.horodatage,
        })
        if (c.declarant !== moi.id) {
          // On annonce l'issue déclarée, pas le 1-0 que le serveur range en base : le joueur
          // n'a jamais saisi de nombre, en montrer un serait lui présenter une invention.
          toastInfo(
            'Résultat à confirmer',
            c.scorePour === c.scoreContre
              ? `${nomAdversaire} annonce un match nul. Confirmez, ou annoncez l’inverse.`
              : c.scorePour > c.scoreContre
                ? `${nomAdversaire} se déclare vainqueur. Confirmez, ou annoncez l’inverse.`
                : `${nomAdversaire} vous déclare vainqueur. Confirmez, ou annoncez l’inverse.`,
          )
        }
        return
      }

      case 'match.score_confirme': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        majMatch({
          gagnantId: c.gagnantId,
          perdantId: c.perdantId,
          scoreJoueur1: c.scoreJoueur1,
          scoreJoueur2: c.scoreJoueur2,
          echeance: undefined,
          echeanceType: '',
        })
        // Les deux joueurs sont d'accord : le serveur a inscrit la déclaration manquante
        // (confirmation) ou reçu la seconde. L'événement ne les porte pas, mais les scores
        // officiels suffisent à les reconstituer — sinon le panneau « Déclarations »
        // afficherait « en attente » sur un match déjà réglé.
        if (typeof c.scoreJoueur1 === 'number' && typeof c.scoreJoueur2 === 'number') {
          for (const joueur of [match.joueur1Id, match.joueur2Id]) {
            const estJ1 = joueur === match.joueur1Id
            ajouterDeclaration({
              id: `accord:${joueur}:${manche}`,
              dateCreation: evenement.horodatage,
              matchId,
              utilisateurId: joueur,
              manche,
              scorePour: estJ1 ? c.scoreJoueur1 : c.scoreJoueur2,
              scoreContre: estJ1 ? c.scoreJoueur2 : c.scoreJoueur1,
              gagnantDeclareId: c.gagnantId,
              commentaire: '',
              dateDeclaration: evenement.horodatage,
            })
          }
        }
        return
      }

      case 'match.desaccord': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        majMatch({ statut: 'preuve_requise', echeance: c.echeancePreuve, echeanceType: 'preuve' })
        setModalScore(false)
        toastAvertirDesaccord()
        return
      }

      case 'match.nul': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        majMatch({ statut: 'nul_en_attente', echeance: c.echeanceChoix, echeanceType: 'choix_nul' })
        setModalScore(false)
        setModalNul(true)
        return
      }

      case 'match.nul_choix': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        ajouterChoixNul({
          id: `direct:${c.utilisateurId}:${manche}`,
          dateCreation: evenement.horodatage,
          matchId,
          utilisateurId: c.utilisateurId,
          manche,
          choix: c.choix,
          dateChoix: evenement.horodatage,
        })
        if (c.utilisateurId !== moi.id) {
          toastInfo(
            'Choix de votre adversaire',
            c.choix === 'rejouer'
              ? `${nomAdversaire} veut rejouer la manche. À vous de choisir.`
              : `${nomAdversaire} préfère partager les mises. À vous de choisir.`,
          )
        }
        return
      }

      case 'match.rejoue': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        majMatch({
          statut: 'en_cours',
          manche: c.manche,
          scoreJoueur1: undefined,
          scoreJoueur2: undefined,
          gagnantId: undefined,
          perdantId: undefined,
          echeance: undefined,
          echeanceType: '',
        })
        setGain(undefined)
        setPartage(undefined)
        setAbandon(undefined)
        setModalNul(false)
        toastSucces(
          `Manche ${c.manche}`,
          'Vous avez tous les deux choisi de rejouer. Aucun mouvement d’argent : les mises restent bloquées.',
        )
        return
      }

      case 'match.partage': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        setPartage({ rendu: c.rendu, commission: c.commission })
        setModalNul(false)
        return
      }

      case 'match.preuve_envoyee': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        // L'événement ne porte pas le fichier : une lecture ponctuelle de la liste est
        // nécessaire pour l'afficher. Déclenchée par un dépôt réel, jamais cycliquement.
        rafraichirPreuves()
        if (c.utilisateurId !== moi.id) {
          toastInfo('Preuve reçue', `${nomAdversaire} a envoyé sa preuve (${c.type === 'video' ? 'vidéo' : 'capture'}).`)
        }
        return
      }

      case 'match.litige_ouvert': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        majMatch({ statut: 'litige', echeance: undefined, echeanceType: '' })
        toastInfo('Litige ouvert', 'Un arbitre va examiner les preuves des deux joueurs. Les mises restent bloquées.')
        return
      }

      case 'match.litige_resolu': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        toastInfo('Litige tranché', 'La décision de l’arbitre a été appliquée.')
        return
      }

      case 'match.abandon': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        setAbandon({ gagnantId: c.gagnantId, motif: c.motif })
        return
      }

      case 'match.termine': {
        const m = evenement.charge
        if (m.id !== matchId) return
        remplacerMatch(queryClient, m)
        setGain(m.gain)
        setModalNul(false)
        setModalScore(false)
        return
      }

      case 'match.chrono': {
        const c = evenement.charge
        if (c.matchId !== matchId) return
        majMatch({ echeance: c.echeance, echeanceType: c.type })
        return
      }

      case 'match.presence': {
        const c = evenement.charge
        if (c.utilisateurId === moi.id) return
        setPresenceAdverse(c.present && c.surLaPage)
        if (c.present) {
          if (!dejaSalue.current) {
            dejaSalue.current = true
            client.envoyerPresence(salonMatch, true)
          }
        } else {
          dejaSalue.current = false
        }
        return
      }

      default:
        return
    }
  })

  // Salon privé : le solde et l'historique se mettent à jour sans rechargement au règlement.
  useEvenement('portefeuille.maj', (solde) => fusionnerSolde(queryClient, solde), salons.utilisateur(moi.id))
  useEvenement('transaction.creee', (t) => ajouterTransaction(queryClient, t), salons.utilisateur(moi.id))

  // Le choix rejouer / partager est un rendez-vous à échéance : la modale s'ouvre aussi au
  // chargement de la page (une seule fois — la refermer ne la rouvre pas).
  const nulPropose = useRef(false)
  useEffect(() => {
    if (statut !== 'nul_en_attente' || monChoix) {
      nulPropose.current = false
      return
    }
    if (!nulPropose.current) {
      nulPropose.current = true
      setModalNul(true)
    }
  }, [statut, monChoix])

  // ─── Mutations ─────────────────────────────────────────────────────────────────────
  const declarer = useServerFn(declarerScore)
  const confirmer = useServerFn(confirmerScore)
  const choisir = useServerFn(choisirApresNul)
  const litige = useServerFn(ouvrirLitige)

  const resynchroniser = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: cles.matchs.tous })
  }, [queryClient])

  const mutDeclarer = useMutation({
    mutationFn: (d: SaisieResultat) => declarer({ data: { matchId, ...d } }),
    onSuccess: (r) => {
      setModalScore(false)
      if (!r.ok) {
        toastErreur('Déclaration refusée', r.message)
        resynchroniser()
        return
      }
      remplacerMatch(queryClient, r.donnees)
      if (r.donnees.statut === 'en_cours') {
        toastSucces('Résultat déclaré', `En attente de la réponse de ${nomAdversaire}.`)
      }
      // Les autres issues (règlement, désaccord, nul) sont annoncées par leur propre
      // événement : pas de second message qui dirait la même chose.
    },
  })

  const mutConfirmer = useMutation({
    mutationFn: () => confirmer({ data: { matchId } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toastErreur('Confirmation impossible', r.message)
        resynchroniser()
        return
      }
      remplacerMatch(queryClient, r.donnees)
      toastSucces('Résultat confirmé', 'Le match est réglé : l’argent est versé immédiatement.')
    },
  })

  const mutChoixNul = useMutation({
    mutationFn: (choix: ChoixNulValeur) => choisir({ data: { matchId, choix } }),
    onSuccess: (r, choix) => {
      setModalNul(false)
      if (!r.ok) {
        toastErreur('Choix impossible', r.message)
        resynchroniser()
        return
      }
      remplacerMatch(queryClient, r.donnees)
      toastSucces(
        'Choix enregistré',
        choix === 'rejouer'
          ? `Vous voulez rejouer. La manche ne repart que si ${nomAdversaire} l’accepte aussi.`
          : 'Vous voulez partager les mises. Le partage sera appliqué.',
      )
    },
  })

  const mutLitige = useMutation({
    mutationFn: (motif: string) => litige({ data: { matchId, motif } }),
    onSuccess: (r) => {
      setModalLitige(false)
      if (!r.ok) {
        toastErreur('Litige impossible', r.message)
        resynchroniser()
        return
      }
      toastSucces('Litige ouvert', 'Les mises restent bloquées jusqu’à la décision de l’arbitre.')
      resynchroniser()
    },
  })

  // ─── Rendu ─────────────────────────────────────────────────────────────────────────
  const enAttenteAdverse = statut === 'en_cours' && !!maDeclaration && !declarationAdverse

  return (
    <>
      <EnTetePage
        surtitre={`${match.jeuNom} · ${match.plateformeNom}${manche > 1 ? ` · Manche ${manche}` : ''}`}
        titre={`${nomMoi} vs ${nomAdversaire}`}
        description={`Mise de ${formatMontant(match.montantMise, match.devise)} par joueur · ${formatMontant(Number(match.montantMise) * 2, match.devise)} en séquestre jusqu’au règlement.`}
        actions={
          <>
            <IndicateurDirect variante="etiquette" cliquable className="self-center" />
            <LienBouton to="/joueur/matchs" variante="fantome" iconeDebut={icone.precedent}>
              Mes matchs
            </LienBouton>
            {peutDeclarer && !aConfirmer && (
              <Button variante="volt" onClick={() => setModalScore(true)} iconeDebut={icone.match}>
                Déclarer le résultat
              </Button>
            )}
            {peutOuvrirLitige && (
              <Button variante="danger" onClick={() => setModalLitige(true)} iconeDebut={icone.litige}>
                Ouvrir un litige
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {/* Bloc d'action prioritaire : d'abord dans le flux, donc en haut de l'écran mobile. */}
        {aConfirmer && declarationAdverse && (
          <div>
            <ConfirmationResultat
              nomMoi={nomMoi}
              nomAdversaire={nomAdversaire}
              scoreMoi={declarationAdverse.scoreContre}
              scoreAdversaire={declarationAdverse.scorePour}
              echeance={match.echeanceType === 'confirmation' ? match.echeance : undefined}
              onConfirmer={() => mutConfirmer.mutate()}
              onProposer={() => setModalScore(true)}
              chargement={mutConfirmer.isPending}
              surFinChrono={rattraperEcheance}
            />
          </div>
        )}

        {statut === 'nul_en_attente' && (
          <div>
            <PanneauNul
              monChoix={monChoix?.choix}
              choixAdverse={choixAdverse?.choix}
              nomAdversaire={nomAdversaire}
              echeance={match.echeance}
              surFinChrono={rattraperEcheance}
              onOuvrir={() => setModalNul(true)}
            />
          </div>
        )}

        {statut === 'preuve_requise' && (
          <div>
            <PanneauPreuveRequise
              matchId={matchId}
              nomAdversaire={nomAdversaire}
              jaiEnvoye={(preuves.data ?? []).some((p) => p.utilisateurId === moi.id)}
              adversaireAEnvoye={(preuves.data ?? []).some((p) => p.utilisateurId === idAdversaire)}
              echeance={match.echeance}
              surFinChrono={rattraperEcheance}
              onEnvoye={rafraichirPreuves}
            />
          </div>
        )}

        {enAttenteAdverse && (
          <PanneauAttente
            nomAdversaire={nomAdversaire}
            echeance={match.echeanceType === 'confirmation' ? match.echeance : undefined}
            surFinChrono={rattraperEcheance}
          />
        )}

        {statut === 'termine' && (
          <div>
            <ResultatMatch
              match={match}
              moiId={moi.id}
              nomAdversaire={nomAdversaire}
              gain={gain}
              partage={partage}
              abandon={abandon}
            />
          </div>
        )}

        <div>
          <TableauScore
            joueur1={match.joueur1Nom}
            joueur2={match.joueur2Nom}
            score1={match.scoreJoueur1 ?? null}
            score2={match.scoreJoueur2 ?? null}
            gagnant={match.gagnantId ? (match.gagnantId === match.joueur1Id ? 1 : 2) : null}
            etiquette={manche > 1 ? `Manche ${manche}` : statut === 'termine' ? 'Résultat final' : 'Match'}
            enDirect={statut === 'en_cours'}
            sousTitre={sousTitreScore(statut, gagne)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* La photo de l'adversaire, s'il en a une : on joue de l'argent contre quelqu'un,
              autant voir son visage et pas seulement son pseudo. Initiales sinon. */}
          <span className="flex items-center gap-2.5 text-legende text-muet">
            <AvatarJoueur utilisateurId={idAdversaire} nom={nomAdversaire} photo={photoAdversaire} taille={36} />
            <span>
              Face à <span className="font-semibold text-encre">{nomAdversaire}</span>
            </span>
          </span>
          <PresenceAdversaire enLigne={presenceAdverse} direct={etatDirect === 'connecte'} />
        </div>

        <ChronologieMatch statut={statut} />

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-trait bg-papier p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-h3">Déclarations{manche > 1 ? ` — manche ${manche}` : ''}</h3>
              <BadgeStatut famille="match" valeur={statut} />
            </div>
            <ul className="mt-4 space-y-3">
              <LigneDeclaration
                nom={`${nomMoi} (vous)`}
                declaration={maDeclaration}
                attente="Vous n’avez pas encore déclaré."
                nomDe={nomDe}
              />
              <LigneDeclaration
                nom={nomAdversaire}
                declaration={declarationAdverse}
                attente="En attente de la déclaration adverse."
                nomDe={nomDe}
              />
            </ul>
            {peutDeclarer && !aConfirmer && (
              <Button variante="volt" bloc taille="lg" className="mt-4" onClick={() => setModalScore(true)} iconeDebut={icone.match}>
                Déclarer le résultat
              </Button>
            )}
          </div>

          <div className="rounded-2xl border border-trait bg-papier p-5">
            <h3 className="text-h3">Que faire maintenant ?</h3>
            <ol className="mt-4 space-y-3 text-legende">
              {consignes({ statut, maDeclaration: !!maDeclaration, aConfirmer, nomAdversaire }).map((c) => (
                <Consigne key={c.texte} fait={c.fait} texte={c.texte} />
              ))}
            </ol>
            {statut === 'litige' && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-perte bg-perte-fond p-3 text-legende text-perte">
                <FontAwesomeIcon icon={icone.litige} className="mt-0.5" />
                <span>
                  Un litige est ouvert. Suivez la décision dans{' '}
                  <LienBouton to="/joueur/litiges" variante="lien" taille="sm" className="h-auto! px-0! text-perte">
                    vos litiges
                  </LienBouton>
                  .
                </span>
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-h3">Preuves</h3>
            <span className="text-legende text-muet">{preuves.data ? `${preuves.data.length} fichier(s)` : ''}</span>
          </div>
          {/* En « preuve exigée », la zone d'envoi est déjà en haut de l'écran : pas de doublon. */}
          {peutEnvoyerPreuve && statut !== 'preuve_requise' && (
            <UploadPreuve matchId={matchId} onEnvoye={rafraichirPreuves} />
          )}
          {preuves.isPending ? (
            <SkeletonTexte lignes={2} className="mt-4" />
          ) : preuves.data && preuves.data.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {preuves.data.map((p) => (
                <LecteurPreuve
                  key={p.id}
                  preuve={p}
                  auteur={p.utilisateurId === moi.id ? `${nomMoi} (vous)` : nomDe(p.utilisateurId)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-legende text-muet">
              Aucune preuve envoyée. Deux déclarations identiques suffisent à régler le match : la preuve n’est exigée
              qu’en cas de divergence.
            </p>
          )}
        </section>

        <p className="text-[12px] text-muet">
          Match créé le {formatDateHeure(match.dateCreation)}
          {match.dateFin && ` · réglé le ${formatDateHeure(match.dateFin)}`}.
        </p>
      </div>

      <DeclarationResultatModal
        ouvert={modalScore}
        onFermer={() => setModalScore(false)}
        onDeclarer={async (d) => mutDeclarer.mutateAsync(d).then(() => undefined)}
        adversaire={nomAdversaire}
        chargement={mutDeclarer.isPending}
        manche={manche}
        contreProposition={aConfirmer}
      />
      <ChoixNulModal
        ouvert={modalNul}
        onFermer={() => setModalNul(false)}
        onChoisir={(choix) => mutChoixNul.mutateAsync(choix).then(() => undefined)}
        chargement={mutChoixNul.isPending}
        echeance={match.echeanceType === 'choix_nul' ? match.echeance : undefined}
        manche={manche}
        montantMise={match.montantMise}
        devise={match.devise}
        tauxCommission={regles.data?.commissionDefi}
        choixAdverse={choixAdverse?.choix}
      />
      <LitigeModal
        ouvert={modalLitige}
        onFermer={() => setModalLitige(false)}
        onOuvrir={async (motif) => mutLitige.mutateAsync(motif).then(() => undefined)}
        chargement={mutLitige.isPending}
      />
    </>
  )
}

function toastAvertirDesaccord() {
  toastErreur(
    'Déclarations divergentes',
    'Vos scores ne concordent pas : envoyez chacun une preuve avant l’échéance, puis un arbitre tranchera.',
  )
}

function sousTitreScore(statut: string, gagne: boolean | null): string | undefined {
  if (statut === 'termine') {
    if (gagne === null) return 'Match nul — mises partagées'
    return gagne ? 'Gagné — gain déjà crédité' : 'Perdu — mise débitée'
  }
  if (statut === 'litige') return 'Litige en cours — mises bloquées'
  if (statut === 'preuve_requise') return 'Preuve exigée des deux joueurs'
  if (statut === 'nul_en_attente') return 'Nul déclaré — rejouer ou partager'
  if (statut === 'verification') return 'Preuves en cours de vérification'
  return undefined
}


// ─── Listes ──────────────────────────────────────────────────────────────────────────

function LigneDeclaration({
  nom,
  declaration,
  attente,
  nomDe,
}: {
  nom: string
  declaration?: ResultatDeclare
  attente: string
  nomDe: (id: string) => string
}) {
  return (
    <li className="rounded-xl border border-trait bg-gris px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-semibold">{nom}</span>
        {declaration ? (
          // Les 1-0 / 0-1 stockés sont une convention interne du moteur de règlement. Les
          // afficher reviendrait à montrer au joueur un chiffre que personne n'a saisi.
          <span className="etiquette shrink-0 font-bold">
            {declaration.scorePour === declaration.scoreContre
              ? 'Match nul'
              : declaration.scorePour > declaration.scoreContre
                ? 'Se déclare vainqueur'
                : 'Se déclare battu'}
          </span>
        ) : (
          <span className="etiquette flex shrink-0 items-center gap-1 text-muet">
            <FontAwesomeIcon icon={icone.sablier} className="animate-pulsation" /> En attente
          </span>
        )}
      </div>
      {declaration ? (
        <p className="mt-1 text-[12px] text-muet">
          Gagnant déclaré : {declaration.gagnantDeclareId ? nomDe(declaration.gagnantDeclareId) : 'match nul'} ·{' '}
          {formatDateHeure(declaration.dateDeclaration)}
          {declaration.commentaire && ` · « ${declaration.commentaire} »`}
        </p>
      ) : (
        <p className="mt-1 text-[12px] text-muet">{attente}</p>
      )}
    </li>
  )
}

function consignes({
  statut,
  maDeclaration,
  aConfirmer,
  nomAdversaire,
}: {
  statut: string
  maDeclaration: boolean
  aConfirmer: boolean
  nomAdversaire: string
}): Array<{ texte: string; fait: boolean }> {
  if (statut === 'termine') {
    return [
      { texte: 'Jouer le match et déclarer le résultat.', fait: true },
      { texte: 'Accord des deux joueurs sur le résultat.', fait: true },
      { texte: 'Règlement automatique : l’argent est versé.', fait: true },
    ]
  }
  if (statut === 'preuve_requise') {
    return [
      { texte: 'Envoyer votre preuve (capture ou vidéo).', fait: false },
      { texte: `Attendre la preuve de ${nomAdversaire}.`, fait: false },
      { texte: 'Un arbitre examine les deux preuves et tranche.', fait: false },
    ]
  }
  if (statut === 'nul_en_attente') {
    return [
      { texte: 'Choisir : rejouer la manche ou partager les mises.', fait: false },
      { texte: `Attendre le choix de ${nomAdversaire}.`, fait: false },
      { texte: 'Rejouer si vous êtes d’accord tous les deux, sinon partage.', fait: false },
    ]
  }
  if (statut === 'litige' || statut === 'verification') {
    return [
      { texte: 'Jouer le match et déclarer le résultat.', fait: true },
      { texte: 'Envoyer vos preuves : capture et, si possible, vidéo.', fait: false },
      { texte: 'Attendre la décision : le règlement suit automatiquement.', fait: false },
    ]
  }
  return [
    { texte: 'Jouer le match sur le jeu et la plateforme du défi.', fait: maDeclaration },
    {
      texte: aConfirmer ? `Confirmer le résultat annoncé par ${nomAdversaire}, ou annoncer l’inverse.` : 'Déclarer qui a gagné.',
      fait: maDeclaration,
    },
    {
      texte: 'Deux déclarations identiques = règlement immédiat, sans preuve ni arbitre.',
      fait: false,
    },
  ]
}

function Consigne({ fait, texte }: { fait: boolean; texte: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-sm border ${fait ? 'border-gain bg-gain text-papier' : 'border-trait'}`}
      >
        {fait && <FontAwesomeIcon icon={icone.valider} className="text-[10px]" />}
      </span>
      <span className={fait ? 'text-muet line-through' : ''}>{texte}</span>
    </li>
  )
}
