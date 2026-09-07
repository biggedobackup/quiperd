import 'dart:async';

import 'package:flutter/foundation.dart';

import '../modeles/notification_joueur.modele.dart';
import '../noyau/resultat.dart';
import '../services/notifications.service.dart';
import '../temps_reel/client_temps_reel.dart';
import '../temps_reel/evenements.dart';

/// Notifications du joueur — poussées par le salon privé, jamais réinterrogées
/// en boucle.
///
/// L'état est partagé : la cloche de la barre du haut, le tiroir et l'écran des
/// notifications lisent tous cette même liste, et se mettent donc à jour
/// ensemble quand une notification arrive.
class NotificationsEtat extends ChangeNotifier {
  NotificationsEtat(this._direct) {
    _ecoute = _direct.sur(Evenements.notificationNouvelle).listen(_ajouter);
    _direct.addListener(_surEtatDirect);
  }

  final ClientTempsReel _direct;
  StreamSubscription<EvenementRecu>? _ecoute;
  int _derniereResynchro = 0;

  List<NotificationJoueur> _liste = const [];
  final Set<String> _recentes = {};
  bool _chargement = false;
  bool _chargee = false;

  List<NotificationJoueur> get liste => _liste;
  Set<String> get recentes => _recentes;
  bool get chargement => _chargement;
  int get nonLues => _liste.where((n) => !n.lu).length;

  /// Prévient l'application qu'une notification vient d'arriver, pour l'annoncer
  /// hors de l'écran des notifications (le joueur qui les regarde voit déjà la
  /// ligne apparaître : inutile de l'alerter deux fois).
  void Function(NotificationJoueur)? surNouvelle;

  Future<void> charger({bool force = false}) async {
    if (_chargement || (_chargee && !force)) return;
    _chargement = true;
    notifyListeners();
    final r = await NotificationsService.lister();
    if (r is Succes<List<NotificationJoueur>>) {
      _liste = r.donnees;
      _chargee = true;
    }
    _chargement = false;
    notifyListeners();
  }

  Future<void> marquerLue(String id) async {
    final index = _liste.indexWhere((n) => n.id == id);
    if (index < 0 || _liste[index].lu) return;
    // Optimiste : la pastille s'éteint tout de suite. En cas d'échec on remet
    // la ligne en non-lue, sans quoi le compteur mentirait.
    final avant = _liste;
    _liste = [..._liste]..[index] = _liste[index].copieAvec(lu: true);
    notifyListeners();

    final r = await NotificationsService.marquerLue(id);
    if (r is Echec<void>) {
      _liste = avant;
      notifyListeners();
    }
  }

  Future<void> toutMarquerLu() async {
    for (final n in _liste.where((n) => !n.lu).toList()) {
      await marquerLue(n.id);
    }
  }

  void _ajouter(EvenementRecu e) {
    final notification = NotificationJoueur.depuisJson(e.charge);
    if (notification.id.isEmpty) return;
    if (_liste.any((n) => n.id == notification.id)) return;
    _liste = [notification, ..._liste];
    _recentes.add(notification.id);
    notifyListeners();
    surNouvelle?.call(notification);
  }

  void _surEtatDirect() {
    if (!_direct.enDirect) return;
    if (_direct.reconnexions == _derniereResynchro) return;
    _derniereResynchro = _direct.reconnexions;
    if (!_chargee) return;
    charger(force: true);
  }

  void reinitialiser() {
    _liste = const [];
    _recentes.clear();
    _chargee = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _ecoute?.cancel();
    _direct.removeListener(_surEtatDirect);
    super.dispose();
  }
}
