import '../modeles/conversion.dart';
import '../modeles/litige.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

class LitigesService {
  const LitigesService._();

  static Future<Resultat<List<Litige>>> mesLitiges() async =>
      (await ClientApi.get('/litiges')).vers((corps) => liste(corps, Litige.depuisJson));

  /// Ouvre un litige sur un match : les deux mises restent bloquées jusqu'à la
  /// décision de l'arbitre. Motif d'au moins 3 caractères (validation backend).
  static Future<Resultat<Litige>> ouvrir({
    required String matchId,
    required String motif,
  }) async =>
      (await ClientApi.post('/matchs/$matchId/litige', {'motif': motif}))
          .vers((corps) => Litige.depuisJson(objet(corps)));
}
