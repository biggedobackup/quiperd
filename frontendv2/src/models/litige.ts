/** Table `litiges` (§7.10). */
export type StatutLitige = 'en_cours' | 'resolu'
export type DecisionLitige = '' | 'gagnant' | 'remboursement'

export interface Litige {
  id: string
  dateCreation: string
  matchId: string
  ouvertParId?: string
  motif: string
  statut: StatutLitige
  decision: DecisionLitige
  arbitreId?: string
  dateResolution?: string
}

/** Corps de `PATCH /api/litiges/:id`. */
export interface DecisionArbitrale {
  decision: 'gagnant' | 'remboursement'
  gagnantId?: string
}
