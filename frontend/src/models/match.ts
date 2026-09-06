import type { ResultatDeclare } from './resultat-declare'

/** Table `matchs` (§7.6). `montantMise` est dénormalisé depuis le défi. */
export type StatutMatch = 'en_cours' | 'verification' | 'litige' | 'termine'

export interface MatchDefi {
  id: string
  dateCreation: string
  defiId: string
  joueur1Id: string
  joueur2Id: string
  scoreJoueur1?: number
  scoreJoueur2?: number
  gagnantId?: string
  perdantId?: string
  montantMise: string
  devise: string
  statut: StatutMatch
  dateDebut?: string
  dateFin?: string
}

/** `GET /api/matchs` et `GET /api/matchs/:id` : match + libellés joints. */
export interface MatchEnrichi extends MatchDefi {
  joueur1Nom: string
  joueur2Nom: string
  jeuNom: string
  plateformeNom: string
}

/** Réponse de `GET /api/matchs/:id`. */
export interface DetailMatch {
  match: MatchEnrichi
  declarations: ResultatDeclare[]
}

/** Corps de `POST /api/matchs/:id/declaration`. */
export interface Declaration {
  scorePour: number
  scoreContre: number
  commentaire?: string
}
