/** Table `notifications` (§7.14). */
export type TypeNotification =
  | 'defi_rejoint'
  | 'defi_expire'
  | 'match_a_valider'
  | 'match_termine'
  | 'litige_ouvert'
  | 'litige_resolu'
  | 'paiement_confirme'
  | 'paiement_echoue'

export interface Notification {
  id: string
  dateCreation: string
  utilisateurId: string
  titre: string
  message: string
  type: TypeNotification
  lu: boolean
}
