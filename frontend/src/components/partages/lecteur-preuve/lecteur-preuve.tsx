import type { ReactNode } from 'react'
import type { PreuveMatch } from '@/models/preuve-match'
import { urlFichierPreuve } from '@/services/preuves'
import type { RoleAppel } from '@/services/matchs'
import { BadgeStatut } from '../badge-statut/badge-statut'
import { formatDateHeure } from '@/lib/format'

export interface ProprietesLecteurPreuve {
  preuve: PreuveMatch
  role?: RoleAppel
  /** Nom du joueur qui a envoyé la preuve. */
  auteur?: string
  actions?: ReactNode
}

/** Lecture d'une preuve via la route proxy authentifiée (jamais une URL du backend). */
export function LecteurPreuve({ preuve, role = 'joueur', auteur, actions }: ProprietesLecteurPreuve) {
  const src = urlFichierPreuve(preuve.id, role)
  return (
    <figure className="ticket-sm border-2 border-encre bg-papier">
      <div className="flex items-center justify-between gap-3 border-b-2 border-trait px-3 py-2 text-legende">
        <div className="min-w-0">
          <span className="etiquette text-muet">{preuve.type === 'video' ? 'Vidéo' : 'Capture'}</span>
          {auteur && <span className="ml-2 font-semibold">{auteur}</span>}
        </div>
        <BadgeStatut famille="preuve" valeur={preuve.statut} />
      </div>
      <div className="bg-nuit">
        {preuve.type === 'video' ? (
          <video src={src} controls preload="metadata" className="max-h-80 w-full" />
        ) : (
          <img src={src} alt={`Capture d'écran envoyée ${auteur ? `par ${auteur}` : ''}`} className="max-h-80 w-full object-contain" loading="lazy" />
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-legende text-muet">
        <span>Envoyée le {formatDateHeure(preuve.dateEnvoi)}</span>
        {preuve.statut === 'rejetee' && preuve.motifRejet && <span className="text-perte">Motif : {preuve.motifRejet}</span>}
        {actions}
      </figcaption>
    </figure>
  )
}
