import 'dart:async';

import 'package:flutter/foundation.dart';

import '../modeles/conversion.dart';
import '../modeles/portefeuille.modele.dart';
import '../modeles/transaction_portefeuille.modele.dart';
import '../noyau/resultat.dart';
import '../services/portefeuille.service.dart';
import '../temps_reel/client_temps_reel.dart';
import '../temps_reel/evenements.dart';

/// Paiement dont l'écran suit l'aboutissement en direct.
class PaiementSuivi {
  const PaiementSuivi({
    required this.id,
    required this.type,
    required this.montant,
    required this.devise,
    required this.statut,
    this.url,
  });

  final String id;
  final String type;
  final String montant;
  final String devise;
  final String statut;

  /// Page hébergée du prestataire : permet de rouvrir un paiement refermé par
  /// mégarde plutôt que d'obliger le joueur à refaire un dépôt.
  final String? url;

  PaiementSuivi copieAvec({String? statut}) => PaiementSuivi(
        id: id,
        type: type,
        montant: montant,
        devise: devise,
        statut: statut ?? this.statut,
        url: url,
      );
}

/// Portefeuille du joueur — **entièrement poussé par le serveur**.
///
/// Aucun rafraîchissement périodique : trois événements du salon privé
/// suffisent (`portefeuille.maj`, `transaction.creee`, `paiement.statut`). La
/// seule relecture automatique est la resynchronisation d'après coupure.
class PortefeuilleEtat extends ChangeNotifier {
  PortefeuilleEtat(this._direct) {
    _ecoute = _direct.surPlusieurs({
      Evenements.portefeuilleMaj,
      Evenements.transactionCreee,
      Evenements.paiementStatut,
    }).listen(_traiter);
    _direct.addListener(_surEtatDirect);
  }

  final ClientTempsReel _direct;
  StreamSubscription<EvenementRecu>? _ecoute;
  int _derniereResynchro = 0;

  Portefeuille _portefeuille = Portefeuille.vide;
  List<TransactionPortefeuille> _transactions = const [];
  final List<PaiementSuivi> _suivis = [];
  final Set<String> _recentes = {};

  int _page = 1;
  bool _chargement = false;
  bool _chargementTransactions = false;

  /// Mouvements reçus alors que le joueur lit une page ancienne de l'historique.
  int _horsPage = 0;

  Portefeuille get portefeuille => _portefeuille;
  List<TransactionPortefeuille> get transactions => _transactions;
  List<PaiementSuivi> get suivis => List.unmodifiable(_suivis);
  Set<String> get recentes => _recentes;
  int get page => _page;
  bool get chargement => _chargement;
  bool get chargementTransactions => _chargementTransactions;
  int get horsPage => _horsPage;
  bool get pageSuivantePossible => _transactions.length >= PortefeuilleService.taillePage;

  /// Appelé par le fournisseur de callbacks de l'écran pour annoncer un dépôt ou
  /// un retrait (toast). Le message reste la responsabilité de l'écran.
  void Function(String evenement, Map<String, dynamic> charge)? surEvenementPaiement;

  Future<void> charger({bool avecTransactions = true}) async {
    _chargement = true;
    notifyListeners();
    final r = await PortefeuilleService.lire();
    if (r is Succes<Portefeuille>) _portefeuille = r.donnees;
    _chargement = false;
    notifyListeners();
    if (avecTransactions) await chargerTransactions(page: _page);
  }

  Future<void> chargerTransactions({int page = 1}) async {
    _chargementTransactions = true;
    if (page != _page) {
      // Changer de page repart d'un historique propre : les repères « nouveau »
      // ne valent que pour la page qu'on regardait.
      _recentes.clear();
      _horsPage = 0;
    }
    _page = page;
    notifyListeners();

    final r = await PortefeuilleService.transactions(page: page);
    if (r is Succes<List<TransactionPortefeuille>>) _transactions = r.donnees;
    _chargementTransactions = false;
    notifyListeners();
  }

  void masquerSuivi(String id) {
    _suivis.removeWhere((p) => p.id == id);
    notifyListeners();
  }

  void suivre(PaiementSuivi paiement) {
    final index = _suivis.indexWhere((p) => p.id == paiement.id);
    if (index < 0) {
      _suivis.insert(0, paiement);
      if (_suivis.length > 4) _suivis.removeLast();
    } else {
      _suivis[index] = paiement;
    }
    notifyListeners();
  }

  // ── Direct ───────────────────────────────────────────────────────────────────

  void _traiter(EvenementRecu e) {
    switch (e.evenement) {
      case Evenements.portefeuilleMaj:
        _portefeuille = _portefeuille.copieAvec(
          soldeDisponible: texte(e.charge, 'soldeDisponible', _portefeuille.soldeDisponible),
          soldeBloque: texte(e.charge, 'soldeBloque', _portefeuille.soldeBloque),
          soldeNonJoue: texte(e.charge, 'soldeNonJoue', _portefeuille.soldeNonJoue),
          soldeRetirable: texte(e.charge, 'soldeRetirable', _portefeuille.soldeRetirable),
          devise: texte(e.charge, 'devise', _portefeuille.devise),
        );
        notifyListeners();

      case Evenements.transactionCreee:
        final transaction = TransactionPortefeuille.depuisJson(e.charge);
        if (transaction.id.isEmpty) return;
        if (_page == 1) {
          if (_transactions.any((t) => t.id == transaction.id)) return;
          _transactions = [transaction, ..._transactions];
          _recentes.add(transaction.id);
        } else {
          _horsPage++;
        }
        notifyListeners();

      case Evenements.paiementStatut:
        final id = texte(e.charge, 'paiementId');
        if (id.isEmpty) return;
        suivre(PaiementSuivi(
          id: id,
          type: texte(e.charge, 'type'),
          montant: montantDe(e.charge, 'montant'),
          devise: texte(e.charge, 'devise', 'XOF'),
          statut: texte(e.charge, 'statut'),
        ));
        surEvenementPaiement?.call(e.evenement, e.charge);
    }
  }

  /// Resynchronisation UNIQUE à la (re)connexion du socket : c'est un rattrapage
  /// après coupure, pas un cycle de rafraîchissement.
  void _surEtatDirect() {
    if (!_direct.enDirect) return;
    if (_direct.reconnexions == _derniereResynchro) return;
    _derniereResynchro = _direct.reconnexions;
    if (_portefeuille.id.isEmpty) return; // jamais chargé : rien à rattraper
    charger(avecTransactions: _page == 1);
  }

  void reinitialiser() {
    _portefeuille = Portefeuille.vide;
    _transactions = const [];
    _suivis.clear();
    _recentes.clear();
    _page = 1;
    _horsPage = 0;
    notifyListeners();
  }

  @override
  void dispose() {
    _ecoute?.cancel();
    _direct.removeListener(_surEtatDirect);
    super.dispose();
  }
}
