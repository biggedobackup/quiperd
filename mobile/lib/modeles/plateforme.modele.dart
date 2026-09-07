import 'conversion.dart';

/// Table `plateformes` (§7.3).
class Plateforme {
  const Plateforme({
    required this.id,
    required this.nom,
    required this.famille,
    required this.statut,
  });

  final String id;
  final String nom;

  /// pc | console | mobile
  final String famille;
  final String statut;

  factory Plateforme.depuisJson(Map<String, dynamic> json) => Plateforme(
        id: texte(json, 'id'),
        nom: texte(json, 'nom'),
        famille: texte(json, 'famille', 'console'),
        statut: texte(json, 'statut', 'actif'),
      );
}
