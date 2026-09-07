import 'conversion.dart';

/// Règles financières actives, lues sur `GET /api/configurations-financieres`
/// (route publique). La commission et les bornes de mise ne sont **jamais**
/// écrites en dur : elles changent depuis l'administration et l'application doit
/// afficher la valeur en vigueur.
class ReglesFinancieres {
  const ReglesFinancieres({
    required this.commissionDefi,
    required this.miseMinimale,
    required this.miseMaximale,
    required this.fraisRetrait,
  });

  /// Taux (0.1 = 10 %) prélevé sur le total des deux mises au règlement.
  final double commissionDefi;
  final double miseMinimale;
  final double miseMaximale;

  /// Taux prélevé en plus du montant retiré.
  final double fraisRetrait;

  /// Valeurs de repli si l'appel échoue : elles ne servent qu'à ne pas bloquer
  /// l'affichage. Toute création de défi reste validée par le serveur.
  static const ReglesFinancieres defaut = ReglesFinancieres(
    commissionDefi: 0.1,
    miseMinimale: 500,
    miseMaximale: 100000,
    fraisRetrait: 0.02,
  );

  /// La réponse est un tableau `[{type, valeur, devise}]` : une ligne par règle.
  factory ReglesFinancieres.depuisListe(Object? source) {
    var commission = defaut.commissionDefi;
    var minimale = defaut.miseMinimale;
    var maximale = defaut.miseMaximale;
    var frais = defaut.fraisRetrait;

    if (source is List) {
      for (final brut in source) {
        final ligne = objet(brut);
        final valeur = reel(ligne, 'valeur');
        switch (texte(ligne, 'type')) {
          case 'commission_defi':
            commission = valeur;
          case 'mise_minimale':
            minimale = valeur;
          case 'mise_maximale':
            maximale = valeur;
          case 'frais_retrait':
            frais = valeur;
        }
      }
    }
    return ReglesFinancieres(
      commissionDefi: commission,
      miseMinimale: minimale,
      miseMaximale: maximale,
      fraisRetrait: frais,
    );
  }
}
