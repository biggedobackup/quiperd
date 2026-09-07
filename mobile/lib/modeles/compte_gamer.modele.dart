import 'conversion.dart';

/// Table `comptes_gamers` (§7.4) : le pseudo du joueur dans chaque jeu et sur
/// chaque plateforme, pour que l'adversaire le trouve en ligne.
class CompteGamer {
  const CompteGamer({
    required this.id,
    required this.utilisateurId,
    required this.jeuId,
    required this.plateformeId,
    required this.identifiantJoueur,
    required this.nomAffichage,
  });

  final String id;
  final String utilisateurId;
  final String jeuId;
  final String plateformeId;
  final String identifiantJoueur;
  final String nomAffichage;

  factory CompteGamer.depuisJson(Map<String, dynamic> json) => CompteGamer(
        id: texte(json, 'id'),
        utilisateurId: texte(json, 'utilisateurId'),
        jeuId: texte(json, 'jeuId'),
        plateformeId: texte(json, 'plateformeId'),
        identifiantJoueur: texte(json, 'identifiantJoueur'),
        nomAffichage: texte(json, 'nomAffichage'),
      );
}
