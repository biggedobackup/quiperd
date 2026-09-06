import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { CompteurAnime } from '../compteur-anime/compteur-anime'

export interface ProprietesStatCard {
  libelle: string
  valeur: string | number
  format?: 'montant' | 'entier'
  icone: IconDefinition
  /** Accent volt sur l'icône pour le KPI mis en avant. */
  accent?: boolean
  pied?: ReactNode
}

/** Carte KPI : libellé en capitales, grand chiffre mono animé, icône carrée. */
export function StatCard({ libelle, valeur, format = 'entier', icone: ic, accent = false, pied }: ProprietesStatCard) {
  return (
    <div className="ticket-sm flex h-full flex-col gap-3 border-2 border-encre bg-papier p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="etiquette text-muet">{libelle}</span>
        <span
          className={`flex size-8 items-center justify-center border-2 border-encre ${accent ? 'bg-volt text-nuit' : 'bg-gris text-encre'}`}
        >
          <FontAwesomeIcon icon={ic} className="text-sm" />
        </span>
      </div>
      <CompteurAnime valeur={valeur} format={format} className="text-h1 font-bold leading-none" />
      <div className="mt-auto min-h-5 text-right text-legende text-muet">{pied ?? ' '}</div>
    </div>
  )
}
