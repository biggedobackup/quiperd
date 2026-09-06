/** Table `transactions_portefeuilles` (§7.12). */
export type TypeTransaction =
  | 'depot'
  | 'mise_bloquee'
  | 'gain'
  | 'commission'
  | 'remboursement'
  | 'retrait'

export type StatutTransaction = 'valide' | 'en_attente' | 'annule'

export interface TransactionPortefeuille {
  id: string
  dateCreation: string
  portefeuilleId: string
  miseId?: string
  matchId?: string
  type: TypeTransaction
  montant: string
  statut: StatutTransaction
  reference: string
  description: string
}
