import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../app.dart';
import '../ecrans/coquille.ecran.dart';
import '../ecrans/defis/detail_defi.ecran.dart';
import 'notifications.service.dart';

/// Notifications push (Firebase Cloud Messaging).
///
/// **Le push ne remplace pas le socket, il le prolonge.** Tant que l'application est ouverte,
/// c'est le temps réel qui fait le travail : le solde bouge, un défi entre dans la liste, un
/// match change d'état — sans rien redemander au serveur. Mais un socket meurt avec le premier
/// plan : dès que le joueur range son téléphone, plus rien ne peut l'atteindre. C'est là que
/// FCM prend le relais, et seulement là.
///
/// Trois situations, trois chemins différents, et il faut les traiter tous les trois :
///
/// 1. **Application fermée ou en arrière-plan** — Android affiche lui-même la bannière à partir
///    du bloc `notification` du message. Aucun code Dart ne tourne. C'est le manifeste qui
///    décide du canal, de l'icône et de la teinte.
/// 2. **Application au premier plan** — Android n'affiche RIEN de son propre chef. C'est
///    `onMessage` qui reçoit le message, et `flutter_local_notifications` qui dessine la
///    bannière.
/// 3. **Le joueur appuie sur la bannière** — `getInitialMessage()` si l'application était morte,
///    `onMessageOpenedApp` si elle dormait. Les deux mènent au même aiguillage.
class Push {
  const Push._();

  static const String _canalId = 'defis_en_ligne_defaut';

  /// Abonnement qui reçoit « un nouveau défi vient d'être ouvert ».
  ///
  /// Une annonce publique ne s'envoie pas jeton par jeton : le serveur écrirait autant de
  /// messages que de joueurs inscrits, pour un événement qui n'est adressé à personne en
  /// particulier. FCM diffuse à un topic en un seul appel, et se charge de la distribution.
  static const String _topicDefisOuverts = 'defis-ouverts';

  /// Topic propre au joueur. Il ne sert pas à lui parler — son jeton d'appareil suffit — mais à
  /// l'EXCLURE d'une diffusion : recevoir l'annonce du défi qu'on vient soi-même de créer
  /// donnerait l'impression que l'application est cassée.
  static String _topicUtilisateur(String id) => 'utilisateur-$id';

  static String? _utilisateurAbonne;

  static final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();

  static bool _demarre = false;
  static StreamSubscription<String>? _ecouteJeton;
  static final List<StreamSubscription<RemoteMessage>> _ecoutes = [];

  /// Le canal doit porter le MÊME identifiant que celui déclaré dans le manifeste et que celui
  /// envoyé par le serveur (`backend/utils/fcm.go`). S'ils divergent, Android crée
  /// silencieusement un second canal, sans son ni vibration, et les notifications tombent sans
  /// que personne ne s'en aperçoive.
  static const AndroidNotificationChannel _canal = AndroidNotificationChannel(
    _canalId,
    'Défis et matchs',
    description: 'Défi rejoint, résultat déclaré, litige, paiement.',
    importance: Importance.high,
  );

  // ── Démarrage ────────────────────────────────────────────────────────────────

