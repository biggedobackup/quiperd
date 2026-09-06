/** Table `resultats_declares` (§7.8). */
export interface ResultatDeclare {
  id: string
  dateCreation: string
  matchId: string
  utilisateurId: string
  scorePour: number
  scoreContre: number
  gagnantDeclareId?: string
  commentaire: string
  dateDeclaration: string
}
