import { useState } from 'react'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant } from '@/lib/format'
import { optionsDetailMatch, optionsPreuves } from '@/lib/requetes'
import { declarerScore, ouvrirLitige } from '@/services/matchs'
import type { Declaration } from '@/models/match'
import { EnTetePage } from '@/components/partages/en-tete-page/en-tete-page'
import { ChronologieMatch } from '@/components/joueur/chronologie-match'
import { UploadPreuve } from '@/components/joueur/upload-preuve'
import { DeclarationScoreModal } from '@/components/joueur/modals/declaration-score-modal'
import { LitigeModal } from '@/components/joueur/modals/litige-modal'
import { Button, LienBouton } from '@/components/partages/button/button'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { TableauScore } from '@/components/partages/tableau-score/tableau-score'
import { LecteurPreuve } from '@/components/partages/lecteur-preuve/lecteur-preuve'
import { SkeletonTexte } from '@/components/partages/skeleton/skeleton'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

const routeJoueur = getRouteApi('/joueur')

export const Route = createFileRoute('/joueur/matchs/$matchId')({
  head: () => ({ meta: [{ title: 'Match — QUI PERD' }] }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(optionsDetailMatch(params.matchId))
    void context.queryClient.prefetchQuery(optionsPreuves(params.matchId))
  },
  component: DetailMatch,
})

