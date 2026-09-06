import type { Portefeuille } from './portefeuille'

/**
 * Miroir du JSON backend — table `utilisateurs` (demarrage-backend.md §7.1).
 * `supprime` : suppression logique par l'admin (e-mail et pseudo anonymisés, historique conservé).
 */
export type StatutUtilisateur = 'actif' | 'suspendu' | 'en_attente' | 'supprime'

export interface Utilisateur {
  id: string
  dateCreation: string
  nomUtilisateur: string
  email: string
  telephone: string
  photoProfil: string
  pays: string
  statut: StatutUtilisateur
  dateModification: string
}

/** Statuts qu'un administrateur peut fixer à la création ou en édition. */
export type StatutUtilisateurAdmin = Extract<StatutUtilisateur, 'actif' | 'suspendu'>

/** Corps de `POST /api/utilisateurs` (admin). */
export interface NouvelUtilisateurAdmin {
  nomUtilisateur: string
  email: string
  motDePasse: string
  telephone?: string
  pays?: string
  statut?: StatutUtilisateurAdmin
}

/** Corps de `PATCH /api/utilisateurs/:id` (admin) — seuls les champs modifiés sont envoyés. */
export interface ModificationUtilisateurAdmin {
  nomUtilisateur?: string
  email?: string
  telephone?: string
  pays?: string
  statut?: StatutUtilisateurAdmin
  motDePasse?: string
}

/** `GET /api/utilisateurs/:id` (admin) : utilisateur + portefeuille éventuel. */
export interface DetailUtilisateur extends Utilisateur {
  portefeuille?: Portefeuille
}

/** Table `administrateurs` (§7.15) — distincte des joueurs. */
export interface Administrateur {
  id: string
  dateCreation: string
  nom: string
  email: string
  role: string
  statut: string
}

export type Role = 'joueur' | 'admin'

/** Réponse de `GET /api/auth/moi` selon le rôle porté par le jeton. */
export type SessionCourante =
  | { role: 'joueur'; utilisateur: Utilisateur }
  | { role: 'admin'; administrateur: Administrateur }
