import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { icone } from '@/lib/icones'
import { cles } from '@/lib/query'
import { formatDateHeure, formatMontant } from '@/lib/format'
import { optionsUtilisateur } from '@/lib/requetes'
import { changerStatutUtilisateur } from '@/services/utilisateurs'
import type { Utilisateur } from '@/models/utilisateur'
import { Modal } from '@/components/partages/modal/modal'
import { Button } from '@/components/partages/button/button'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { ConfirmModal } from '@/components/partages/confirm-modal/confirm-modal'
import { SkeletonTexte } from '@/components/partages/skeleton/skeleton'
import { toastErreur, toastSucces } from '@/components/partages/toast/toast'

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="etiquette pt-0.5 text-muet">{libelle}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/**
 * Fiche d'un compte (« Voir ») : identité, statut, dates et soldes du portefeuille via
 * `GET /api/utilisateurs/:id`, avec action Suspendre/Réactiver (sauf compte supprimé).
 */
export function DetailUtilisateurModal({ utilisateur, onFermer }: { utilisateur: Utilisateur | null; onFermer: () => void }) {
  // Dernier compte affiché conservé pendant l'animation de fermeture (contenu stable).
  const [cible, setCible] = useState(utilisateur)
  if (utilisateur && utilisateur !== cible) setCible(utilisateur)
  const detail = useQuery({ ...optionsUtilisateur(cible?.id ?? ''), enabled: cible !== null })
  const u = detail.data ?? cible
  const portefeuille = detail.data?.portefeuille
  const queryClient = useQueryClient()
  const changer = useServerFn(changerStatutUtilisateur)
  const [confirmerStatut, setConfirmerStatut] = useState(false)
  const suspendu = u?.statut === 'suspendu'

  const mutStatut = useMutation({
    mutationFn: () => changer({ data: { id: cible!.id, statut: suspendu ? 'actif' : 'suspendu' } }),
    onSuccess: (r) => {
      setConfirmerStatut(false)
      if (!r.ok) {
        toastErreur('Modification impossible', r.message)
        return
      }
      toastSucces(suspendu ? `${cible!.nomUtilisateur} réactivé` : `${cible!.nomUtilisateur} suspendu`, suspendu ? undefined : 'Toutes ses sessions ont été fermées.')
      void queryClient.invalidateQueries({ queryKey: cles.admin.utilisateursTous })
      void queryClient.invalidateQueries({ queryKey: cles.admin.statistiques })
      void queryClient.invalidateQueries({ queryKey: cles.admin.utilisateur(cible!.id) })
    },
  })

  return (
    <Modal ouvert={utilisateur !== null} onFermer={onFermer} titre={u?.nomUtilisateur ?? 'Compte'} description={u?.email} taille="sm">
      {u && (
        <dl className="grid grid-cols-[minmax(0,38%)_1fr] gap-x-3 gap-y-3 text-legende">
          <Ligne libelle="Statut">
            <BadgeStatut famille="utilisateur" valeur={u.statut} />
          </Ligne>
          <Ligne libelle="Pays">{u.pays || '—'}</Ligne>
          <Ligne libelle="Téléphone">
            <span className="chiffres">{u.telephone || '—'}</span>
          </Ligne>
          <Ligne libelle="Inscrit le">
            <span className="chiffres">{formatDateHeure(u.dateCreation)}</span>
          </Ligne>
          <Ligne libelle="Modifié le">
            <span className="chiffres">{formatDateHeure(u.dateModification)}</span>
          </Ligne>
          <Ligne libelle="Identifiant">
            <span className="chiffres break-all text-[11px] text-muet">{u.id}</span>
          </Ligne>
        </dl>
      )}
      <div className="mt-5">
        <h3 className="etiquette mb-2 text-muet">Portefeuille</h3>
        {detail.isPending ? (
          <SkeletonTexte lignes={2} />
        ) : portefeuille ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-encre p-3 text-craie">
              <span className="etiquette text-craie/60">Disponible</span>
              <span className="chiffres mt-1 block text-h3 font-bold text-volt">{formatMontant(portefeuille.soldeDisponible, portefeuille.devise)}</span>
            </div>
            <div className="rounded-xl border border-trait bg-papier p-3">
              <span className="etiquette text-muet">Bloqué</span>
              <span className="chiffres mt-1 block text-h3 font-bold">{formatMontant(portefeuille.soldeBloque, portefeuille.devise)}</span>
            </div>
          </div>
        ) : (
          <p className="text-legende text-muet">{detail.isError ? 'Détail indisponible pour le moment.' : 'Aucun portefeuille associé à ce compte.'}</p>
        )}
      </div>
      {u && u.statut !== 'supprime' && (
        <div className="mt-5 flex justify-end border-t border-trait pt-4">
          <Button taille="sm" variante={suspendu ? 'secondaire' : 'danger'} iconeDebut={suspendu ? icone.reactiver : icone.suspendre} onClick={() => setConfirmerStatut(true)}>
            {suspendu ? 'Réactiver' : 'Suspendre'}
          </Button>
        </div>
      )}
      <ConfirmModal
        ouvert={confirmerStatut}
        onFermer={() => setConfirmerStatut(false)}
        onConfirmer={() => mutStatut.mutate()}
        titre={suspendu ? 'Réactiver ce compte ?' : 'Suspendre ce compte ?'}
        variante={suspendu ? 'primaire' : 'danger'}
        libelleConfirmer={suspendu ? 'Réactiver' : 'Suspendre'}
        chargement={mutStatut.isPending}
      >
        <p>
          <strong>{u?.nomUtilisateur}</strong> ({u?.email}).
        </p>
        <p className="text-legende text-muet">{suspendu ? 'Le joueur pourra de nouveau se connecter, créer et rejoindre des défis.' : 'Ses sessions seront fermées et toute connexion refusée. Ses mises bloquées restent en séquestre.'}</p>
      </ConfirmModal>
    </Modal>
  )
}
