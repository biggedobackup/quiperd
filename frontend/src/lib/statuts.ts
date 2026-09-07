/**
 * Libellés et variantes visuelles de chaque statut backend — une seule source.
 * Les valeurs (snake_case) sont celles de la charte API, jamais renommées.
 */
export type VarianteStatut = 'neutre' | 'info' | 'gain' | 'perte' | 'alerte' | 'volt'

export interface DescriptionStatut {
  libelle: string
  variante: VarianteStatut
  /** Statut « vivant » : le badge pulse lentement. */
  actif?: boolean
}

const DEFIS: Record<string, DescriptionStatut> = {
  ouvert: { libelle: 'Ouvert', variante: 'volt', actif: true },
  complet: { libelle: 'Complet', variante: 'info' },
  annule: { libelle: 'Annulé', variante: 'neutre' },
  expire: { libelle: 'Expiré', variante: 'neutre' },
}

/**
 * Statuts de match. `verification` ne fait plus partie du parcours joueur (deux déclarations
 * concordantes règlent le match immédiatement) mais reste décrit ici : des lignes historiques
 * y sont encore et l'administration peut toujours les régler à la main.
 */
const MATCHS: Record<string, DescriptionStatut> = {
  en_cours: { libelle: 'En cours', variante: 'info', actif: true },
  preuve_requise: { libelle: 'Preuve exigée', variante: 'alerte', actif: true },
  nul_en_attente: { libelle: 'Match nul', variante: 'alerte', actif: true },
  verification: { libelle: 'Vérification', variante: 'alerte', actif: true },
  litige: { libelle: 'Litige', variante: 'perte', actif: true },
  termine: { libelle: 'Terminé', variante: 'gain' },
}

const LITIGES: Record<string, DescriptionStatut> = {
  en_cours: { libelle: 'En arbitrage', variante: 'alerte', actif: true },
  resolu: { libelle: 'Résolu', variante: 'gain' },
}

const PREUVES: Record<string, DescriptionStatut> = {
  en_attente: { libelle: 'En attente', variante: 'alerte' },
  validee: { libelle: 'Validée', variante: 'gain' },
  rejetee: { libelle: 'Rejetée', variante: 'perte' },
}

const PAIEMENTS: Record<string, DescriptionStatut> = {
  en_attente: { libelle: 'En attente', variante: 'alerte', actif: true },
  reussi: { libelle: 'Réussi', variante: 'gain' },
  echoue: { libelle: 'Échoué', variante: 'perte' },
  rembourse: { libelle: 'Remboursé', variante: 'info' },
}

const TRANSACTIONS: Record<string, DescriptionStatut> = {
  valide: { libelle: 'Validé', variante: 'gain' },
  en_attente: { libelle: 'En attente', variante: 'alerte' },
  annule: { libelle: 'Annulé', variante: 'neutre' },
}

const UTILISATEURS: Record<string, DescriptionStatut> = {
  actif: { libelle: 'Actif', variante: 'gain' },
  suspendu: { libelle: 'Suspendu', variante: 'perte' },
  en_attente: { libelle: 'En attente', variante: 'alerte' },
  supprime: { libelle: 'Supprimé', variante: 'neutre' },
}

const CATALOGUE: Record<string, DescriptionStatut> = {
  actif: { libelle: 'Actif', variante: 'gain' },
  inactif: { libelle: 'Inactif', variante: 'neutre' },
}

const MISES: Record<string, DescriptionStatut> = {
  bloquee: { libelle: 'Bloquée', variante: 'alerte' },
  gagnee: { libelle: 'Gagnée', variante: 'gain' },
  perdue: { libelle: 'Perdue', variante: 'perte' },
  remboursee: { libelle: 'Remboursée', variante: 'info' },
}

/** Messages du formulaire de contact (module `contact`). */
const CONTACT: Record<string, DescriptionStatut> = {
  nouveau: { libelle: 'Nouveau', variante: 'volt', actif: true },
  lu: { libelle: 'Lu', variante: 'info' },
  traite: { libelle: 'Traité', variante: 'gain' },
}

export const statuts = {
  defi: DEFIS,
  match: MATCHS,
  litige: LITIGES,
  preuve: PREUVES,
  paiement: PAIEMENTS,
  transaction: TRANSACTIONS,
  utilisateur: UTILISATEURS,
  catalogue: CATALOGUE,
  mise: MISES,
  contact: CONTACT,
} as const

