import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/environnement.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';
import 'evenements.dart';

/// Client du socket unique de la plateforme.
///
/// Règle du projet : **le serveur pousse, le client ne redemande jamais
/// périodiquement**. Il n'y a donc ici aucun rafraîchissement cyclique de
/// données — seulement un battement de cœur applicatif (le serveur ferme après
/// 60 s sans signe de vie) et une **resynchronisation unique** à chaque
/// (re)connexion, signalée par [reconnexions].
///
/// Authentification par **ticket à usage unique** : `POST /api/temps-reel/ticket`
/// avec le Bearer, puis ouverture de `ws(s)://…/api/temps-reel?ticket=…`. Le
/// ticket est consommé à la connexion : il faut en redemander un à CHAQUE
/// reconnexion. Un ticket invalide ne ferme pas le socket — la connexion
/// bascule en « visiteur » (salons publics seulement) et il faut en redemander.
class ClientTempsReel extends ChangeNotifier {
  ClientTempsReel();

  WebSocketChannel? _canal;
  StreamSubscription<dynamic>? _ecoute;
  Timer? _battement;
  Timer? _replanification;

  final StreamController<EvenementRecu> _flux =
      StreamController<EvenementRecu>.broadcast();

  /// Salons demandés par les écrans. Ils sont redemandés tels quels après une
  /// coupure : un écran n'a pas à se réabonner lui-même.
  final Set<String> _salons = <String>{};

  EtatDirect _etat = EtatDirect.horsLigne;
  int _tentatives = 0;
  bool _ferme = false;
  int _reconnexions = 0;

  /// Vrai dès que le socket s'est ouvert une première fois. Sert à distinguer la
  /// connexion initiale — les écrans viennent de charger, il n'y a rien à
  /// rattraper — d'une reprise après coupure.
  bool _dejaConnecte = false;
  int _joueursEnLigne = 0;

  /// Flux de tous les événements reçus. Chaque écran filtre ce qui le concerne.
  Stream<EvenementRecu> get flux => _flux.stream;

  EtatDirect get etat => _etat;
  bool get enDirect => _etat == EtatDirect.connecte;

  /// Nombre de REPRISES après coupure. La toute première connexion ne compte pas :
  /// un écran l'observe pour se resynchroniser une fois quand le socket revient,
  /// et rien de plus — ce n'est pas un cycle de rafraîchissement.
  ///
  /// La distinction n'est pas cosmétique. Les écrans se construisent avant que le
  /// socket ne soit ouvert : compter la première connexion leur faisait voir une
  /// « reprise » une seconde après leur propre chargement, et l'application
  /// redemandait au démarrage le portefeuille, les notifications, les matchs et
  /// les défis qu'elle venait tout juste d'obtenir.
  int get reconnexions => _reconnexions;

  int get joueursEnLigne => _joueursEnLigne;

  /// Écoute typée : `client.sur(Evenements.matchTermine)`.
  Stream<EvenementRecu> sur(String evenement, {String? salon}) => _flux.stream.where(
        (e) => e.evenement == evenement && (salon == null || e.salon == salon),
      );

  Stream<EvenementRecu> surPlusieurs(Set<String> evenements, {String? salon}) =>
      _flux.stream.where(
        (e) => evenements.contains(e.evenement) && (salon == null || e.salon == salon),
      );

  // ── Cycle de vie ─────────────────────────────────────────────────────────────

  /// Ouvre (ou rouvre) le socket. Sans effet si une connexion est déjà en cours.
  Future<void> connecter() async {
    if (_ferme) return;
    if (_etat == EtatDirect.connexion || _etat == EtatDirect.connecte) return;
    await _ouvrir();
  }

  /// Ferme proprement : appelé quand l'application passe en arrière-plan et à la
  /// déconnexion. Les salons demandés sont conservés pour la réouverture, sauf
  /// si [oublierSalons] (déconnexion : le salon privé ne doit pas resservir).
  void deconnecter({bool oublierSalons = false}) {
    _ferme = true;
    _replanification?.cancel();
    _battement?.cancel();
    _ecoute?.cancel();
    _ecoute = null;
    _canal?.sink.close();
    _canal = null;
    if (oublierSalons) {
      _salons.clear();
      // Déconnexion du compte : la session suivante repartira d'écrans neufs, sa
      // première connexion n'aura donc rien à rattraper non plus.
      _dejaConnecte = false;
    }
    _changerEtat(EtatDirect.horsLigne);
  }

  /// Rouvre après un `deconnecter()` (retour au premier plan).
  Future<void> reprendre() async {
    if (!_ferme && _etat == EtatDirect.connecte) return;
    _ferme = false;
    _tentatives = 0;
    await _ouvrir();
  }

