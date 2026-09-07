import 'conversion.dart';

/// Table `choix_nuls` : après un match nul déclaré des deux côtés, chaque joueur
/// choisit de rejouer la manche (aucun mouvement d'argent) ou de partager
/// l'escrow (mise rendue moins la commission). Une ligne par joueur et par manche.
class ChoixNul {
  const ChoixNul({
    required this.id,
    required this.matchId,
    required this.utilisateurId,
    required this.manche,
    required this.choix,
    required this.dateChoix,
  });

  final String id;
  final String matchId;
  final String utilisateurId;
  final int manche;

  /// rejouer | partager
  final String choix;
  final String dateChoix;

  factory ChoixNul.depuisJson(Map<String, dynamic> json) => ChoixNul(
        id: texte(json, 'id'),
        matchId: texte(json, 'matchId'),
        utilisateurId: texte(json, 'utilisateurId'),
        manche: entier(json, 'manche', 1) == 0 ? 1 : entier(json, 'manche', 1),
        choix: texte(json, 'choix'),
        dateChoix: texte(json, 'dateChoix'),
      );
}
