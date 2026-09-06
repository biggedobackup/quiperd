/** `GET /api/administration/statistiques` — montants en chaîne décimale. */
export interface Statistiques {
  utilisateursActifs: number
  utilisateursTotal: number
  defisOuverts: number
  matchsEnCours: number
  matchsTermines: number
  litigesOuverts: number
  volumeMise: string
  commissionCumulee: string
  depotsReussis: string
  retraitsReussis: string
}

/** Table `configurations_financieres` (§7.17). */
export type TypeConfiguration =
  | 'commission_defi'
  | 'mise_minimale'
  | 'mise_maximale'
  | 'frais_retrait'

export interface ConfigurationFinanciere {
  id: string
  dateCreation: string
  type: TypeConfiguration
  valeur: string
  devise: string
  statut: string
  dateDebut: string
  dateFin?: string
}

/** `GET /api/configurations-financieres` (public). */
export interface ConfigurationPublique {
  type: TypeConfiguration
  valeur: string
  devise: string
}

/** Vue pratique des règles financières, dérivée de la liste publique — jamais de valeur en dur. */
export interface ReglesFinancieres {
  commissionDefi: number
  miseMinimale: number
  miseMaximale: number
  fraisRetrait: number
}

/** Table `journaux_audit` (§7.16). Les valeurs JSONB arrivent sérialisées en chaîne. */
export interface JournalAudit {
  id: string
  dateCreation: string
  utilisateurId?: string
  administrateurId?: string
  action: string
  tableCible: string
  identifiantCible?: string
  ancienneValeur?: string
  nouvelleValeur?: string
  adresseIp?: string
}
