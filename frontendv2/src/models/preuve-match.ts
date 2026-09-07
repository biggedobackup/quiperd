/** Table `preuves_matchs` (§7.9). */
export type TypePreuve = 'capture_ecran' | 'video'
export type StatutPreuve = 'en_attente' | 'validee' | 'rejetee'

export interface PreuveMatch {
  id: string
  dateCreation: string
  matchId: string
  utilisateurId: string
  type: TypePreuve
  urlFichier: string
  empreinteFichier: string
  statut: StatutPreuve
  motifRejet: string
  dateEnvoi: string
  dateVerification?: string
}
