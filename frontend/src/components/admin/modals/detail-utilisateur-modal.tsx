import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDateHeure, formatMontant } from '@/lib/format'
import { optionsUtilisateur } from '@/lib/requetes'
import type { Utilisateur } from '@/models/utilisateur'
import { Modal } from '@/components/partages/modal/modal'
import { BadgeStatut } from '@/components/partages/badge-statut/badge-statut'
import { SkeletonTexte } from '@/components/partages/skeleton/skeleton'

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="etiquette pt-0.5 text-muet">{libelle}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/**
 * Fiche d'un compte en lecture seule (« Voir », seule action possible sur un compte supprimé) :
 * identité, statut, dates et soldes du portefeuille via `GET /api/utilisateurs/:id`.
 */
export function DetailUtilisateurModal({ utilisateur, onFermer }: { utilisateur: Utilisateur | null; onFermer: () => void }) {
  // Dernier compte affiché conservé pendant l'animation de fermeture (contenu stable).
  const [cible, setCible] = useState(utilisateur)
  if (utilisateur && utilisateur !== cible) setCible(utilisateur)
  const detail = useQuery({ ...optionsUtilisateur(cible?.id ?? ''), enabled: cible !== null })
  const u = detail.data ?? cible
  const portefeuille = detail.data?.portefeuille

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
            <div className="border-2 border-encre bg-nuit p-3 text-craie">
              <span className="etiquette text-craie/60">Disponible</span>
              <span className="chiffres mt-1 block text-h3 font-bold text-volt">{formatMontant(portefeuille.soldeDisponible, portefeuille.devise)}</span>
            </div>
            <div className="border-2 border-encre bg-papier p-3">
              <span className="etiquette text-muet">Bloqué</span>
              <span className="chiffres mt-1 block text-h3 font-bold">{formatMontant(portefeuille.soldeBloque, portefeuille.devise)}</span>
            </div>
          </div>
        ) : (
          <p className="text-legende text-muet">{detail.isError ? 'Détail indisponible pour le moment.' : 'Aucun portefeuille associé à ce compte.'}</p>
        )}
      </div>
    </Modal>
  )
}
