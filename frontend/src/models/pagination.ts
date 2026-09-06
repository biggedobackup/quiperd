/**
 * Enveloppe commune des listes paginées de l'API (`?page=1&taille=10`) :
 * `{ elements, total, page, taille, pages }` — voir `demarrage-backend.md` (charte API).
 */
export interface Page<T> {
  elements: T[]
  total: number
  page: number
  taille: number
  pages: number
}

/** 10 éléments par page sur toutes les listes admin. */
export const TAILLE_PAGE_ADMIN = 10

export function pageVide<T>(): Page<T> {
  return { elements: [], total: 0, page: 1, taille: TAILLE_PAGE_ADMIN, pages: 0 }
}
