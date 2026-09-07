import 'conversion.dart';

/// Table `resultats_declares` (§7.8) : la déclaration d'un joueur pour une
/// manche donnée. Une ligne par joueur et par manche.
class ResultatDeclare {
  const ResultatDeclare({
    required this.id,
    required this.matchId,
    required this.utilisateurId,
    required this.manche,
    required this.scorePour,
    required this.scoreContre,
    required this.gagnantDeclareId,
    required this.commentaire,
    required this.dateDeclaration,
  });

  final String id;
  final String matchId;
  final String utilisateurId;
  final int manche;
  final int scorePour;
  final int scoreContre;

  /// `null` = égalité déclarée (match nul).
  final String? gagnantDeclareId;
  final String commentaire;
  final String dateDeclaration;

  bool get estNul => gagnantDeclareId == null;

  factory ResultatDeclare.depuisJson(Map<String, dynamic> json) => ResultatDeclare(
        id: texte(json, 'id'),
        matchId: texte(json, 'matchId'),
        utilisateurId: texte(json, 'utilisateurId'),
        manche: entier(json, 'manche', 1) == 0 ? 1 : entier(json, 'manche', 1),
        scorePour: entier(json, 'scorePour'),
        scoreContre: entier(json, 'scoreContre'),
        gagnantDeclareId: texteOuNull(json, 'gagnantDeclareId'),
        commentaire: texte(json, 'commentaire'),
        dateDeclaration: texte(json, 'dateDeclaration'),
      );
}
