import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../composants/communs/confirmation.dart';
import '../composants/communs/indicateur_direct.dart';
import '../composants/communs/logo.dart';
import '../composants/communs/message.dart';
import '../composants/joueur/bandeau_email_non_confirme.dart';
import '../etats/catalogue.etat.dart';
import '../etats/notifications.etat.dart';
import '../etats/portefeuille.etat.dart';
import '../etats/session.etat.dart';
import '../modeles/notification_joueur.modele.dart';
import '../noyau/format.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';
import 'aide.ecran.dart';
import 'authentification/confirmation_email.ecran.dart';
import 'classement.ecran.dart';
import 'defis/defis.ecran.dart';
import 'litiges.ecran.dart';
import 'matchs/matchs.ecran.dart';
import 'notifications.ecran.dart';
import 'portefeuille.ecran.dart';
import 'profil.ecran.dart';
import 'tableau_de_bord.ecran.dart';

/// Clé de la coquille : elle reste joignable depuis un écran EMPILÉ, ce que
/// `findAncestorStateOfType` ne permet pas (une route poussée n'est pas un
/// descendant de la coquille, mais un frère dans le même navigateur).
final GlobalKey<CoquilleEcranState> cleCoquille = GlobalKey<CoquilleEcranState>();

/// Coquille de l'espace joueur : barre du haut, cinq onglets en bas, tiroir
/// latéral pour les écrans secondaires.
///
/// Les cinq entrées sont **exactement** celles de la barre basse du web :
/// Accueil · Défis · Matchs · Argent · Profil.
class CoquilleEcran extends StatefulWidget {
  const CoquilleEcran({super.key});

  @override
  State<CoquilleEcran> createState() => CoquilleEcranState();

  /// Permet à un écran enfant de changer d'onglet (« Tous mes matchs »,
  /// « Déposer ») sans empiler une seconde copie de l'écran.
  static CoquilleEcranState? de(BuildContext context) =>
      context.findAncestorStateOfType<CoquilleEcranState>() ?? cleCoquille.currentState;
}

class CoquilleEcranState extends State<CoquilleEcran> {
  static const List<({String court, String complet, IconData icone})> _onglets = [
    (court: 'Accueil', complet: 'Tableau de bord', icone: Icons.home_outlined),
    (court: 'Défis', complet: 'Défis', icone: Icons.local_fire_department_outlined),
    (court: 'Matchs', complet: 'Mes matchs', icone: Icons.sports_esports_outlined),
    (court: 'Argent', complet: 'Portefeuille', icone: Icons.account_balance_wallet_outlined),
    (court: 'Profil', complet: 'Profil', icone: Icons.person_outline),
  ];

  int _index = 0;