export type FamilleStatut = keyof typeof statuts

export function decrireStatut(famille: FamilleStatut, valeur: string): DescriptionStatut {
  return statuts[famille][valeur] ?? { libelle: valeur.replaceAll('_', ' '), variante: 'neutre' }
}

/** Libellés des types de mouvement du portefeuille. */
export const typesTransaction: Record<string, { libelle: string; sens: 'credit' | 'debit' | 'neutre' }> = {
  depot: { libelle: 'Dépôt', sens: 'credit' },
  mise_bloquee: { libelle: 'Mise bloquée', sens: 'debit' },
  gain: { libelle: 'Gain de match', sens: 'credit' },
  commission: { libelle: 'Commission', sens: 'neutre' },
  remboursement: { libelle: 'Remboursement', sens: 'credit' },
  retrait: { libelle: 'Retrait', sens: 'debit' },
}

export const typesNotification: Record<string, string> = {
  defi_rejoint: 'Défi accepté',
  defi_expire: 'Défi expiré',
  match_a_valider: 'Match à valider',
  // Nouveau parcours de fin de match (confirmation, désaccord, nul, rejeu, abandon).
  match_score: 'Résultat à confirmer',
  match_desaccord: 'Déclarations divergentes',
  match_nul: 'Match nul',
  match_rejoue: 'Nouvelle manche',
  match_abandon: 'Délai de confirmation écoulé',
  match_termine: 'Match terminé',
  litige_ouvert: 'Litige ouvert',
  litige_resolu: 'Litige résolu',
  paiement_confirme: 'Paiement confirmé',
  paiement_echoue: 'Paiement échoué',
}

export const libellesPrestataires: Record<string, string> = {
  ligdicash: 'LigdiCash',
  fusionmoney: 'MoneyFusion',
}

export const libellesConfigurations: Record<string, { libelle: string; unite: 'pourcentage' | 'montant'; aide: string }> = {
  commission_defi: {
    libelle: 'Commission par défi',
    unite: 'pourcentage',
    aide: 'Prélevée sur le total des deux mises au règlement du match.',
  },
  mise_minimale: { libelle: 'Mise minimale', unite: 'montant', aide: 'Montant plancher par joueur pour créer un défi.' },
  mise_maximale: { libelle: 'Mise maximale', unite: 'montant', aide: 'Montant plafond par joueur pour créer un défi.' },
  frais_retrait: {
    libelle: 'Frais de retrait',
    unite: 'pourcentage',
    aide: 'Prélevés en plus du montant retiré, acquis seulement si le retrait réussit.',
  },
}

export const libellesActionsAudit: Record<string, string> = {
  'defi:creation': 'Création de défi',
  'defi:rejoindre': 'Défi rejoint',
  'defi:annulation': 'Défi annulé',
  'defi:expiration': 'Défi expiré',
  'match:validation': 'Match validé',
  'litige:ouverture': 'Litige ouvert',
  'litige:decision': 'Décision de litige',
  'litige:relance': 'Relance arbitre',
  'preuve:validee': 'Preuve validée',
  'preuve:rejetee': 'Preuve rejetée',
  'paiement:depot_reussi': 'Dépôt crédité',
  'paiement:retrait_demande': 'Retrait demandé',
  'paiement:statut_reussi': 'Paiement réussi',
  'paiement:statut_echoue': 'Paiement échoué',
  'paiement:statut_rembourse': 'Paiement remboursé',
  'utilisateur:statut_actif': 'Compte réactivé',
  'utilisateur:statut_suspendu': 'Compte suspendu',
  'utilisateur:creation': 'Compte créé par l’admin',
  'utilisateur:modification': 'Compte modifié par l’admin',
  'utilisateur:suppression': 'Compte supprimé (anonymisé)',
  'contact:statut_nouveau': 'Message remis à « nouveau »',
  'contact:statut_lu': 'Message marqué lu',
  'contact:statut_traite': 'Message marqué traité',
  'contact:suppression': 'Message de contact supprimé',
  'configuration:modification': 'Configuration modifiée',
  'connexion:echec_joueur': 'Échec de connexion joueur',
  'connexion:echec_admin': 'Échec de connexion admin',
}
