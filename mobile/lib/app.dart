import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'ecrans/authentification/confirmation_email.ecran.dart';
import 'ecrans/authentification/connexion.ecran.dart';
import 'ecrans/coquille.ecran.dart';
import 'ecrans/defis/detail_defi.ecran.dart';
import 'ecrans/demarrage/onboarding.ecran.dart';
import 'ecrans/demarrage/splash.ecran.dart';
import 'etats/catalogue.etat.dart';
import 'etats/notifications.etat.dart';
import 'etats/portefeuille.etat.dart';
import 'etats/session.etat.dart';
import 'noyau/liens_profonds.dart';
import 'temps_reel/client_temps_reel.dart';
import 'theme/theme.dart';

/// Clé du navigateur racine : sert à ramener l'utilisateur à l'accueil quand la
/// session tombe (déconnexion volontaire ou 401), sans laisser derrière lui des
/// écrans du joueur précédent.
final GlobalKey<NavigatorState> cleNavigateur = GlobalKey<NavigatorState>();

class ApplicationQuiPerd extends StatelessWidget {
  const ApplicationQuiPerd({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        // Le socket est créé une seule fois pour toute l'application : c'est lui
        // qui porte les salons, la reconnexion et le battement de cœur.
        ChangeNotifierProvider(create: (_) => ClientTempsReel()),
        ChangeNotifierProxyProvider<ClientTempsReel, SessionEtat>(
          create: (context) => SessionEtat(context.read<ClientTempsReel>())..demarrer(),
          update: (_, _, session) => session!,
        ),
        ChangeNotifierProvider(create: (_) => CatalogueEtat()),
        ChangeNotifierProxyProvider<ClientTempsReel, PortefeuilleEtat>(
          create: (context) => PortefeuilleEtat(context.read<ClientTempsReel>()),
          update: (_, _, portefeuille) => portefeuille!,
        ),
        ChangeNotifierProxyProvider<ClientTempsReel, NotificationsEtat>(
          create: (context) => NotificationsEtat(context.read<ClientTempsReel>()),
          update: (_, _, notifications) => notifications!,
        ),
      ],
      child: MaterialApp(
        title: 'QUI PERD',
        debugShowCheckedModeBanner: false,
        navigatorKey: cleNavigateur,
        theme: construireTheme(),
        // Thème CLAIR uniquement : pas de `darkTheme`, pas de `ThemeMode.system`.
        themeMode: ThemeMode.light,
        home: const _Racine(),
      ),
    );
  }
}

/// Aiguillage racine.
///
/// Il n'y a pas de garde à poser écran par écran : l'arbre lui-même ne contient
/// jamais en même temps l'espace joueur et les écrans d'entrée. Un utilisateur
/// connecté ne peut donc voir « Se connecter » ou « Créer un compte » nulle part.
class _Racine extends StatefulWidget {
  const _Racine();

  @override
  State<_Racine> createState() => _RacineState();
}

class _RacineState extends State<_Racine> with WidgetsBindingObserver {
  bool _connecteAvant = false;

  final AppLinks _liens = AppLinks();
  StreamSubscription<Uri>? _ecouteLiens;