  /// Prépare Firebase et les écoutes. Appelée une seule fois, avant `runApp`.
  ///
  /// N'enregistre AUCUN jeton : à ce stade on ne sait pas encore qui est connecté. C'est
  /// [activer] qui s'en charge, une fois la session ouverte.
  ///
  /// Ne lève jamais : un téléphone sans Google Play Services (ou un `google-services.json`
  /// absent) doit dégrader vers une application qui marche sans push, pas vers un écran noir.
  static Future<void> initialiser() async {
    if (_demarre) return;
    try {
      await Firebase.initializeApp();

      await _local.initialize(
        const InitializationSettings(
          // Icône par défaut des bannières dessinées au premier plan : la silhouette blanche,
          // pas le logo couleur — Android ne garde que l'alpha dans la barre d'état.
          android: AndroidInitializationSettings('@drawable/ic_notification'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (reponse) => _ouvrirDepuisCharge(reponse.payload),
      );
      await _local
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_canal);

      FirebaseMessaging.onBackgroundMessage(gererMessageEnArrierePlan);
      _ecoutes.add(FirebaseMessaging.onMessage.listen(_surMessageAuPremierPlan));
      _ecoutes.add(FirebaseMessaging.onMessageOpenedApp.listen(_surAppuiSurLaBanniere));

      // Application lancée DEPUIS une bannière : le message n'est pas passé par les flux
      // ci-dessus, il attend ici. On laisse l'aiguillage racine finir de se poser avant de
      // pousser quoi que ce soit — sinon on empile un écran sur un navigateur pas encore prêt.
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _surAppuiSurLaBanniere(initial));
      }

      _demarre = true;
    } catch (e) {
      debugPrint('Push indisponible (l\'application continue sans) : $e');
    }
  }

  // ── Session ──────────────────────────────────────────────────────────────────

  /// Demande la permission, récupère le jeton de l'appareil et le confie au serveur.
  ///
  /// Appelée à l'ouverture de session (connexion, inscription, reprise d'un jeton stocké).
  /// Un refus de permission n'est pas une erreur : le joueur a le droit de ne pas vouloir de
  /// notifications, l'application marche sans.
  static Future<void> activer(String utilisateurId) async {
    if (!_demarre) return;
    try {
      final reglage = await FirebaseMessaging.instance.requestPermission();
      if (reglage.authorizationStatus == AuthorizationStatus.denied) return;

      // iOS uniquement : sans cela, une bannière reçue au premier plan reste invisible.
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      final jeton = await FirebaseMessaging.instance.getToken();
      if (jeton != null) await NotificationsService.enregistrerJetonFcm(jeton);

      // Les défis ouverts intéressent tout le monde ; le topic personnel sert de marqueur pour
      // que le serveur puisse écarter l'auteur de sa propre annonce.
      await FirebaseMessaging.instance.subscribeToTopic(_topicDefisOuverts);
      await FirebaseMessaging.instance.subscribeToTopic(_topicUtilisateur(utilisateurId));
      _utilisateurAbonne = utilisateurId;

      // Le jeton d'un appareil n'est pas éternel : Android le renouvelle après une
      // restauration, une mise à jour des services Google ou un effacement de données. Sans
      // cette écoute, le serveur continuerait d'écrire à une adresse morte.
      await _ecouteJeton?.cancel();
      _ecouteJeton = FirebaseMessaging.instance.onTokenRefresh.listen((j) {
        NotificationsService.enregistrerJetonFcm(j);
      });
    } catch (e) {
      debugPrint('Enregistrement du jeton push impossible : $e');
    }
  }

  /// À la déconnexion : on efface le jeton de l'appareil.
  ///
  /// Un téléphone prêté ne doit pas continuer de recevoir « votre défi a été rejoint » pour le
  /// compte du joueur précédent. Le serveur, lui, oublie le jeton avec la session.
  static Future<void> desactiver() async {
    await _ecouteJeton?.cancel();
    _ecouteJeton = null;
    if (!_demarre) return;
    try {
      await FirebaseMessaging.instance.unsubscribeFromTopic(_topicDefisOuverts);
      final precedent = _utilisateurAbonne;
      if (precedent != null) {
        await FirebaseMessaging.instance.unsubscribeFromTopic(_topicUtilisateur(precedent));
        _utilisateurAbonne = null;
      }
      // En dernier : effacer le jeton coupe aussi les abonnements côté serveur, et les
      // désabonnements ci-dessus échoueraient s'ils venaient après.
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      debugPrint('Effacement du jeton push impossible : $e');
    }
  }

  // ── Réception ────────────────────────────────────────────────────────────────

  static Future<void> _surMessageAuPremierPlan(RemoteMessage message) async {
    final titre = message.notification?.title ?? message.data['titre'];
    final corps = message.notification?.body ?? message.data['message'];
    if (titre == null) return;

    await _local.show(
      // L'identifiant tient sur 32 bits signés : un horodatage entier déborde.
      DateTime.now().millisecondsSinceEpoch.remainder(1 << 31),
      titre,
      corps,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _canal.id,
          _canal.name,
          channelDescription: _canal.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@drawable/ic_notification',
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      // `flutter_local_notifications` ne rend qu'une chaîne : on y remet le couple
      // type/cible que FCM transportait, séparés par une barre.
      payload: '${message.data['type'] ?? ''}|${message.data['cible'] ?? ''}',
    );
  }

  static void _surAppuiSurLaBanniere(RemoteMessage message) =>
      _ouvrirDepuisCharge('${message.data['type'] ?? ''}|${message.data['cible'] ?? ''}');

  /// Aiguillage après un appui sur la bannière.
  ///
  /// Quand le message porte un identifiant exploitable — l'annonce d'un défi ouvert — on ouvre
  /// la FICHE. Sinon on se rabat sur la section concernée : quelqu'un qui appuie sur « votre
  /// défi a été rejoint » veut voir son match, pas le tableau de bord. Les notifications
  /// personnelles n'ont pas encore d'identifiant en base, d'où ce repli.
  static void _ouvrirDepuisCharge(String? charge) {
    final coquille = cleCoquille.currentState;
    if (coquille == null) return; // session fermée : l'aiguillage racine décide.

    final morceaux = (charge ?? '').split('|');
    final type = morceaux.isNotEmpty ? morceaux[0] : '';
    final cible = morceaux.length > 1 ? morceaux[1] : '';

    // Les écrans empilés (fiche de défi, détail de match) masqueraient l'onglet qu'on vient
    // de choisir : on redescend d'abord à la coquille.
    cleNavigateur.currentState?.popUntil((route) => route.isFirst);

    if (type == 'defi_cree' && cible.isNotEmpty) {
      coquille.allerA(1); // Défis, pour que le retour retombe sur la liste
      cleNavigateur.currentState?.push(
        MaterialPageRoute(builder: (_) => DetailDefiEcran(defiId: cible)),
      );
      return;
    }

    switch (type) {
      case 'defi_cree': // annonce sans identifiant exploitable : la liste suffit
      case 'defi_expire':
        coquille.allerA(1); // Défis
      case 'defi_rejoint':
      case 'match_a_valider':
      case 'match_termine':
      case 'match_score':
      case 'match_desaccord':
      case 'match_nul':
      case 'match_rejoue':
      case 'match_abandon':
      case 'litige_ouvert':
      case 'litige_resolu':
        coquille.allerA(2); // Mes matchs
      case 'paiement_confirme':
      case 'paiement_echoue':
        coquille.allerA(3); // Portefeuille
      default:
        coquille.ouvrirNotifications();
    }
  }
}

/// Réception en arrière-plan.
///
/// Tourne dans un isolat SÉPARÉ, réveillé par Android : il ne partage ni les providers, ni la
/// session, ni le socket. On n'y touche donc à rien de l'application — la bannière a déjà été
/// affichée par le système à partir du bloc `notification`. La fonction doit malgré tout exister
/// et être annotée `vm:entry-point`, sinon le compilateur AOT l'élague et FCM échoue au réveil.
@pragma('vm:entry-point')
Future<void> gererMessageEnArrierePlan(RemoteMessage message) async {
  await Firebase.initializeApp();
}
