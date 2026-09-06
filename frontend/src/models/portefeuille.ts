/** Table `portefeuilles` (§7.11). Soldes en chaîne décimale. */
export interface Portefeuille {
  id: string
  dateCreation: string
  utilisateurId: string
  devise: string
  soldeDisponible: string
  soldeBloque: string
  dateModification: string
}
