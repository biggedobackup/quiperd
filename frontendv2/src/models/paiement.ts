/** Table `paiements` (§7.13). */
export type TypePaiement = 'depot' | 'retrait'
export type Prestataire = 'ligdicash' | 'fusionmoney'
export type StatutPaiement = 'en_attente' | 'reussi' | 'echoue' | 'rembourse'

export interface Paiement {
  id: string
  dateCreation: string
  utilisateurId: string
  type: TypePaiement
  prestataire: Prestataire
  montant: string
  frais: string
  devise: string
  reference: string
  referencePrestataire: string
  operateur: string
  statut: StatutPaiement
  traite: boolean
  dateModification: string
}

/** Réponse de `POST /api/paiements/depot`. */
export interface ReponseDepot {
  paiement: Paiement
  urlPaiement?: string
  message?: string
}

export interface DemandeDepot {
  montant: number
  prestataire: Prestataire
  numero?: string
}

export interface DemandeRetrait {
  montant: number
  prestataire: Prestataire
  numero: string
}
