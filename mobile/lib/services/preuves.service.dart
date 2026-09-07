import 'dart:io';

import '../config/environnement.dart';
import '../modeles/conversion.dart';
import '../modeles/preuve_match.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

/// Preuves de match : capture d'écran et vidéo.
///
/// Le serveur calcule une empreinte SHA-256 de chaque fichier : une preuve déjà
/// utilisée pour un AUTRE match est refusée (409). C'est volontaire — sans cela,
/// une même capture pourrait servir à gagner plusieurs matchs.
class PreuvesService {
  const PreuvesService._();

  /// 50 Mo côté serveur (`UPLOAD_MAX_MO`). On le vérifie aussi côté client pour
  /// ne pas faire attendre un envoi voué au 413.
  static const int tailleMaxOctets = 50 * 1024 * 1024;

  static const List<String> extensionsImage = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
  static const List<String> extensionsVideo = ['mp4', 'mov', 'webm', 'mkv'];

  static Future<Resultat<List<PreuveMatch>>> lister(String matchId) async =>
      (await ClientApi.get('/matchs/$matchId/preuves'))
          .vers((corps) => liste(corps, PreuveMatch.depuisJson));

  /// `multipart/form-data` avec les champs `type` et `fichier`, exactement ceux
  /// qu'attend le backend. [surProgression] reçoit une fraction 0→1 : sur une
  /// connexion mobile faible, un envoi muet est perçu comme un plantage.
  static Future<Resultat<PreuveMatch>> televerser(
    String matchId, {
    required File fichier,
    required String type,
    void Function(double)? surProgression,
  }) async =>
      (await ClientApi.televerser(
        '/matchs/$matchId/preuves',
        fichier: fichier,
        champs: {'type': type},
        surProgression: surProgression,
      ))
          .vers((corps) => PreuveMatch.depuisJson(objet(corps)));

  /// URL du fichier — route protégée. Elle ne s'ouvre qu'avec le jeton, on ne
  /// la donne donc jamais à un widget `Image.network` sans en-tête.
  static String urlFichier(String preuveId) =>
      '${Environnement.apiBaseUrl}/preuves/$preuveId/fichier';

  /// En-têtes à joindre pour lire une preuve (image ou vidéo).
  static Map<String, String> get entetesFichier =>
      ClientApi.connecte ? {'Authorization': 'Bearer ${ClientApi.jeton}'} : const {};
}
