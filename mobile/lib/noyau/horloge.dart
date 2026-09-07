import 'dart:async';

import 'package:flutter/foundation.dart';

/// Horloge partagée : **une seule** minuterie pour toute l'application.
///
/// Chaque compte à rebours avait la sienne. Sur une liste de vingt défis, cela
/// faisait vingt `Timer.periodic` et vingt `setState` par seconde, donc vingt
/// reconstructions de sous-arbres par seconde là où une seule suffit — c'est ce
/// qui rend une liste poisseuse au défilement sur un téléphone modeste.
///
/// Ici, une minuterie unique démarre au premier auditeur et s'arrête au dernier :
/// un écran sans compte à rebours ne fait rien tourner du tout.
class Horloge extends ChangeNotifier {
  Horloge._();

  /// Instance unique — les comptes à rebours s'y abonnent, rien d'autre.
  static final Horloge instance = Horloge._();

  Timer? _minuterie;

  /// Instant de la dernière battue, en UTC.
  DateTime maintenant = DateTime.now().toUtc();

  @override
  void addListener(VoidCallback listener) {
    super.addListener(listener);
    _minuterie ??= Timer.periodic(const Duration(seconds: 1), (_) {
      maintenant = DateTime.now().toUtc();
      notifyListeners();
    });
  }

  @override
  void removeListener(VoidCallback listener) {
    super.removeListener(listener);
    if (!hasListeners) {
      _minuterie?.cancel();
      _minuterie = null;
    }
  }
}