  Future<void> _ouvrir() async {
    _changerEtat(_tentatives == 0 ? EtatDirect.connexion : EtatDirect.reconnexion);

    // Le ticket est consommé à la connexion : on en redemande un à chaque essai.
    String? ticket;
    if (ClientApi.connecte) {
      final r = await ClientApi.post('/temps-reel/ticket');
      if (r is Succes<dynamic>) {
        final corps = r.donnees;
        if (corps is Map && corps['ticket'] is String) ticket = corps['ticket'] as String;
      }
    }

    if (_ferme) return;

    try {
      final uri = Uri.parse(
        ticket == null
            ? Environnement.wsBaseUrl
            : '${Environnement.wsBaseUrl}?ticket=${Uri.encodeQueryComponent(ticket)}',
      );
      final canal = WebSocketChannel.connect(uri);
      await canal.ready;
      if (_ferme) {
        await canal.sink.close();
        return;
      }
      _canal = canal;
      _ecoute = canal.stream.listen(
        _recevoir,
        onError: (_) => _planifierReconnexion(),
        onDone: _planifierReconnexion,
        cancelOnError: true,
      );
      _tentatives = 0;
      if (_dejaConnecte) _reconnexions++;
      _dejaConnecte = true;
      _changerEtat(EtatDirect.connecte);
      _demarrerBattement();
      if (_salons.isNotEmpty) _envoyer({'action': 'abonner', 'salons': _salons.toList()});
      notifyListeners();
    } catch (_) {
      _planifierReconnexion();
    }
  }

  /// Backoff 1 s → 30 s. Sans plafond, une panne de serveur ferait battre le
  /// téléphone en continu ; sans reprise, le joueur resterait figé sans le savoir.
  void _planifierReconnexion() {
    if (_ferme) return;
    _battement?.cancel();
    _ecoute?.cancel();
    _ecoute = null;
    _canal = null;
    _changerEtat(EtatDirect.reconnexion);

    _tentatives = (_tentatives + 1).clamp(1, 6);
    final secondes = [1, 2, 4, 8, 16, 30][_tentatives - 1];
    _replanification?.cancel();
    _replanification = Timer(Duration(seconds: secondes), () {
      if (!_ferme) _ouvrir();
    });
  }

  /// Battement de cœur applicatif : le serveur ferme après 60 s sans signe de
  /// vie. Ce n'est PAS du polling — aucune donnée n'est redemandée.
  void _demarrerBattement() {
    _battement?.cancel();
    _battement = Timer.periodic(const Duration(seconds: 25), (_) {
      _envoyer(const {'action': 'ping'});
    });
  }

  // ── Abonnements ──────────────────────────────────────────────────────────────

  void abonner(Iterable<String> salons) {
    final nouveaux = salons.where((s) => s.isNotEmpty && !_salons.contains(s)).toList();
    if (nouveaux.isEmpty) return;
    _salons.addAll(nouveaux);
    // `maxSalonsParAction` vaut 20 côté serveur : on envoie par paquets.
    for (var i = 0; i < nouveaux.length; i += 20) {
      _envoyer({
        'action': 'abonner',
        'salons': nouveaux.sublist(i, (i + 20).clamp(0, nouveaux.length)),
      });
    }
  }

  void desabonner(Iterable<String> salons) {
    final partants = salons.where(_salons.contains).toList();
    if (partants.isEmpty) return;
    _salons.removeAll(partants);
    _envoyer({'action': 'desabonner', 'salons': partants});
  }

  /// Présence sur l'écran d'un match : allume la pastille « en ligne » chez
  /// l'adversaire. Le serveur émet `present: false` de lui-même quand la
  /// dernière connexion du joueur quitte le salon.
  void declarerPresence(String salon, {required bool surLaPage}) {
    _envoyer({'action': 'presence', 'salon': salon, 'surLaPage': surLaPage});
  }

  // ── Interne ──────────────────────────────────────────────────────────────────

  void _envoyer(Map<String, dynamic> message) {
    final canal = _canal;
    if (canal == null) return;
    try {
      canal.sink.add(jsonEncode(message));
    } catch (_) {
      _planifierReconnexion();
    }
  }

  void _recevoir(dynamic brut) {
    if (brut is! String) return;
    Map<String, dynamic> json;
    try {
      final decode = jsonDecode(brut);
      if (decode is! Map) return;
      json = decode.cast<String, dynamic>();
    } catch (_) {
      return;
    }

    final evenement = EvenementRecu.depuisJson(json);

    // Ticket refusé : le socket reste ouvert mais en visiteur. On en redemande
    // un immédiatement plutôt que d'attendre la prochaine coupure.
    if (evenement.evenement == Evenements.connexionRefusee && ClientApi.connecte) {
      _planifierReconnexion();
      return;
    }
    if (evenement.evenement == Evenements.compteurEnLigne) {
      final n = evenement.charge['joueursEnLigne'];
      if (n is num) {
        _joueursEnLigne = n.toInt();
        notifyListeners();
      }
    }

    if (!_flux.isClosed) _flux.add(evenement);
  }

  void _changerEtat(EtatDirect etat) {
    if (_etat == etat) return;
    _etat = etat;
    notifyListeners();
  }

  @override
  void dispose() {
    deconnecter(oublierSalons: true);
    _flux.close();
    super.dispose();
  }
}
