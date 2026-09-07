import '../modeles/conversion.dart';
import '../modeles/match_defi.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

/// Module `matchs`. Le mobile ne réimplémente AUCUNE règle de la machine à
/// états : il appelle la route, le serveur décide, et l'écran affiche l'état
/// renvoyé.
class MatchsService {
  const MatchsService._();

  static Future<Resultat<List<MatchDefi>>> lister({String? statut}) async =>
      (await ClientApi.get('/matchs', params: {'statut': ?statut}))
          .vers((corps) => liste(corps, MatchDefi.depuisJson));

  static Future<Resultat<DetailMatch>> detail(String id) async =>
      (await ClientApi.get('/matchs/$id')).vers((corps) => DetailMatch.depuisJson(objet(corps)));

  /// Déclare l'issue d'une manche : `gagne`, `perdu` ou `nul`.
  ///
  /// Première déclaration : pose le chrono de confirmation. Seconde : règlement immédiat si
  /// les deux concordent, `preuve_requise` si elles se contredisent, `nul_en_attente` si les
  /// deux annoncent une égalité. Aucun score chiffré ne circule — le serveur range l'issue
  /// en 1-0 / 0-1 / 0-0 pour son moteur de règlement, et cela ne regarde pas le client.
  static Future<Resultat<MatchDefi>> declarer(
    String id, {
    required String resultat,
    String commentaire = '',
  }) async =>
      (await ClientApi.post('/matchs/$id/declaration', {
        'resultat': resultat,
        'commentaire': commentaire,
      }))
          .vers((corps) => MatchDefi.depuisJson(objet(corps)));

  /// Confirmation du résultat annoncé par l'adversaire : **aucun corps**. Le
  /// serveur inscrit la déclaration miroir à partir de celle qu'il détient, si
  /// bien que le client ne peut pas falsifier l'issue qu'il prétend confirmer.
  static Future<Resultat<MatchDefi>> confirmer(String id) async =>
      (await ClientApi.post('/matchs/$id/confirmation'))
          .vers((corps) => MatchDefi.depuisJson(objet(corps)));

  /// Après un nul déclaré des deux côtés : `rejouer` (aucun mouvement d'argent,
  /// manche + 1) ou `partager` (mise rendue moins la commission).
  static Future<Resultat<MatchDefi>> choisirApresNul(String id, String choix) async =>
      (await ClientApi.post('/matchs/$id/choix-nul', {'choix': choix}))
          .vers((corps) => MatchDefi.depuisJson(objet(corps)));
}
