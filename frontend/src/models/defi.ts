import type { CategorieJeu } from './jeu'
import type { FamillePlateforme } from './plateforme'
import type { MatchEnrichi } from './match'

/** Table `defis` (§7.5). Les montants arrivent en chaîne décimale (`"2000"`). */
export type StatutDefi = 'ouvert' | 'complet' | 'annule' | 'expire'

export interface Defi {
  id: string
  dateCreation: string
  createurId: string
  jeuId: string
  plateformeId: string
  montantMise: string
  devise: string
  regles: string
  statut: StatutDefi
  dateExpiration?: string
  dateModification: string
}

/** Ligne de `GET /api/defis`, `GET /api/defis/ouverts` et `GET /api/defis/:id` : défi + libellés joints. */
export interface DefiListe extends Defi {
  createurNom: string
  jeuNom: string
  jeuCategorie: CategorieJeu
  plateformeNom: string
  plateformeFamille: FamillePlateforme
}

/** Réponse de `GET /api/defis/:id`. */
export interface DetailDefi {
  defi: DefiListe
  match?: MatchEnrichi
}

/** Corps de `POST /api/defis`. */
export interface NouveauDefi {
  jeuId: string
  plateformeId: string
  montantMise: number
  regles?: string
  dureeHeures?: number
}

/** Filtres de la liste publique `GET /api/defis/ouverts` (aucun jeton). */
export interface FiltresDefisPublics {
  categorie?: CategorieJeu
  famille?: FamillePlateforme
  jeu?: string
  plateforme?: string
  miseMax?: number
}

/** Filtres de `GET /api/defis` (joueur connecté) : les mêmes, plus « mes défis ». */
export interface FiltresDefis extends FiltresDefisPublics {
  mes?: boolean
}