function DetailMatch() {
  const { matchId } = Route.useParams()
  const { session } = routeJoueur.useRouteContext()
  const moi = session.utilisateur
  const { data } = useSuspenseQuery({ ...optionsDetailMatch(matchId), refetchInterval: (q) => (q.state.data?.match.statut === 'termine' ? false : 15_000) })
  const preuves = useQuery(optionsPreuves(matchId))
  const match = data.match
  const jeSuisJ1 = match.joueur1Id === moi.id
  const nomMoi = jeSuisJ1 ? match.joueur1Nom : match.joueur2Nom
  const nomAdversaire = jeSuisJ1 ? match.joueur2Nom : match.joueur1Nom
  const nomDe = (id: string) => (id === match.joueur1Id ? match.joueur1Nom : match.joueur2Nom)
  const maDeclaration = data.declarations.find((d) => d.utilisateurId === moi.id)
  const declarationAdverse = data.declarations.find((d) => d.utilisateurId !== moi.id)
  const gagne = match.gagnantId ? match.gagnantId === moi.id : null
  const peutDeclarer = match.statut === 'en_cours' && !maDeclaration
  const peutEnvoyerPreuve = match.statut === 'en_cours' || match.statut === 'verification' || match.statut === 'litige'
  const peutOuvrirLitige = match.statut === 'en_cours' || match.statut === 'verification'

  const queryClient = useQueryClient()
  const declarer = useServerFn(declarerScore)
  const litige = useServerFn(ouvrirLitige)
  const [modalScore, setModalScore] = useState(false)
  const [modalLitige, setModalLitige] = useState(false)

  const invalider = () => {
    void queryClient.invalidateQueries({ queryKey: cles.matchs.tous })
    void queryClient.invalidateQueries({ queryKey: cles.litiges.tous })
    void queryClient.invalidateQueries({ queryKey: cles.portefeuille.tous })
    void queryClient.invalidateQueries({ queryKey: cles.notifications })
  }

  const mutDeclarer = useMutation({
    mutationFn: (d: Declaration) => declarer({ data: { matchId, ...d } }),
    onSuccess: (r) => {
      setModalScore(false)
      if (!r.ok) {
        toastErreur('Déclaration refusée', r.message)
        invalider()
        return
      }
      if (r.donnees.statut === 'litige') toastErreur('Déclarations divergentes', 'Le match passe en litige : un arbitre va trancher.')
      else if (r.donnees.statut === 'verification') toastSucces('Déclarations concordantes', 'Envoyez vos preuves : le match sera réglé après vérification.')
      else toastSucces('Score déclaré', 'En attente de la déclaration de votre adversaire.')
      invalider()
    },
  })

  const mutLitige = useMutation({
    mutationFn: (motif: string) => litige({ data: { matchId, motif } }),
    onSuccess: (r) => {
      setModalLitige(false)
      if (!r.ok) {
        toastErreur('Litige impossible', r.message)
        invalider()
        return
      }
      toastSucces('Litige ouvert', 'Les mises restent bloquées jusqu’à la décision de l’arbitre.')
      invalider()
    },
  })

  return (
    <>
      <EnTetePage
        surtitre={`${match.jeuNom} · ${match.plateformeNom}`}
        titre={`${nomMoi} vs ${nomAdversaire}`}
        description={`Mise de ${formatMontant(match.montantMise, match.devise)} par joueur · ${formatMontant(Number(match.montantMise) * 2)} en séquestre.`}
        actions={
          <>
            <LienBouton to="/joueur/matchs" variante="fantome" iconeDebut={icone.precedent}>
              Mes matchs
            </LienBouton>
            {peutDeclarer && (
              <Button variante="volt" onClick={() => setModalScore(true)} iconeDebut={icone.match}>
                Déclarer le score
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
        <TableauScore
          joueur1={match.joueur1Nom}
          joueur2={match.joueur2Nom}
          score1={match.scoreJoueur1 ?? null}
          score2={match.scoreJoueur2 ?? null}
          gagnant={match.gagnantId ? (match.gagnantId === match.joueur1Id ? 1 : 2) : null}
          etiquette={match.statut === 'termine' ? 'Score final' : 'Match'}
          enDirect={match.statut === 'en_cours'}
          sousTitre={match.statut === 'termine' && gagne !== null ? (gagne ? 'Vous avez gagné — gain crédité sur votre solde disponible' : 'Vous avez perdu — votre mise est perdue') : match.statut === 'litige' ? 'Litige en cours — mises bloquées' : match.statut === 'verification' ? 'Déclarations concordantes — preuves en vérification' : undefined}
        />

        <ChronologieMatch statut={match.statut} />

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="ticket-sm border-2 border-encre bg-papier p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-h3">Déclarations</h3>
              <BadgeStatut famille="match" valeur={match.statut} />
            </div>
            <ul className="mt-4 space-y-3">
              <Declaration nom={`${nomMoi} (vous)`} declaration={maDeclaration} attente="Vous n’avez pas encore déclaré." />
              <Declaration nom={nomAdversaire} declaration={declarationAdverse} attente="En attente de la déclaration adverse." nomDe={nomDe} />
            </ul>
            {peutDeclarer && (
              <Button variante="volt" bloc className="mt-4" onClick={() => setModalScore(true)} iconeDebut={icone.match}>
                Déclarer le score
              </Button>
            )}
          </div>

          <div className="ticket-sm border-2 border-encre bg-papier p-5">
            <h3 className="text-h3">Que faire maintenant ?</h3>
            <ol className="mt-4 space-y-3 text-legende">
              <Consigne fait={!!maDeclaration} texte="Déclarer votre score dès la fin du match." />
              <Consigne fait={(preuves.data ?? []).some((p) => p.utilisateurId === moi.id && p.type === 'capture_ecran')} texte="Envoyer la capture d’écran du résultat." />
              <Consigne fait={(preuves.data ?? []).some((p) => p.utilisateurId === moi.id && p.type === 'video')} texte="Envoyer la vidéo de la fin de partie." />
              <Consigne fait={match.statut === 'termine'} texte="Attendre la vérification des preuves : le règlement est automatique." />
            </ol>
            {match.statut === 'litige' && (
              <p className="mt-4 flex items-start gap-2 border-2 border-perte bg-perte-fond p-3 text-legende text-perte">
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
          {peutEnvoyerPreuve && <UploadPreuve matchId={matchId} onEnvoye={() => void queryClient.invalidateQueries({ queryKey: cles.matchs.preuves(matchId) })} />}
          {preuves.isPending ? (
            <SkeletonTexte lignes={2} className="mt-4" />
          ) : preuves.data && preuves.data.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {preuves.data.map((p) => (
                <LecteurPreuve key={p.id} preuve={p} auteur={p.utilisateurId === moi.id ? `${nomMoi} (vous)` : nomDe(p.utilisateurId)} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-legende text-muet">Aucune preuve envoyée pour l’instant.</p>
          )}
        </section>

        <p className="text-[12px] text-muet">
          Match créé le {formatDateHeure(match.dateCreation)}
          {match.dateFin && ` · réglé le ${formatDateHeure(match.dateFin)}`}.
        </p>
      </div>

      <DeclarationScoreModal ouvert={modalScore} onFermer={() => setModalScore(false)} onDeclarer={async (d) => mutDeclarer.mutateAsync(d).then(() => undefined)} moi={nomMoi} adversaire={nomAdversaire} chargement={mutDeclarer.isPending} />
      <LitigeModal ouvert={modalLitige} onFermer={() => setModalLitige(false)} onOuvrir={async (motif) => mutLitige.mutateAsync(motif).then(() => undefined)} chargement={mutLitige.isPending} />
    </>
  )
}

function Declaration({ nom, declaration, attente, nomDe }: { nom: string; declaration?: { scorePour: number; scoreContre: number; commentaire: string; dateDeclaration: string; gagnantDeclareId?: string }; attente: string; nomDe?: (id: string) => string }) {
  return (
    <li className="border-2 border-trait bg-gris px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{nom}</span>
        {declaration ? (
          <span className="chiffres text-h3 font-bold">
            {declaration.scorePour} — {declaration.scoreContre}
          </span>
        ) : (
          <span className="etiquette flex items-center gap-1 text-muet">
            <FontAwesomeIcon icon={icone.sablier} className="animate-pulsation" /> En attente
          </span>
        )}
      </div>
      {declaration ? (
        <p className="mt-1 text-[12px] text-muet">
          Gagnant déclaré : {declaration.gagnantDeclareId ? (nomDe ? nomDe(declaration.gagnantDeclareId) : 'vous / adversaire') : 'match nul'} · {formatDateHeure(declaration.dateDeclaration)}
          {declaration.commentaire && ` · « ${declaration.commentaire} »`}
        </p>
      ) : (
        <p className="mt-1 text-[12px] text-muet">{attente}</p>
      )}
    </li>
  )
}

function Consigne({ fait, texte }: { fait: boolean; texte: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`flex size-5 shrink-0 items-center justify-center border-2 ${fait ? 'border-gain bg-gain text-papier' : 'border-trait'}`}>{fait && <FontAwesomeIcon icon={icone.valider} className="text-[10px]" />}</span>
      <span className={fait ? 'text-muet line-through' : ''}>{texte}</span>
    </li>
  )
}
