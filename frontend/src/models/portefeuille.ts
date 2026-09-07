/** Table `portefeuilles` (§7.11). Soldes en chaîne décimale. */
export interface Portefeuille {
  id: string
  dateCreation: string
  utilisateurId: string
  devise: string
  soldeDisponible: string
  soldeBloque: string
  /**
   * Part du solde disponible qui vient d'un dépôt jamais misé. Un dépôt ne se retire pas
   * tel quel : il faut l'avoir engagé dans l'arène.
   */
  soldeNonJoue: string
  /** `soldeDisponible − soldeNonJoue`, calculé par le backend. Plafond réel d'un retrait. */
  soldeRetirable: string
  dateModification: string
}
