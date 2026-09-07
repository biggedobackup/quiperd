import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../composants/communs/confirmation.dart';
import '../composants/communs/indicateur_direct.dart';
import '../composants/communs/logo.dart';
import '../composants/communs/message.dart';
import '../composants/communs/pile_paresseuse.dart';
import '../etats/catalogue.etat.dart';
import '../etats/notifications.etat.dart';
import '../etats/portefeuille.etat.dart';
import '../etats/session.etat.dart';
import '../modeles/notification_joueur.modele.dart';
import '../noyau/format.dart';
import '../services/utilisateurs.service.dart';
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

  /// Les cinq écrans de la barre basse, dans l'ordre des onglets.
  static const List<Widget> _ecrans = [
    TableauDeBordEcran(),
    DefisEcran(),
    MatchsEcran(),
    PortefeuilleEcran(),
    ProfilEcran(),
  ];

  /// Onglet affiché, lu par le tiroir pour marquer l'entrée en cours.
  int get ongletActif => _index;

  /// Les cinq entrées de la barre basse, reprises telles quelles par le tiroir.
  static List<({String court, String complet, IconData icone})> get onglets => _onglets;

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
      drawer: _Tiroir(ongletActif: _index),
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
            child: _MenuCompte(
              pseudo: utilisateur.nomUtilisateur,
              email: utilisateur.email,
              utilisateurId: utilisateur.id,
              photoProfil: utilisateur.photoProfil,
            ),
          ),
        ],
      ),
      // Onglets construits à la demande : un onglet jamais ouvert n'a rien à charger. Avant,
      // les cinq écrans lançaient leurs appels au démarrage — 19 requêtes mesurées avant le
      // premier écran utile, sur un réseau mobile où chacune coûte un aller-retour.
      //
      // Aucun bandeau « adresse non confirmée » au-dessus : l'aiguillage racine ne construit
      // cette coquille QUE lorsque l'adresse est confirmée, un tel bandeau ne pourrait donc
      // plus jamais s'afficher. Il reste là où il garde un sens — création de défi et
      // portefeuille — pour le cas où le serveur refuse en 403 une session qui se croyait à jour.
      body: PileParesseuse(index: _index, enfants: _ecrans),
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
          onDestinationSelected: allerA,
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
  const _MenuCompte({
    required this.pseudo,
    required this.email,
    required this.utilisateurId,
    required this.photoProfil,
  });

  final String pseudo;
  final String email;
  final String utilisateurId;
  final String photoProfil;

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
            // Photo du joueur si elle existe, monogramme sinon : la pastille garde la
            // même taille dans les deux cas, la barre du haut ne saute pas au chargement.
            ClipOval(
              child: SizedBox(
                width: 32,
                height: 32,
                child: photoProfil.isEmpty
                    ? _Monogramme(pseudo: pseudo)
                    : Image.network(
                        UtilisateursService.urlPhoto(utilisateurId),
                        key: ValueKey(photoProfil),
                        headers: UtilisateursService.entetesPhoto,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => _Monogramme(pseudo: pseudo),
                      ),
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
  const _Tiroir({required this.ongletActif});

  /// Reçu en paramètre, pas lu depuis la coquille : un `const _Tiroir()` ne se reconstruirait
  /// pas au changement d'onglet et marquerait la mauvaise entrée.
  final int ongletActif;

  @override
  Widget build(BuildContext context) {
    // (plus de `session` ici : la seule entrée qui en dépendait, « Confirmer mon e-mail »,
    // a disparu — le tiroir n'existe que dans une coquille dont l'adresse est confirmée.)
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
                  // Le tiroir liste TOUT, y compris les cinq onglets de la barre basse. Il ne
                  // faut pas avoir à refermer le tiroir pour aller au portefeuille : celui qui
                  // ouvre le menu cherche une destination, pas la moitié des destinations.
                  // La source est `_onglets`, la même liste que la barre basse — impossible que
                  // les deux divergent, et l'entrée en cours est marquée en vert.
                  for (final (i, o) in CoquilleEcranState.onglets.indexed)
                    _Entree(
                      icone: o.icone,
                      libelle: o.complet,
                      actif: ongletActif == i,
                      onTap: () {
                        Navigator.of(context).pop();
                        coquille?.allerA(i);
                      },
                    ),
                  const Divider(height: 24),
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
                  // Pas d'entrée « Confirmer mon e-mail » : ce tiroir n'existe que dans la
                  // coquille, et la coquille n'est construite qu'une fois l'adresse confirmée.
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
                'Défis en Ligne — celui qui perd le match perd sa mise.',
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
    this.actif = false,
  });

  final IconData icone;
  final String libelle;
  final VoidCallback onTap;
  final int badge;
  final Color? accent;

  /// Onglet en cours : le tiroir reprend les cinq entrées de la barre basse, il doit donc
  /// dire où l'on se trouve — sinon on ne sait plus lequel on vient d'ouvrir.
  final bool actif;

  @override
  Widget build(BuildContext context) {
    final couleur = accent ?? (actif ? Couleurs.vert : Couleurs.encre);
    return ListTile(
      minTileHeight: 52,
      selected: actif,
      selectedTileColor: Couleurs.vertPale,
      leading: Icon(icone, size: 20, color: accent ?? (actif ? Couleurs.vert : Couleurs.muet)),
      title: Text(
        libelle,
        style: Typo.corps.copyWith(
          color: couleur,
          fontWeight: actif ? FontWeight.w700 : null,
        ),
      ),
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

/// Pastille de repli quand le joueur n'a pas de photo (ou qu'elle ne charge pas).
class _Monogramme extends StatelessWidget {
  const _Monogramme({required this.pseudo});

  final String pseudo;

  @override
  Widget build(BuildContext context) => Container(
        color: Couleurs.vert,
        alignment: Alignment.center,
        child: Text(
          monogramme(pseudo),
          style: Typo.chiffres(taille: 11, poids: 700, couleur: Couleurs.craie),
        ),
      );
}
