import '../modeles/conversion.dart';
import '../modeles/notification_joueur.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

class NotificationsService {
  const NotificationsService._();

  static Future<Resultat<List<NotificationJoueur>>> lister() async =>
      (await ClientApi.get('/notifications'))
          .vers((corps) => liste(corps, NotificationJoueur.depuisJson));

  static Future<Resultat<void>> marquerLue(String id) async =>
      (await ClientApi.post('/notifications/$id/lue')).versRien();

  /// Deuxième phase : le backend est déjà prêt (le worker envoie réellement le
  /// push), seul le paquet `firebase_messaging` manque côté application.
  static Future<Resultat<void>> enregistrerJetonFcm(String jetonFcm, {String? appareil}) async =>
      (await ClientApi.post('/notifications/jeton-fcm', {
        'jetonFcm': jetonFcm,
        'appareil': ?appareil,
      }))
          .versRien();
}
