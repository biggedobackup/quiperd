import 'conversion.dart';

/// Table `jeux` (§7.2). Le catalogue vient TOUJOURS de `GET /api/jeux` :
/// aucun titre n'est écrit en dur dans l'application.
class Jeu {
  const Jeu({
    required this.id,
    required this.nom,
    required this.categorie,
    required this.statut,
  });

  final String id;
  final String nom;

  /// sport | combat | course | tir | strategie | cartes | arcade
  final String categorie;
  final String statut;

  factory Jeu.depuisJson(Map<String, dynamic> json) => Jeu(
        id: texte(json, 'id'),
        nom: texte(json, 'nom'),
        categorie: texte(json, 'categorie', 'arcade'),
        statut: texte(json, 'statut', 'actif'),
      );
}
