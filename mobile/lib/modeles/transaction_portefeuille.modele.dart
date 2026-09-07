import 'conversion.dart';

/// Table `transactions_portefeuilles` (§7.12) : l'historique de tous les
/// mouvements du portefeuille.
class TransactionPortefeuille {
  const TransactionPortefeuille({
    required this.id,
    required this.dateCreation,
    required this.miseId,
    required this.matchId,
    required this.type,
    required this.montant,
    required this.statut,
    required this.reference,
    required this.description,
  });

  final String id;
  final String dateCreation;
  final String? miseId;
  final String? matchId;

  /// depot | mise_bloquee | gain | commission | remboursement | retrait
  final String type;
  final String montant;

  /// valide | en_attente | annule
  final String statut;
  final String reference;
  final String description;

  /// Commission liée à un match ou à une mise rendue : elle est déjà déduite du
  /// gain ou du remboursement, elle n'est affichée qu'à titre informatif.
  bool get commissionInformative =>
      type == 'commission' && (matchId != null || miseId != null);

  factory TransactionPortefeuille.depuisJson(Map<String, dynamic> json) =>
      TransactionPortefeuille(
        id: texte(json, 'id'),
        dateCreation: texte(json, 'dateCreation'),
        miseId: texteOuNull(json, 'miseId'),
        matchId: texteOuNull(json, 'matchId'),
        type: texte(json, 'type'),
        montant: montantDe(json, 'montant'),
        statut: texte(json, 'statut', 'valide'),
        reference: texte(json, 'reference'),
        description: texte(json, 'description'),
      );
}
