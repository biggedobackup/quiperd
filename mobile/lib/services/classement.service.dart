import '../modeles/conversion.dart';
import '../modeles/ligne_classement.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

/// Classement des joueurs — route publique, enrichie de la ligne du joueur
/// connecté quand un jeton est présent.
class ClassementService {
  const ClassementService._();

  static const List<String> periodes = ['general', 'mois', 'semaine'];

  static const Map<String, String> libellesPeriodes = {
    'general': 'Général',
    'mois': 'Ce mois',
    'semaine': 'Cette semaine',
  };

  static Future<Resultat<Classement>> lire({String periode = 'general', int limite = 50}) async =>
      (await ClientApi.get('/classement', params: {'periode': periode, 'limite': limite}))
          .vers((corps) => Classement.depuisJson(objet(corps)));
}
