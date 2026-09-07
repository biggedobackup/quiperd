import 'conversion.dart';

/// Table `litiges` (§7.10). Tant qu'un litige est en cours, les deux mises
/// restent bloquées : l'arbitre règle au gagnant ou rend leur mise aux deux
/// joueurs, moins la commission.
class Litige {
  const Litige({
    required this.id,
    required this.dateCreation,
    required this.matchId,
    required this.ouvertParId,
    required this.motif,
    required this.statut,
    required this.decision,
    required this.dateResolution,
  });

  final String id;
  final String dateCreation;
  final String matchId;
  final String? ouvertParId;
  final String motif;

  /// en_cours | resolu
  final String statut;

  /// gagnant | remboursement (vide tant que le litige n'est pas tranché)
  final String decision;
  final String? dateResolution;

  bool get resolu => statut == 'resolu';

  factory Litige.depuisJson(Map<String, dynamic> json) => Litige(
        id: texte(json, 'id'),
        dateCreation: texte(json, 'dateCreation'),
        matchId: texte(json, 'matchId'),
        ouvertParId: texteOuNull(json, 'ouvertParId'),
        motif: texte(json, 'motif'),
        statut: texte(json, 'statut', 'en_cours'),
        decision: texte(json, 'decision'),
        dateResolution: texteOuNull(json, 'dateResolution'),
      );

  Litige copieAvec({String? statut, String? decision, String? dateResolution}) => Litige(
        id: id,
        dateCreation: dateCreation,
        matchId: matchId,
        ouvertParId: ouvertParId,
        motif: motif,
        statut: statut ?? this.statut,
        decision: decision ?? this.decision,
        dateResolution: dateResolution ?? this.dateResolution,
      );
}
