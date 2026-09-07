import 'dart:io';

import 'package:flutter/foundation.dart';

/// Politique réseau de l'application — un seul endroit pour tout le trafic.
///
/// Les serveurs internes (poste de développement, machine de recette, API
/// derrière un reverse proxy maison) répondent soit en HTTP en clair, soit en
/// HTTPS avec un certificat auto-signé ou signé par une autorité que le magasin
/// du téléphone ne connaît pas. Sans le remplacement ci-dessous, `dart:io`
/// coupe la poignée de main TLS (`HandshakeException: CERTIFICATE_VERIFY_FAILED`)
/// et l'application se comporte exactement comme si elle était hors ligne : le
/// joueur voit « connexion impossible » alors que le serveur, lui, répond très
/// bien.
///
/// [ReseauPermissif] installe donc un [HttpClient] qui **accepte tous les
/// certificats**. Cela couvre tout ce qui passe par `dart:io`, c'est-à-dire la
/// totalité du réseau de l'application :
///
/// * les appels REST du `ClientApi` (`package:http` crée un `IOClient`, donc un
///   `HttpClient`) ;
/// * le socket temps réel — `WebSocketChannel.connect` s'appuie sur
///   `WebSocket.connect`, qui construit son `HttpClient` via ces overrides ;
/// * les images distantes (`Image.network`) et les preuves téléchargées.
///
/// ⚠️ Contrepartie assumée : vérifier le certificat est précisément ce qui
/// empêche un intermédiaire sur le réseau de lire le jeton de session et les
/// montants. Le garde-fou est un interrupteur unique à la compilation :
///
/// ```
/// flutter build apk --release --dart-define=RESEAU_PERMISSIF=false
/// ```
///
/// rétablit la vérification stricte pour une version destinée aux joueurs.
class ReseauPermissif extends HttpOverrides {
  /// Actif par défaut : l'application est aujourd'hui utilisée contre des
  /// serveurs internes. Passer `--dart-define=RESEAU_PERMISSIF=false` à la
  /// compilation revient au comportement standard de Dart.
  static const bool actif = bool.fromEnvironment('RESEAU_PERMISSIF', defaultValue: true);

  /// À appeler tout en haut de `main()`, avant la moindre requête : le
  /// `HttpClient` partagé par `WebSocket.connect` est construit une seule fois,
  /// à la première connexion, et garde les overrides en vigueur à cet
  /// instant-là.
  static void installer() {
    if (!actif) return;
    HttpOverrides.global = ReseauPermissif();
    debugPrint('[reseau] mode permissif : certificats TLS acceptés sans vérification');
  }

  @override
  HttpClient createHttpClient(SecurityContext? context) => super.createHttpClient(context)
    ..badCertificateCallback = (_, _, _) => true;
}
