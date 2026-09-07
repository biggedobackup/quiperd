import 'conversion.dart';

/// Table `portefeuilles` (§7.11). Les soldes sont des chaînes décimales :
/// le mobile les AFFICHE, il ne les calcule jamais.
class Portefeuille {
  const Portefeuille({
    required this.id,
    required this.utilisateurId,
    required this.devise,
    required this.soldeDisponible,
    required this.soldeBloque,
    required this.soldeNonJoue,
    required this.soldeRetirable,
  });

  final String id;
  final String utilisateurId;
  final String devise;

  /// Misable en entier ; retirable seulement à hauteur de [soldeRetirable].
  final String soldeDisponible;

  /// Mises engagées sur des défis ou des matchs en cours (séquestre).
  final String soldeBloque;

  /// Part du disponible qui vient d'un dépôt jamais misé. Un dépôt se joue avant de pouvoir
  /// être retiré : sinon la plateforme servirait de guichet de change.
  final String soldeNonJoue;

  /// `soldeDisponible − soldeNonJoue`, **calculé par le serveur**. Plafond réel d'un retrait,
  /// frais compris. Le mobile ne refait pas la soustraction : une règle d'argent ne se
  /// réimplémente pas dans le client.
  final String soldeRetirable;

  static const Portefeuille vide = Portefeuille(
    id: '',
    utilisateurId: '',
    devise: 'XOF',
    soldeDisponible: '0',
    soldeBloque: '0',
    soldeNonJoue: '0',
    soldeRetirable: '0',
  );

  factory Portefeuille.depuisJson(Map<String, dynamic> json) => Portefeuille(
        id: texte(json, 'id'),
        utilisateurId: texte(json, 'utilisateurId'),
        devise: texte(json, 'devise', 'XOF'),
        soldeDisponible: montantDe(json, 'soldeDisponible'),
        soldeBloque: montantDe(json, 'soldeBloque'),
        soldeNonJoue: montantDe(json, 'soldeNonJoue'),
        soldeRetirable: montantDe(json, 'soldeRetirable'),
      );

  Portefeuille copieAvec({
    String? soldeDisponible,
    String? soldeBloque,
    String? soldeNonJoue,
    String? soldeRetirable,
    String? devise,
  }) =>
      Portefeuille(
        id: id,
        utilisateurId: utilisateurId,
        devise: devise ?? this.devise,
        soldeDisponible: soldeDisponible ?? this.soldeDisponible,
        soldeBloque: soldeBloque ?? this.soldeBloque,
        soldeNonJoue: soldeNonJoue ?? this.soldeNonJoue,
        soldeRetirable: soldeRetirable ?? this.soldeRetirable,
      );
}
