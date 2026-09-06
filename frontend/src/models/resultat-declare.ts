/** Table `resultats_declares` (§7.8). Une déclaration par joueur ET par manche. */
export interface ResultatDeclare {
  id: string
  dateCreation: string
  matchId: string
  utilisateurId: string
  /**
   * Manche déclarée. Après un « rejouer », chaque joueur redéclare le score de la nouvelle
   * manche : l'historique des manches précédentes est conservé. Absent des lignes créées
   * avant l'introduction du rejeu — lire `declaration.manche ?? 1`.
   */
  manche?: number
  /** Scores du point de vue du déclarant : `scorePour` est le sien. */
  scorePour: number
  scoreContre: number
  gagnantDeclareId?: string
  commentaire: string
  dateDeclaration: string
}
