import 'conversion.dart';

/// Table `portefeuilles` (§7.11). Les deux soldes sont des chaînes décimales :
/// le mobile les AFFICHE, il ne les calcule jamais.
class Portefeuille {
  const Portefeuille({
    required this.id,
    required this.utilisateurId,
    required this.devise,
    required this.soldeDisponible,
    required this.soldeBloque,
  });

  final String id;
  final String utilisateurId;
  final String devise;

  /// Misable et retirable.
  final String soldeDisponible;

  /// Mises engagées sur des défis ou des matchs en cours (séquestre).
  final String soldeBloque;

  static const Portefeuille vide = Portefeuille(
    id: '',
    utilisateurId: '',
    devise: 'XOF',
    soldeDisponible: '0',
    soldeBloque: '0',
  );

  factory Portefeuille.depuisJson(Map<String, dynamic> json) => Portefeuille(
        id: texte(json, 'id'),
        utilisateurId: texte(json, 'utilisateurId'),
        devise: texte(json, 'devise', 'XOF'),
        soldeDisponible: montantDe(json, 'soldeDisponible'),
        soldeBloque: montantDe(json, 'soldeBloque'),
      );

  Portefeuille copieAvec({String? soldeDisponible, String? soldeBloque, String? devise}) =>
      Portefeuille(
        id: id,
        utilisateurId: utilisateurId,
        devise: devise ?? this.devise,
        soldeDisponible: soldeDisponible ?? this.soldeDisponible,
        soldeBloque: soldeBloque ?? this.soldeBloque,
      );
}
