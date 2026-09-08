import 'dart:async';

import 'package:flutter/foundation.dart';

import '../modeles/utilisateur.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';
import '../noyau/session_locale.dart';
import '../services/auth.service.dart';
import '../services/push.service.dart';
import '../temps_reel/client_temps_reel.dart';
import '../temps_reel/evenements.dart';

/// État de la session : qui est connecté, et le socket qui va avec.
///
/// C'est le seul endroit qui écrit ou efface le jeton. La déconnexion vide TOUT
/// l'état local et ferme le socket : un téléphone prêté ne doit jamais montrer
/// les données du joueur précédent.
class SessionEtat extends ChangeNotifier {
  SessionEtat(this._direct) {
    // Un 401 sur n'importe quelle requête signifie que la session ne vaut plus
    // rien : on nettoie sans attendre que l'utilisateur touche un autre écran.
    ClientApi.surSessionExpiree = () {
      if (_utilisateur != null) _terminer(message: 'Votre session a expiré. Reconnectez-vous.');
    };
  }

  final ClientTempsReel _direct;

  Utilisateur? _utilisateur;
  bool _pret = false;
  bool _onboardingVu = false;
  String? _messageDeconnexion;

  Utilisateur? get utilisateur => _utilisateur;
  bool get connecte => _utilisateur != null;

  /// Vrai une fois le démarrage terminé (jeton lu et validé) : l'écran de
  /// splash attend ce drapeau avant de router.
  bool get pret => _pret;
  bool get onboardingVu => _onboardingVu;

  /// L'adresse doit être confirmée pour créer/rejoindre un défi et pour retirer.
  /// Le dépôt, lui, reste ouvert.
  bool get emailNonConfirme => _utilisateur != null && !_utilisateur!.emailVerifie;

  /// Message à afficher une seule fois après une déconnexion subie (401).
  String? consommerMessageDeconnexion() {
    final m = _messageDeconnexion;
    _messageDeconnexion = null;
    return m;
  }

  ClientTempsReel get direct => _direct;

  // ── Démarrage ────────────────────────────────────────────────────────────────

  /// Lit le jeton stocké et le VALIDE auprès du serveur : il peut avoir expiré,
  /// ou le compte avoir été suspendu depuis la dernière ouverture.
  Future<void> demarrer() async {
    await SessionLocale.initialiser();
    _onboardingVu = await SessionLocale.onboardingVu();

    final jeton = await SessionLocale.lireJeton();
    if (jeton != null) {
      ClientApi.definirJeton(jeton);
      final r = await AuthService.moi();
      if (r is Succes<Utilisateur>) {
        _utilisateur = r.donnees;
        _ouvrirLeDirect();
      } else {
        // Jeton refusé ou serveur injoignable : on n'efface le jeton que dans le
        // premier cas — une coupure réseau ne doit pas déconnecter le joueur.
        if (r is Echec<Utilisateur> && !r.reseau) {
          await SessionLocale.effacerSession();
          ClientApi.definirJeton(null);
        }
      }
    }
    _pret = true;
    notifyListeners();
  }

  Future<void> marquerOnboardingVu() async {
    _onboardingVu = true;
    await SessionLocale.marquerOnboardingVu();
    notifyListeners();
  }

  // ── Entrée / sortie ──────────────────────────────────────────────────────────

  Future<Resultat<void>> connexion({required String email, required String motDePasse}) async {
    final r = await AuthService.connexion(email: email, motDePasse: motDePasse);
    if (r is Echec<SessionAuth>) return r.transtyper<void>();
    await _ouvrirSession((r as Succes<SessionAuth>).donnees);
    return const Succes<void>(null);
  }

  Future<Resultat<void>> inscription({
    required String nomUtilisateur,
    required String email,
    required String motDePasse,
    String? telephone,
    String? pays,
  }) async {
    final r = await AuthService.inscription(
      nomUtilisateur: nomUtilisateur,
      email: email,
      motDePasse: motDePasse,
      telephone: telephone,
      pays: pays,
    );
    if (r is Echec<SessionAuth>) return r.transtyper<void>();
    await _ouvrirSession((r as Succes<SessionAuth>).donnees);
    return const Succes<void>(null);
  }

  Future<void> _ouvrirSession(SessionAuth session) async {
    ClientApi.definirJeton(session.jeton);
    await SessionLocale.ecrireJeton(session.jeton, expiration: session.expiration);
    _utilisateur = session.utilisateur;
    _ouvrirLeDirect();
    notifyListeners();
  }

  Future<void> deconnexion() async {
    // On prévient le serveur (invalidation de la session Redis) mais on ne fait
    // pas dépendre le nettoyage local de la réussite de cet appel.
    await AuthService.deconnexion();
    await _terminer();
  }

  Future<void> _terminer({String? message}) async {
    // Avant tout le reste : un téléphone prêté ne doit plus recevoir « votre défi a été
    // rejoint » pour le compte du joueur précédent.
    await Push.desactiver();
    _direct.deconnecter(oublierSalons: true);
    await SessionLocale.effacerSession();
    ClientApi.definirJeton(null);
    _utilisateur = null;
    _messageDeconnexion = message;
    notifyListeners();
  }

  // ── Mise à jour du profil ────────────────────────────────────────────────────

  void remplacerUtilisateur(Utilisateur u) {
    _utilisateur = u;
    notifyListeners();
  }

  /// Après la confirmation de l'adresse : on relit la session pour que tous les
  /// écrans cessent d'afficher le bandeau, sans redémarrer l'application.
  Future<void> rafraichirUtilisateur() async {
    final r = await AuthService.moi();
    if (r is Succes<Utilisateur>) {
      _utilisateur = r.donnees;
      notifyListeners();
    }
  }

  // ── Direct ───────────────────────────────────────────────────────────────────

  /// Le salon privé est monté UNE fois pour tout l'espace joueur : le solde de
  /// l'en-tête et le compteur de notifications doivent vivre depuis n'importe
  /// quel écran, pas seulement depuis le portefeuille.
  void _ouvrirLeDirect() {
    final id = _utilisateur?.id;
    if (id == null) return;
    _direct.reprendre();
    _direct.abonner([Salons.utilisateur(id), Salons.defisPublics]);

    // Le socket ne couvre que l'application ouverte ; le push prend le relais dès qu'elle
    // passe en arrière-plan. Les deux se montent au même endroit parce qu'ils répondent à la
    // même question — « comment le joueur apprend-il qu'il se passe quelque chose ? » — et
    // qu'un seul des deux monté, c'est un joueur prévenu la moitié du temps.
    //
    // Volontairement pas attendu : demander la permission ouvre une boîte de dialogue système,
    // et l'ouverture de session ne doit pas rester suspendue à la réponse du joueur.
    unawaited(Push.activer(id));
  }

  @override
  void dispose() {
    ClientApi.surSessionExpiree = null;
    super.dispose();
  }
}
