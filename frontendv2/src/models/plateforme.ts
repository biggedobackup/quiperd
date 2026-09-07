import type { StatutCatalogue } from './jeu'

/** Familles de plateforme de la charte API. */
export type FamillePlateforme = 'pc' | 'console' | 'mobile'

/** Table `plateformes` (§7.3). */
export interface Plateforme {
  id: string
  dateCreation: string
  nom: string
  famille: FamillePlateforme
  statut: StatutCatalogue
}
