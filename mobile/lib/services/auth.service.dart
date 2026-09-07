import '../modeles/conversion.dart';
import '../modeles/utilisateur.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

/// Session ouverte : l'utilisateur, son jeton et la date d'expiration.
class SessionAuth {
  const SessionAuth({required this.utilisateur, required this.jeton, required this.expiration});

  final Utilisateur utilisateur;
  final String jeton;
  final String expiration;

  factory SessionAuth.depuisJson(Map<String, dynamic> json) => SessionAuth(
        utilisateur: Utilisateur.depuisJson(objet(json['utilisateur'])),
        jeton: texte(json, 'jeton'),
        expiration: texte(json, 'expiration'),
      );
}

/// Module `auth` du backend. Aucun de ces appels ne stocke quoi que ce soit :
/// c'est `SessionEtat` qui décide d'écrire le jeton et de l'effacer.
class AuthService {
  const AuthService._();

  static Future<Resultat<SessionAuth>> inscription({
    required String nomUtilisateur,
    required String email,
    required String motDePasse,
    String? telephone,
    String? pays,
  }) async =>
      (await ClientApi.post('/auth/inscription', {
        'nomUtilisateur': nomUtilisateur,
        'email': email,
        'motDePasse': motDePasse,
        'telephone': ?telephone,
        'pays': ?pays,
      }))
          .vers((corps) => SessionAuth.depuisJson(objet(corps)));

  /// Le champ s'appelle `email` mais accepte aussi le pseudo (le backend teste
  /// les deux colonnes) : d'où le libellé « E-mail ou pseudo » de l'écran.
  static Future<Resultat<SessionAuth>> connexion({
    required String email,
    required String motDePasse,
  }) async =>
      (await ClientApi.post('/auth/connexion', {'email': email, 'motDePasse': motDePasse}))
          .vers((corps) => SessionAuth.depuisJson(objet(corps)));

  /// Valide le jeton lu au démarrage : un jeton peut avoir expiré, ou le compte
  /// avoir été suspendu depuis la dernière ouverture.
  static Future<Resultat<Utilisateur>> moi() async =>
      (await ClientApi.get('/auth/moi'))
          .vers((corps) => Utilisateur.depuisJson(objet(objet(corps)['utilisateur'])));

  static Future<Resultat<void>> deconnexion() async =>
      (await ClientApi.post('/auth/deconnexion')).versRien();

  static Future<Resultat<void>> motDePasseOublie(String email) async =>
      (await ClientApi.post('/auth/mot-de-passe-oublie', {'email': email})).versRien();

  static Future<Resultat<void>> reinitialiserMotDePasse({
    required String token,
    required String nouveauMotDePasse,
  }) async =>
      (await ClientApi.post('/auth/reinitialisation-mot-de-passe', {
        'token': token,
        'nouveauMotDePasse': nouveauMotDePasse,
      }))
          .versRien();

  static Future<Resultat<void>> changerMotDePasse({
    required String motDePasseActuel,
    required String nouveauMotDePasse,
  }) async =>
      (await ClientApi.post('/auth/changer-mot-de-passe', {
        'motDePasseActuel': motDePasseActuel,
        'nouveauMotDePasse': nouveauMotDePasse,
      }))
          .versRien();

  /// Code à 6 chiffres reçu par e-mail. En cas d'erreur, le backend renvoie une
  /// 400 dont le message porte le nombre d'essais restants.
  static Future<Resultat<void>> verifierEmail(String code) async =>
      (await ClientApi.post('/auth/verification-email', {'code': code})).versRien();

  /// Verrou anti-renvoi de 60 s côté serveur (429 sinon).
  static Future<Resultat<void>> renvoyerCodeEmail() async =>
      (await ClientApi.post('/auth/verification-email/renvoyer')).versRien();
}
