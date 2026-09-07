import '../modeles/conversion.dart';
import '../modeles/jeu.modele.dart';
import '../modeles/plateforme.modele.dart';
import '../modeles/regles_financieres.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

/// Catalogue public : jeux, plateformes et règles financières en vigueur.
/// Ces trois listes alimentent la création de défi, les filtres et la FAQ — la
/// commission n'est jamais écrite en dur dans un texte.
class CatalogueService {
  const CatalogueService._();

  static Future<Resultat<List<Jeu>>> jeux() async =>
      (await ClientApi.get('/jeux')).vers((corps) => liste(corps, Jeu.depuisJson));

  static Future<Resultat<List<Plateforme>>> plateformes() async =>
      (await ClientApi.get('/plateformes')).vers((corps) => liste(corps, Plateforme.depuisJson));

  static Future<Resultat<ReglesFinancieres>> regles() async =>
      (await ClientApi.get('/configurations-financieres'))
          .vers(ReglesFinancieres.depuisListe);
}
