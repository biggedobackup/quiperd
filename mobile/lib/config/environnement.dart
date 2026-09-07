import 'dart:io' show Platform;

/// Adresses de l'API REST et du socket temps réel — une seule source pour toute
/// l'application.
///
/// La valeur peut être imposée à la compilation :
/// `flutter run --dart-define=API_BASE_URL=https://api.quiperd.com/api`.
/// Sans cela, on vise le poste de développement : `10.0.2.2` est l'alias de la
/// machine hôte vu depuis l'émulateur Android (le HTTP en clair n'y est autorisé
/// que par le `network_security_config` du source set `debug`).
class Environnement {
  const Environnement._();

  static const String _impose = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_impose.isNotEmpty) return _impose;
    if (Platform.isAndroid) return 'http://10.0.2.2:8080/api';
    return 'http://localhost:8080/api';
  }

  /// URL du socket, dérivée de l'API : `http` → `ws`, `https` → `wss`.
  /// Garder une seule source évite le classique « l'API est en prod, le socket
  /// pointe encore sur localhost ».
  static String get wsBaseUrl =>
      '${apiBaseUrl.replaceFirst(RegExp(r'^http'), 'ws')}/temps-reel';

  static const String _siteImpose = String.fromEnvironment('SITE_BASE_URL');

  /// Adresse PUBLIQUE du site web, sans barre finale — la base des liens de partage
  /// (`<site>/defis/<id>`).
  ///
  /// Ce n'est pas l'API : le lien part dans une conversation, il doit s'ouvrir dans un
  /// navigateur, sur la fiche publique du défi. En production, l'imposer :
  /// `flutter build apk --dart-define=SITE_BASE_URL=https://quiperd.com`. Sans cela on vise
  /// le poste de développement, où le frontend écoute sur le port 3000.
  static String get siteBaseUrl {
    if (_siteImpose.isNotEmpty) return _siteImpose.replaceFirst(RegExp(r'/+$'), '');
    if (Platform.isAndroid) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  /// Lien de partage d'un défi.
  static String lienDefi(String defiId) => '$siteBaseUrl/defis/$defiId';

  /// Vrai quand l'API est jointe en clair : sert uniquement à afficher un repère
  /// discret en développement, jamais à changer un comportement métier.
  static bool get enDeveloppement => apiBaseUrl.startsWith('http://');
}
