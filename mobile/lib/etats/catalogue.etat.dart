import 'package:flutter/foundation.dart';

import '../modeles/jeu.modele.dart';
import '../modeles/plateforme.modele.dart';
import '../modeles/regles_financieres.modele.dart';
import '../noyau/catalogue.dart';
import '../noyau/resultat.dart';
import '../services/catalogue.service.dart';

/// Catalogue et règles financières, chargés une fois puis réutilisés par la
/// création de défi, les filtres, le profil et la FAQ.
///
/// Ces trois listes ne changent qu'à l'initiative d'un administrateur : les
/// garder en mémoire évite trois appels à chaque ouverture d'écran, sans jamais
/// devenir du rafraîchissement périodique.
class CatalogueEtat extends ChangeNotifier {
  List<Jeu> _jeux = const [];
  List<Plateforme> _plateformes = const [];
  ReglesFinancieres _regles = ReglesFinancieres.defaut;
  bool _charge = false;
  bool _enCours = false;

  List<Jeu> get jeux => _jeux;
  List<Plateforme> get plateformes => _plateformes;
  ReglesFinancieres get regles => _regles;
  bool get charge => _charge;

  Jeu? jeu(String id) => _jeux.where((j) => j.id == id).firstOrNull;
  Plateforme? plateforme(String id) => _plateformes.where((p) => p.id == id).firstOrNull;

  String nomJeu(String id) => jeu(id)?.nom ?? 'Jeu';
  String nomPlateforme(String id) => plateforme(id)?.nom ?? 'Plateforme';

  /// Jeux d'une catégorie donnée, dans l'ordre du catalogue.
  List<Jeu> jeuxDeCategorie(String? categorie) => categorie == null
      ? _jeux
      : _jeux.where((j) => j.categorie == categorie).toList(growable: false);

  /// Jeux groupés par catégorie, dans l'ordre officiel des 7 catégories — les
  /// listes déroulantes reprennent ce groupement, comme les `<optgroup>` du web.
  Map<CategorieJeu, List<Jeu>> get jeuxGroupes {
    final groupes = <CategorieJeu, List<Jeu>>{};
    for (final categorie in categoriesJeu) {
      final membres = _jeux.where((j) => j.categorie == categorie.valeur).toList();
      if (membres.isNotEmpty) groupes[categorie] = membres;
    }
    // Une catégorie inconnue (ajoutée côté admin après une mise à jour) ne doit
    // pas faire disparaître ses jeux de la liste.
    final orphelins = _jeux.where((j) => !estCategorie(j.categorie)).toList();
    if (orphelins.isNotEmpty) groupes[decrireCategorie(null)] = orphelins;
    return groupes;
  }

  Map<FamillePlateforme, List<Plateforme>> get plateformesGroupees {
    final groupes = <FamillePlateforme, List<Plateforme>>{};
    for (final famille in famillesPlateforme) {
      final membres = _plateformes.where((p) => p.famille == famille.valeur).toList();
      if (membres.isNotEmpty) groupes[famille] = membres;
    }
    final orphelins = _plateformes.where((p) => !estFamille(p.famille)).toList();
    if (orphelins.isNotEmpty) groupes[decrireFamille(null)] = orphelins;
    return groupes;
  }

  Future<void> charger({bool force = false}) async {
    if (_enCours || (_charge && !force)) return;
    _enCours = true;

    final resultats = await Future.wait([
      CatalogueService.jeux(),
      CatalogueService.plateformes(),
      CatalogueService.regles(),
    ]);

    final rJeux = resultats[0];
    if (rJeux is Succes<List<Jeu>>) _jeux = rJeux.donnees;
    final rPlateformes = resultats[1];
    if (rPlateformes is Succes<List<Plateforme>>) _plateformes = rPlateformes.donnees;
    final rRegles = resultats[2];
    if (rRegles is Succes<ReglesFinancieres>) _regles = rRegles.donnees;

    _charge = _jeux.isNotEmpty || _plateformes.isNotEmpty;
    _enCours = false;
    notifyListeners();
  }
}

extension _Premier<T> on Iterable<T> {
  T? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}
