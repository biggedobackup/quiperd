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

  /// Vrai quand l'API est jointe en clair : sert uniquement à afficher un repère
  /// discret en développement, jamais à changer un comportement métier.
  static bool get enDeveloppement => apiBaseUrl.startsWith('http://');
}