  /// Vrai tant que l'écran des notifications est ouvert : la ligne qui apparaît
  /// y suffit, un message flottant ferait doublon.
  bool _surEcranNotifications = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _chargerLEssentiel());
  }

  void _chargerLEssentiel() {
    if (!mounted) return;
    context.read<CatalogueEtat>().charger();
    context.read<PortefeuilleEtat>().charger();
    final notifications = context.read<NotificationsEtat>()..charger();

    // Une notification qui arrive pendant que le joueur est ailleurs mérite un
    // message ; sur l'écran des notifications, la ligne qui apparaît suffit.
    notifications.surNouvelle = (NotificationJoueur n) {
      if (!mounted || _surEcranNotifications) return;
      Message.info(context, n.titre, n.message);
    };
  }

  void allerA(int index) {
    if (index == _index) return;
    setState(() => _index = index);
  }

  void ouvrir(Widget ecran) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ecran));
  }

  Future<void> ouvrirNotifications() async {
    _surEcranNotifications = true;
    await Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const NotificationsEcran()));
    _surEcranNotifications = false;
  }

  Future<void> ouvrirConfirmationEmail() async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const ConfirmationEmailEcran()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionEtat>();
    final utilisateur = session.utilisateur;
    if (utilisateur == null) return const SizedBox.shrink();

    final nonLues = context.watch<NotificationsEtat>().nonLues;

    return Scaffold(
      backgroundColor: Couleurs.craie,
      drawer: const _Tiroir(),
      appBar: AppBar(
        titleSpacing: 16,
        title: const Logo(taille: 26),
        actions: [
          IconButton(
            tooltip: 'Notifications ($nonLues non lues)',
            onPressed: ouvrirNotifications,
            icon: Badge(
              isLabelVisible: nonLues > 0,
              backgroundColor: Couleurs.perte,
              label: Text('$nonLues'),
              child: const Icon(Icons.notifications_none),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: _MenuCompte(pseudo: utilisateur.nomUtilisateur, email: utilisateur.email),
          ),
        ],
      ),
      body: Column(
        children: [
          if (session.emailNonConfirme)
            BandeauEmailNonConfirme(
              email: utilisateur.email,
              onConfirmer: ouvrirConfirmationEmail,
            ),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: const [
                TableauDeBordEcran(),
                DefisEcran(),
                MatchsEcran(),
                PortefeuilleEcran(),
                ProfilEcran(),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: Couleurs.encre,
          indicatorColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          labelTextStyle: WidgetStateProperty.resolveWith(
            (etats) => Typo.etiquette.copyWith(
              fontSize: 10,
              color: etats.contains(WidgetState.selected)
                  ? Couleurs.volt
                  : Couleurs.craie.withValues(alpha: 0.6),
            ),
          ),
          iconTheme: WidgetStateProperty.resolveWith(
            (etats) => IconThemeData(
              size: 22,
              color: etats.contains(WidgetState.selected)
                  ? Couleurs.volt
                  : Couleurs.craie.withValues(alpha: 0.6),
            ),
          ),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          height: 66,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: _onglets
              .map((o) => NavigationDestination(
                    icon: Icon(o.icone),
                    label: o.court,
                    tooltip: o.complet,
                  ))
              .toList(),
        ),
      ),
    );
  }
}

/// Menu du compte : pseudo, e-mail, profil, déconnexion.
class _MenuCompte extends StatelessWidget {
  const _MenuCompte({required this.pseudo, required this.email});

  final String pseudo;
  final String email;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      tooltip: 'Mon compte',
      offset: const Offset(0, 48),
      color: Couleurs.papier,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(pseudo, style: Typo.legendeForte),
              Text(email, style: Typo.petit, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: 'profil',
          child: Row(children: [
            Icon(Icons.person_outline, size: 18, color: Couleurs.muet),
            SizedBox(width: 10),
            Text('Mon profil'),
          ]),
        ),
        const PopupMenuItem<String>(
          value: 'deconnexion',
          child: Row(children: [
            Icon(Icons.logout, size: 18, color: Couleurs.perte),
            SizedBox(width: 10),
            Text('Déconnexion', style: TextStyle(color: Couleurs.perte)),
          ]),
        ),
      ],
      onSelected: (valeur) async {
        if (valeur == 'profil') {
          CoquilleEcran.de(context)?.allerA(4);
          return;
        }
        final ok = await confirmer(
          context,
          titre: 'Se déconnecter ?',
          message: 'Vos défis en cours et votre solde restent intacts. '
              'Vous devrez vous reconnecter pour y accéder.',
          libelleConfirmer: 'Se déconnecter',
          libelleAnnuler: 'Rester connecté',
          destructif: true,
          icone: Icons.logout,
        );
        if (!ok || !context.mounted) return;
        await context.read<SessionEtat>().deconnexion();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: const BoxDecoration(color: Couleurs.vert, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text(
                monogramme(pseudo),
                style: Typo.chiffres(taille: 11, poids: 700, couleur: Couleurs.craie),
              ),
            ),
            const Icon(Icons.expand_more, size: 18, color: Couleurs.muet),
          ],
        ),
      ),
    );
  }
}