  /// Défi visé par un lien reçu alors que le joueur n'était pas encore prêt à le voir (pas
  /// connecté, ou adresse non confirmée). Il est rejoué dès que l'espace joueur s'ouvre :
  /// sans cela, cliquer sur un lien puis se connecter ferait perdre le défi en route.
  String? _defiEnAttente;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _ecouterLesLiens();
  }

  @override
  void dispose() {
    _ecouteLiens?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Écoute les liens profonds : celui qui a lancé l'application, et ceux qui arrivent
  /// pendant qu'elle tourne (elle est en `singleTop`, un nouveau lien la réveille).
  Future<void> _ecouterLesLiens() async {
    _ecouteLiens = _liens.uriLinkStream.listen(_surLien);
    final initial = await _liens.getInitialLink();
    if (initial != null) _surLien(initial);
  }

  /// Retient le défi visé et **provoque une reconstruction**.
  ///
  /// Le `setState` n'est pas cosmétique : c'est lui qui garantit qu'une frame est planifiée.
  /// Sans elle, un lien qui arrive alors que l'écran est déjà stable ne déclenche aucun
  /// rendu, et le `addPostFrameCallback` posé plus bas attendrait indéfiniment. Vécu :
  /// l'application s'ouvrait bien, mais sur le tableau de bord au lieu du défi.
  void _surLien(Uri uri) {
    final defiId = defiIdDepuis(uri);
    if (defiId == null) return; // lien qui ne nous concerne pas : on ne fait rien.
    if (!mounted) return;
    setState(() => _defiEnAttente = defiId);
  }

  /// Programme l'ouverture de la fiche du défi si — et seulement si — l'espace joueur est
  /// réellement ouvert. Tant que l'adresse n'est pas confirmée, l'aiguillage montre l'écran de
  /// code : y empiler un défi par-dessus contournerait le blocage.
  ///
  /// Appelée DEPUIS `build`, donc une frame est en cours : le `addPostFrameCallback` se
  /// déclenchera. Il est aussi posé APRÈS celui qui dépile les écrans d'entrée
  /// (`popUntil`) — l'ordre compte, sinon la fiche poussée serait dépilée aussitôt.
  void _programmerOuvertureDuDefi() {
    final defiId = _defiEnAttente;
    if (defiId == null) return;

    _defiEnAttente = null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      cleNavigateur.currentState?.push(
        MaterialPageRoute(builder: (_) => DetailDefiEcran(defiId: defiId)),
      );
    });
  }

  /// Cycle de vie : le socket se ferme proprement en arrière-plan et se rouvre —
  /// **avec un nouveau ticket** — au retour au premier plan. Sans cela, Android
  /// garde une connexion morte et le joueur croit être en direct.
  @override
  void didChangeAppLifecycleState(AppLifecycleState etat) {
    final session = context.read<SessionEtat>();
    if (!session.connecte) return;
    final direct = context.read<ClientTempsReel>();
    switch (etat) {
      case AppLifecycleState.resumed:
        direct.reprendre();
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
        direct.deconnecter();
      case AppLifecycleState.inactive:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionEtat>();

    // La session vient de tomber : on vide la pile de navigation et l'état local.
    if (_connecteAvant && !session.connecte) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        cleNavigateur.currentState?.popUntil((route) => route.isFirst);
        if (!mounted) return;
        context.read<PortefeuilleEtat>().reinitialiser();
        context.read<NotificationsEtat>().reinitialiser();
        final message = context.read<SessionEtat>().consommerMessageDeconnexion();
        if (message != null && mounted) {
          ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(message)));
        }
      });
    }

    // La session vient de s'ouvrir. `home` est déjà devenu l'espace joueur, mais
    // l'écran de connexion (ou d'inscription) a été POUSSÉ par l'onboarding : sans
    // ce dépilement, il resterait au-dessus et le joueur croirait sa connexion
    // refusée alors que le serveur l'a acceptée.
    if (!_connecteAvant && session.connecte) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        cleNavigateur.currentState?.popUntil((route) => route.isFirst);
      });
    }
    _connecteAvant = session.connecte;

    if (!session.pret) return const SplashEcran();
    // Adresse non confirmée : l'espace joueur est FERMÉ, le tableau de bord compris — même
    // règle que sur le web, où le gabarit `/joueur` renvoie sur la saisie du code. L'écran de
    // confirmation devient la racine et non un écran poussé : il n'y a donc rien à quitter, ni
    // par le bouton retour du téléphone, ni par un geste. Le joueur qui vient de s'inscrire y
    // arrive directement. Dès que `rafraichirUtilisateur()` remonte `emailVerifie`, cet
    // aiguillage bascule tout seul sur la coquille.
    if (session.connecte && session.emailNonConfirme) {
      return const ConfirmationEmailEcran(bloquant: true);
    }
    if (session.connecte) {
      // L'espace joueur est ouvert : c'est l'instant où un lien reçu trop tôt (application
      // fermée, joueur pas encore connecté, adresse à confirmer) peut enfin être honoré.
      // L'appel est sans effet s'il n'y a rien en attente.
      _programmerOuvertureDuDefi();
      return CoquilleEcran(key: cleCoquille);
    }
    if (!session.onboardingVu) return const OnboardingEcran();
    return const ConnexionEcran();
  }
}
