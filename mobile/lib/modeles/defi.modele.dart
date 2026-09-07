import 'conversion.dart';

/// Table `defis` (§7.5), sous la forme enrichie renvoyée par
/// `GET /api/defis`, `GET /api/defis/ouverts` et `GET /api/defis/:id` :
/// le défi plus les libellés joints (créateur, jeu + catégorie, plateforme +
/// famille), pour qu'une carte s'affiche sans second appel.
class Defi {
  const Defi({
    required this.id,
    required this.dateCreation,
    required this.createurId,
    required this.jeuId,
    required this.plateformeId,
    required this.montantMise,
    required this.devise,
    required this.regles,
    required this.statut,
    required this.dateExpiration,
    required this.createurNom,
    required this.jeuNom,
    required this.jeuCategorie,
    required this.plateformeNom,
    required this.plateformeFamille,
  });

  final String id;
  final String dateCreation;
  final String createurId;
  final String jeuId;
  final String plateformeId;

  /// Chaîne décimale (`"2000"`) — jamais un `double` : c'est de l'argent.
  final String montantMise;
  final String devise;
  final String regles;

  /// ouvert | complet | annule | expire
  final String statut;
  final String? dateExpiration;

  final String createurNom;
  final String jeuNom;
  final String jeuCategorie;
  final String plateformeNom;
  final String plateformeFamille;

  bool get ouvert => statut == 'ouvert';

  factory Defi.depuisJson(Map<String, dynamic> json) => Defi(
        id: texte(json, 'id'),
        dateCreation: texte(json, 'dateCreation'),
        createurId: texte(json, 'createurId'),
        jeuId: texte(json, 'jeuId'),
        plateformeId: texte(json, 'plateformeId'),
        montantMise: montantDe(json, 'montantMise'),
        devise: texte(json, 'devise', 'XOF'),
        regles: texte(json, 'regles'),
        statut: texte(json, 'statut', 'ouvert'),
        dateExpiration: texteOuNull(json, 'dateExpiration'),
        createurNom: texte(json, 'createurNom'),
        jeuNom: texte(json, 'jeuNom'),
        jeuCategorie: texte(json, 'jeuCategorie'),
        plateformeNom: texte(json, 'plateformeNom'),
        plateformeFamille: texte(json, 'plateformeFamille'),
      );

  Defi copieAvec({String? statut}) => Defi(
        id: id,
        dateCreation: dateCreation,
        createurId: createurId,
        jeuId: jeuId,
        plateformeId: plateformeId,
        montantMise: montantMise,
        devise: devise,
        regles: regles,
        statut: statut ?? this.statut,
        dateExpiration: dateExpiration,
        createurNom: createurNom,
        jeuNom: jeuNom,
        jeuCategorie: jeuCategorie,
        plateformeNom: plateformeNom,
        plateformeFamille: plateformeFamille,
      );
}

/// Filtres de la liste des défis ouverts.
class FiltresDefis {
  const FiltresDefis({this.categorie, this.jeu, this.plateforme, this.miseMax});

  final String? categorie;
  final String? jeu;
  final String? plateforme;
  final double? miseMax;

  bool get actifs =>
      categorie != null || jeu != null || plateforme != null || miseMax != null;

  /// Nombre de critères posés. Sur mobile, les filtres vivent dans une feuille : le bouton
  /// qui l'ouvre porte ce compte, sinon rien ne dit qu'une liste est filtrée.
  int get nombreActifs =>
      [categorie, jeu, plateforme, miseMax].where((v) => v != null).length;

  Map<String, dynamic> get parametres => {
        if (categorie != null) 'categorie': categorie,
        if (jeu != null) 'jeu': jeu,
        if (plateforme != null) 'plateforme': plateforme,
        if (miseMax != null) 'miseMax': miseMax!.toStringAsFixed(0),
      };

  FiltresDefis copieAvec({
    Object? categorie = _absent,
    Object? jeu = _absent,
    Object? plateforme = _absent,
    Object? miseMax = _absent,
  }) =>
      FiltresDefis(
        categorie: categorie == _absent ? this.categorie : categorie as String?,
        jeu: jeu == _absent ? this.jeu : jeu as String?,
        plateforme: plateforme == _absent ? this.plateforme : plateforme as String?,
        miseMax: miseMax == _absent ? this.miseMax : miseMax as double?,
      );

  static const FiltresDefis aucun = FiltresDefis();
}

/// Sentinelle : distingue « paramètre non fourni » de « remis à null ».
const Object _absent = Object();
