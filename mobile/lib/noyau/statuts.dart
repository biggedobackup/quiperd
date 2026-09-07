import 'package:flutter/material.dart';

import '../theme/couleurs.dart';

/// Libellés et couleurs de chaque statut du backend — miroir de
/// `frontend/src/lib/statuts.ts`. Les valeurs (`snake_case`) sont celles de la
/// charte API et ne sont JAMAIS renommées côté mobile.

class DescriptionStatut {
  const DescriptionStatut(this.libelle, this.texte, this.fond, {this.actif = false});

  final String libelle;
  final Color texte;
  final Color fond;

  /// Statut « vivant » : le badge pulse lentement.
  final bool actif;
}

const Map<String, DescriptionStatut> statutsDefi = {
  'ouvert': DescriptionStatut('Ouvert', Couleurs.vert, Couleurs.voltFond, actif: true),
  'complet': DescriptionStatut('Complet', Couleurs.info, Couleurs.infoFond),
  'annule': DescriptionStatut('Annulé', Couleurs.muet, Couleurs.gris),
  'expire': DescriptionStatut('Expiré', Couleurs.muet, Couleurs.gris),
};

/// `verification` ne fait plus partie du parcours joueur (deux déclarations
/// concordantes règlent le match immédiatement) mais reste décrit : des lignes
/// historiques y sont encore et l'administration peut les régler à la main.
const Map<String, DescriptionStatut> statutsMatch = {
  'en_cours': DescriptionStatut('En cours', Couleurs.info, Couleurs.infoFond, actif: true),
  'preuve_requise':
      DescriptionStatut('Preuve exigée', Couleurs.alerte, Couleurs.alerteFond, actif: true),
  'nul_en_attente':
      DescriptionStatut('Match nul', Couleurs.alerte, Couleurs.alerteFond, actif: true),
  'verification':
      DescriptionStatut('Vérification', Couleurs.alerte, Couleurs.alerteFond, actif: true),
  'litige': DescriptionStatut('Litige', Couleurs.perte, Couleurs.perteFond, actif: true),
  'termine': DescriptionStatut('Terminé', Couleurs.gain, Couleurs.gainFond),
};

const Map<String, DescriptionStatut> statutsLitige = {
  'en_cours':
      DescriptionStatut('En arbitrage', Couleurs.alerte, Couleurs.alerteFond, actif: true),
  'resolu': DescriptionStatut('Résolu', Couleurs.gain, Couleurs.gainFond),
};

const Map<String, DescriptionStatut> statutsPreuve = {
  'en_attente': DescriptionStatut('En attente', Couleurs.alerte, Couleurs.alerteFond),
  'validee': DescriptionStatut('Validée', Couleurs.gain, Couleurs.gainFond),
  'rejetee': DescriptionStatut('Rejetée', Couleurs.perte, Couleurs.perteFond),
};

const Map<String, DescriptionStatut> statutsPaiement = {
  'en_attente':
      DescriptionStatut('En attente', Couleurs.alerte, Couleurs.alerteFond, actif: true),
  'reussi': DescriptionStatut('Réussi', Couleurs.gain, Couleurs.gainFond),
  'echoue': DescriptionStatut('Échoué', Couleurs.perte, Couleurs.perteFond),
  'rembourse': DescriptionStatut('Remboursé', Couleurs.info, Couleurs.infoFond),
};

const Map<String, DescriptionStatut> statutsTransaction = {
  'valide': DescriptionStatut('Validé', Couleurs.gain, Couleurs.gainFond),
  'en_attente': DescriptionStatut('En attente', Couleurs.alerte, Couleurs.alerteFond),
  'annule': DescriptionStatut('Annulé', Couleurs.muet, Couleurs.gris),
};

enum FamilleStatut { defi, match, litige, preuve, paiement, transaction }

DescriptionStatut decrireStatut(FamilleStatut famille, String valeur) {
  final table = switch (famille) {
    FamilleStatut.defi => statutsDefi,
    FamilleStatut.match => statutsMatch,
    FamilleStatut.litige => statutsLitige,
    FamilleStatut.preuve => statutsPreuve,
    FamilleStatut.paiement => statutsPaiement,
    FamilleStatut.transaction => statutsTransaction,
  };
  return table[valeur] ??
      DescriptionStatut(valeur.replaceAll('_', ' '), Couleurs.muet, Couleurs.gris);
}

/// Type de mouvement du portefeuille : libellé et sens (crédit / débit).
class TypeTransaction {
  const TypeTransaction(this.libelle, this.sens);
  final String libelle;
  final String sens; // credit | debit | neutre
}

const Map<String, TypeTransaction> typesTransaction = {
  'depot': TypeTransaction('Dépôt', 'credit'),
  'mise_bloquee': TypeTransaction('Mise bloquée', 'debit'),
  'gain': TypeTransaction('Gain de match', 'credit'),
  'commission': TypeTransaction('Commission', 'neutre'),
  'remboursement': TypeTransaction('Remboursement', 'credit'),
  'retrait': TypeTransaction('Retrait', 'debit'),
};

const Map<String, String> typesNotification = {
  'defi_rejoint': 'Défi accepté',
  'defi_expire': 'Défi expiré',
  'match_a_valider': 'Match à valider',
  'match_score': 'Score à confirmer',
  'match_desaccord': 'Déclarations divergentes',
  'match_nul': 'Match nul',
  'match_rejoue': 'Nouvelle manche',
  'match_abandon': 'Délai de confirmation écoulé',
  'match_termine': 'Match terminé',
  'litige_ouvert': 'Litige ouvert',
  'litige_resolu': 'Litige résolu',
  'paiement_confirme': 'Paiement confirmé',
  'paiement_echoue': 'Paiement échoué',
};

/// Icône associée à chaque type de notification (barre de la liste).
const Map<String, IconData> iconesNotification = {
  'defi_rejoint': Icons.handshake_outlined,
  'defi_expire': Icons.schedule,
  'match_a_valider': Icons.sports_esports_outlined,
  'match_score': Icons.scoreboard_outlined,
  'match_desaccord': Icons.report_problem_outlined,
  'match_nul': Icons.balance,
  'match_rejoue': Icons.replay,
  'match_abandon': Icons.timer_off_outlined,
  'match_termine': Icons.emoji_events_outlined,
  'litige_ouvert': Icons.gavel_outlined,
  'litige_resolu': Icons.gavel,
  'paiement_confirme': Icons.south_west,
  'paiement_echoue': Icons.error_outline,
};

