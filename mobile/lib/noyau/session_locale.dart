import 'package:shared_preferences/shared_preferences.dart';

/// Petite couche au-dessus de `shared_preferences` : jeton de session et
/// préférences d'affichage.
///
/// Rien de sensible au-delà du jeton n'y est écrit, et la déconnexion efface
/// tout ce qui identifie le joueur : un téléphone prêté ne doit jamais montrer
/// les données du précédent.
class SessionLocale {
  const SessionLocale._();

  static const _cleJeton = 'defisenligne.jeton';
  static const _cleExpiration = 'defisenligne.expiration';
  static const _cleOnboarding = 'defisenligne.onboarding_vu';

  static SharedPreferences? _prefs;

  static Future<SharedPreferences> get _instance async =>
      _prefs ??= await SharedPreferences.getInstance();

  static Future<void> initialiser() async {
    _prefs = await SharedPreferences.getInstance();
  }

  static Future<String?> lireJeton() async {
    final prefs = await _instance;
    final jeton = prefs.getString(_cleJeton);
    if (jeton == null || jeton.isEmpty) return null;

    // Un jeton dont on sait déjà qu'il est périmé ne vaut pas un aller-retour
    // réseau au démarrage : on l'efface tout de suite.
    final expiration = prefs.getString(_cleExpiration);
    if (expiration != null) {
      final date = DateTime.tryParse(expiration);
      if (date != null && date.isBefore(DateTime.now())) {
        await effacerSession();
        return null;
      }
    }
    return jeton;
  }

  static Future<void> ecrireJeton(String jeton, {String? expiration}) async {
    final prefs = await _instance;
    await prefs.setString(_cleJeton, jeton);
    if (expiration != null && expiration.isNotEmpty) {
      await prefs.setString(_cleExpiration, expiration);
    } else {
      await prefs.remove(_cleExpiration);
    }
  }

  static Future<void> effacerSession() async {
    final prefs = await _instance;
    await prefs.remove(_cleJeton);
    await prefs.remove(_cleExpiration);
  }

  static Future<bool> onboardingVu() async => (await _instance).getBool(_cleOnboarding) ?? false;

  static Future<void> marquerOnboardingVu() async {
    await (await _instance).setBool(_cleOnboarding, true);
  }
}
