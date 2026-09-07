import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/environnement.dart';
import 'resultat.dart';

/// Client HTTP unique de l'application.
///
/// Il pose `Authorization: Bearer <jwt>` sur chaque requête (le backend ne lit
/// que cet en-tête ; le cookie `HttpOnly` est propre au serveur web), traduit la
/// charte d'erreur `{ "erreur": …, "details": … }` en [Echec], et prévient
/// l'application une seule fois quand la session est refusée.
class ClientApi {
  const ClientApi._();

  static String? _jeton;

  /// Appelé sur le premier `401` : la session a expiré ou le compte est
  /// suspendu. L'application vide son état et ramène à l'écran de connexion.
  static void Function()? surSessionExpiree;
  static bool _expirationSignalee = false;

  static String? get jeton => _jeton;
  static bool get connecte => _jeton != null && _jeton!.isNotEmpty;

  static void definirJeton(String? valeur) {
    _jeton = (valeur == null || valeur.isEmpty) ? null : valeur;
    _expirationSignalee = false;
  }

  static const Duration _delai = Duration(seconds: 20);

  static Map<String, String> _entetes({bool corpsJson = false}) => {
        'Accept': 'application/json',
        if (corpsJson) 'Content-Type': 'application/json; charset=utf-8',
        if (connecte) 'Authorization': 'Bearer $_jeton',
      };

  static Uri _uri(String chemin, [Map<String, dynamic>? params]) {
    final base = Uri.parse('${Environnement.apiBaseUrl}$chemin');
    if (params == null || params.isEmpty) return base;
    final requete = <String, String>{};
    params.forEach((cle, valeur) {
      if (valeur == null) return;
      final texte = valeur.toString();
      if (texte.isEmpty) return;
      requete[cle] = texte;
    });
    return base.replace(queryParameters: {...base.queryParameters, ...requete});
  }

  // ── Verbes ───────────────────────────────────────────────────────────────────

  static Future<Resultat<dynamic>> get(String chemin, {Map<String, dynamic>? params}) =>
      _envoyer(() => http.get(_uri(chemin, params), headers: _entetes()).timeout(_delai));

  static Future<Resultat<dynamic>> post(String chemin, [Object? corps]) => _envoyer(
        () => http
            .post(
              _uri(chemin),
              headers: _entetes(corpsJson: true),
              body: corps == null ? null : jsonEncode(corps),
            )
            .timeout(_delai),
      );

  static Future<Resultat<dynamic>> patch(String chemin, [Object? corps]) => _envoyer(
        () => http
            .patch(
              _uri(chemin),
              headers: _entetes(corpsJson: true),
              body: corps == null ? null : jsonEncode(corps),
            )
            .timeout(_delai),
      );

  static Future<Resultat<dynamic>> delete(String chemin) =>
      _envoyer(() => http.delete(_uri(chemin), headers: _entetes()).timeout(_delai));

  /// Téléversement d'une preuve : `multipart/form-data` avec les champs `type` et
  /// `fichier`, exactement ceux qu'attend `POST /api/matchs/:id/preuves`.
  ///
  /// [surProgression] reçoit une fraction 0→1. `package:http` n'expose pas la
  /// progression d'envoi ; on la calcule en poussant le corps par tranches, ce
  /// qui suffit à donner au joueur un retour honnête sur une vidéo de 50 Mo.
  static Future<Resultat<dynamic>> televerser(
    String chemin, {
    required File fichier,
    required Map<String, String> champs,
    void Function(double)? surProgression,
  }) async {
    try {
      final requete = http.MultipartRequest('POST', _uri(chemin))
        ..headers.addAll(_entetes())
        ..fields.addAll(champs);

      final octets = await fichier.length();
      final flux = http.ByteStream(
        _fluxSuivi(fichier.openRead(), octets, surProgression),
      );
      requete.files.add(
        http.MultipartFile('fichier', flux, octets, filename: fichier.uri.pathSegments.last),
      );

      // Une vidéo part lentement sur un réseau mobile : le délai court des appels
      // JSON ferait échouer un envoi parfaitement sain.
      final reponse = await http.Response.fromStream(
        await requete.send().timeout(const Duration(minutes: 10)),
      );
      return _lire(reponse);
    } on SocketException {
      return const Echec(0, 'Connexion impossible. Vérifiez votre réseau, puis réessayez.');
    } on TimeoutException {
      return const Echec(0, 'Envoi trop long. Vérifiez votre réseau, puis réessayez.');
    } catch (_) {
      return const Echec(0, 'Envoi impossible. Réessayez dans un instant.');
    }
  }

  static Stream<List<int>> _fluxSuivi(
    Stream<List<int>> source,
    int total,
    void Function(double)? surProgression,
  ) async* {
    var envoyes = 0;
    await for (final tranche in source) {
      envoyes += tranche.length;
      if (surProgression != null && total > 0) {
        surProgression((envoyes / total).clamp(0, 1).toDouble());
      }
      yield tranche;
    }
  }

  // ── Traitement commun ────────────────────────────────────────────────────────

  static Future<Resultat<dynamic>> _envoyer(Future<http.Response> Function() appel) async {
    try {
      return _lire(await appel());
    } on SocketException {
      return const Echec(0, 'Connexion impossible. Vérifiez votre réseau, puis réessayez.');
    } on HttpException {
      return const Echec(0, 'Serveur injoignable. Réessayez dans un instant.');
    } on TimeoutException {
      return const Echec(0, 'Le serveur met trop de temps à répondre. Réessayez.');
    } on FormatException {
      return const Echec(0, 'Réponse illisible du serveur.');
    } catch (_) {
      return const Echec(0, 'Une erreur inattendue est survenue.');
    }
  }

  static Resultat<dynamic> _lire(http.Response reponse) {
    // Le backend répond toujours en UTF-8 ; `reponse.body` suppose du latin-1
    // quand l'en-tête ne porte pas de charset, ce qui casse les accents.
    final texte = utf8.decode(reponse.bodyBytes, allowMalformed: true);
    dynamic corps;
    if (texte.trim().isNotEmpty) {
      try {
        corps = jsonDecode(texte);
      } catch (_) {
        corps = null;
      }
    }

    if (reponse.statusCode >= 200 && reponse.statusCode < 300) {
      return Succes<dynamic>(corps);
    }

    if (reponse.statusCode == 401) {
      // Une seule notification, même si dix requêtes échouent en même temps.
      if (!_expirationSignalee) {
        _expirationSignalee = true;
        surSessionExpiree?.call();
      }
    }

    var message = 'Une erreur est survenue.';
    final details = <String, String>{};
    if (corps is Map) {
      if (corps['erreur'] is String) message = corps['erreur'] as String;
      final brut = corps['details'];
      if (brut is Map) {
        brut.forEach((cle, valeur) => details['$cle'] = '$valeur');
      }
    }
    return Echec<dynamic>(reponse.statusCode, message, details: details);
  }
}
