/// Contrat des événements temps réel — miroir exact de
/// `backend/tempsreel/evenements.go` (miroir web :
/// `frontend/src/temps-reel/evenements.ts`).
///
/// Toute modification doit être faite des DEUX côtés dans le même commit.
/// Le serveur POUSSE ; le client ne redemande jamais périodiquement.
library;

/// Salons d'abonnement. Un salon interdit est refusé explicitement par le
/// serveur, jamais ignoré en silence.
class Salons {
  const Salons._();

  /// L'arène : ouvert à tous, y compris aux visiteurs.
  static const String defisPublics = 'public:defis';

  /// Jamais côté mobile — l'administration reste sur le web.
  static const String admin = 'admin';

  /// Salon privé du joueur : argent et notifications.
  static String utilisateur(String id) => 'utilisateur:$id';

  /// Salon des deux joueurs d'un match.
  static String match(String id) => 'match:$id';
}

/// Noms d'événements. Regroupés comme dans le fichier Go, pour que la
/// comparaison ligne à ligne reste facile.
class Evenements {
  const Evenements._();

  // Connexion (émis par le hub).
  static const String connexionPrete = 'connexion.prete';
  static const String connexionRefusee = 'connexion.refusee';
  static const String abonnementConfirme = 'abonnement.confirme';

  // Défis.
  static const String defiCree = 'defi.cree';
  static const String defiRejoint = 'defi.rejoint';
  static const String defiAnnule = 'defi.annule';
  static const String defiExpire = 'defi.expire';

  // Matchs.
  static const String matchCree = 'match.cree';
  static const String matchPresence = 'match.presence';
  static const String matchScorePropose = 'match.score_propose';
  static const String matchScoreConfirme = 'match.score_confirme';
  static const String matchDesaccord = 'match.desaccord';
  static const String matchNul = 'match.nul';
  static const String matchNulChoix = 'match.nul_choix';
  static const String matchRejoue = 'match.rejoue';
  static const String matchPartage = 'match.partage';
  static const String matchPreuveEnvoyee = 'match.preuve_envoyee';
  static const String matchLitigeOuvert = 'match.litige_ouvert';
  static const String matchLitigeResolu = 'match.litige_resolu';
  static const String matchTermine = 'match.termine';
  static const String matchChrono = 'match.chrono';
  static const String matchAbandon = 'match.abandon';

  // Compte joueur (salon utilisateur:<id>).
  static const String portefeuilleMaj = 'portefeuille.maj';
  static const String transactionCreee = 'transaction.creee';
  static const String paiementStatut = 'paiement.statut';
  static const String notificationNouvelle = 'notification.nouvelle';

  // Global (salon public:defis).
  static const String compteurEnLigne = 'compteur.en_ligne';
}

/// Enveloppe reçue sur le socket.
class EvenementRecu {
  const EvenementRecu({
    required this.evenement,
    required this.salon,
    required this.horodatage,
    required this.charge,
  });

  final String evenement;
  final String? salon;
  final String horodatage;

  /// Toujours un objet JSON (jamais un scalaire), par contrat.
  final Map<String, dynamic> charge;

  factory EvenementRecu.depuisJson(Map<String, dynamic> json) {
    final brut = json['charge'];
    return EvenementRecu(
      evenement: '${json['evenement'] ?? ''}',
      salon: json['salon'] == null ? null : '${json['salon']}',
      horodatage: '${json['horodatage'] ?? ''}',
      charge: brut is Map ? brut.cast<String, dynamic>() : <String, dynamic>{},
    );
  }
}

/// État visible du direct — l'indicateur parle de l'état de la connexion
/// (« en direct », « reconnexion… »), jamais d'un cycle de rafraîchissement.
enum EtatDirect { horsLigne, connexion, connecte, reconnexion }

extension LibelleEtatDirect on EtatDirect {
  String get libelle => switch (this) {
        EtatDirect.connecte => 'En direct',
        EtatDirect.connexion => 'Connexion…',
        EtatDirect.reconnexion => 'Reconnexion…',
        EtatDirect.horsLigne => 'Hors ligne',
      };
}
