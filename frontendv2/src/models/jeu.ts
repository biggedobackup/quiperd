/** Table `jeux` (§7.2). */
export type StatutCatalogue = 'actif' | 'inactif'

/** Catégories de jeu de la charte API (valeurs backend, jamais renommées côté client). */
export type CategorieJeu = 'sport' | 'combat' | 'course' | 'tir' | 'strategie' | 'cartes' | 'arcade'

export interface Jeu {
  id: string
  dateCreation: string
  nom: string
  categorie: CategorieJeu
  statut: StatutCatalogue
}
