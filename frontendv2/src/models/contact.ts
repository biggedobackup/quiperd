/**
 * Module `contact` — messages envoyés depuis le formulaire public « Nous contacter »
 * (`POST /api/contact`), lus et traités depuis le tableau admin (`GET/PATCH/DELETE /api/contact`).
 * Miroir du JSON backend : mêmes champs camelCase, statuts jamais renommés côté frontend.
 */
export type StatutContact = 'nouveau' | 'lu' | 'traite'

export const STATUTS_CONTACT: readonly StatutContact[] = ['nouveau', 'lu', 'traite']

export function estStatutContact(valeur: unknown): valeur is StatutContact {
  return typeof valeur === 'string' && (STATUTS_CONTACT as readonly string[]).includes(valeur)
}

export interface MessageContact {
  id: string
  dateCreation: string
  nom: string
  email: string
  sujet: string
  message: string
  statut: StatutContact
  /** Renseigné quand l'expéditeur était connecté en tant que joueur au moment de l'envoi. */
  utilisateurId?: string
  /** Note interne de l'équipe, jamais montrée à l'expéditeur. */
  noteAdmin: string
  dateModification: string
}

/** Corps de `POST /api/contact` (public) : nom ≥ 2, e-mail valide, sujet 3..150, message 10..2000. */
export interface NouveauMessageContact {
  nom: string
  email: string
  sujet: string
  message: string
}

/** Corps de `PATCH /api/contact/:id` (admin) — au moins un des deux champs. */
export interface ModificationMessageContact {
  statut?: StatutContact
  noteAdmin?: string
}
