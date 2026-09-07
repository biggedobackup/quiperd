import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

/// Formulaire « Nous contacter ». Envoi public ; un jeton joueur valide, s'il
/// est présent, rattache le message au compte.
///
/// Anti-spam côté serveur : 5 messages par heure et par IP, sinon 429 — que
/// l'écran traduit en message clair plutôt qu'en « erreur inconnue ».
class ContactService {
  const ContactService._();

  static Future<Resultat<void>> envoyer({
    required String nom,
    required String email,
    required String sujet,
    required String message,
  }) async =>
      (await ClientApi.post('/contact', {
        'nom': nom,
        'email': email,
        'sujet': sujet,
        'message': message,
      }))
          .versRien();
}