/// Tiroir : écrans secondaires et pages légales.
class _Tiroir extends StatelessWidget {
  const _Tiroir();

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionEtat>();
    final portefeuille = context.watch<PortefeuilleEtat>().portefeuille;
    final nonLues = context.watch<NotificationsEtat>().nonLues;
    final coquille = CoquilleEcran.de(context);

    return Drawer(
      backgroundColor: Couleurs.craie,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              color: Couleurs.encre,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Logo(clair: true, taille: 26),
                  const SizedBox(height: 20),
                  Text('SOLDE DISPONIBLE',
                      style: Typo.etiquette.copyWith(
                          color: Couleurs.craie.withValues(alpha: 0.6), fontSize: 10)),
                  const SizedBox(height: 4),
                  Text(
                    formatMontant(portefeuille.soldeDisponible, portefeuille.devise),
                    style: Typo.chiffres(taille: 22, poids: 700, couleur: Couleurs.volt),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Bloqué : ${formatMontant(portefeuille.soldeBloque, portefeuille.devise)}',
                    style: Typo.petit.copyWith(color: Couleurs.craie.withValues(alpha: 0.6)),
                  ),
                  const SizedBox(height: 14),
                  const IndicateurDirect(clair: true),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  _Entree(
                    icone: Icons.gavel_outlined,
                    libelle: 'Litiges',
                    onTap: () {
                      Navigator.of(context).pop();
                      coquille?.ouvrir(const LitigesEcran());
                    },
                  ),
                  _Entree(
                    icone: Icons.notifications_none,
                    libelle: 'Notifications',
                    badge: nonLues,
                    onTap: () {
                      Navigator.of(context).pop();
                      coquille?.ouvrirNotifications();
                    },
                  ),
                  _Entree(
                    icone: Icons.leaderboard_outlined,
                    libelle: 'Classement',
                    onTap: () {
                      Navigator.of(context).pop();
                      coquille?.ouvrir(const ClassementEcran());
                    },
                  ),
                  _Entree(
                    icone: Icons.help_outline,
                    libelle: 'Aide & contact',
                    onTap: () {
                      Navigator.of(context).pop();
                      coquille?.ouvrir(const AideEcran());
                    },
                  ),
                  if (session.emailNonConfirme)
                    _Entree(
                      icone: Icons.mark_email_unread_outlined,
                      libelle: 'Confirmer mon e-mail',
                      accent: Couleurs.alerte,
                      onTap: () {
                        Navigator.of(context).pop();
                        coquille?.ouvrirConfirmationEmail();
                      },
                    ),
                  const Divider(height: 24),
                  _Entree(
                    icone: Icons.logout,
                    libelle: 'Déconnexion',
                    accent: Couleurs.perte,
                    onTap: () async {
                      Navigator.of(context).pop();
                      final ok = await confirmer(
                        context,
                        titre: 'Se déconnecter ?',
                        message: 'Vos défis en cours et votre solde restent intacts.',
                        libelleConfirmer: 'Se déconnecter',
                        libelleAnnuler: 'Rester connecté',
                        destructif: true,
                        icone: Icons.logout,
                      );
                      if (!ok || !context.mounted) return;
                      await context.read<SessionEtat>().deconnexion();
                    },
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Text(
                'QUI PERD — celui qui perd le match perd sa mise.',
                style: Typo.petit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Entree extends StatelessWidget {
  const _Entree({
    required this.icone,
    required this.libelle,
    required this.onTap,
    this.badge = 0,
    this.accent,
  });

  final IconData icone;
  final String libelle;
  final VoidCallback onTap;
  final int badge;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 52,
      leading: Icon(icone, size: 20, color: accent ?? Couleurs.muet),
      title: Text(libelle, style: Typo.corps.copyWith(color: accent ?? Couleurs.encre)),
      trailing: badge > 0
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Couleurs.vert,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('$badge',
                  style: Typo.chiffres(taille: 11, poids: 700, couleur: Couleurs.craie)),
            )
          : null,
      onTap: onTap,
    );
  }
}
