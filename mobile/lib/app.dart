import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'ecrans/authentification/connexion.ecran.dart';
import 'ecrans/coquille.ecran.dart';
import 'ecrans/demarrage/onboarding.ecran.dart';
import 'ecrans/demarrage/splash.ecran.dart';
import 'etats/catalogue.etat.dart';
import 'etats/notifications.etat.dart';
import 'etats/portefeuille.etat.dart';
import 'etats/session.etat.dart';
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
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
    if (session.connecte) return CoquilleEcran(key: cleCoquille);
    if (!session.onboardingVu) return const OnboardingEcran();
    return const ConnexionEcran();
  }
}
