import 'conversion.dart';

/// Table `preuves_matchs` (§7.9). Le fichier ne se lit JAMAIS par une URL
/// statique : `GET /api/preuves/:id/fichier` est une route authentifiée.
class PreuveMatch {
  const PreuveMatch({
    required this.id,
    required this.dateCreation,
    required this.matchId,
    required this.utilisateurId,
    required this.type,
    required this.statut,
    required this.motifRejet,
  });

  final String id;
  final String dateCreation;
  final String matchId;
  final String utilisateurId;

  /// capture_ecran | video
  final String type;

  /// en_attente | validee | rejetee
  final String statut;
  final String motifRejet;

  bool get estVideo => type == 'video';

  factory PreuveMatch.depuisJson(Map<String, dynamic> json) => PreuveMatch(
        id: texte(json, 'id'),
        dateCreation: texte(json, 'dateCreation'),
        matchId: texte(json, 'matchId'),
        utilisateurId: texte(json, 'utilisateurId'),
        type: texte(json, 'type', 'capture_ecran'),
        statut: texte(json, 'statut', 'en_attente'),
        motifRejet: texte(json, 'motifRejet'),
      );
}
