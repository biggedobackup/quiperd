/// Résultat d'un appel à l'API : soit des données, soit un échec porteur du code
/// HTTP et du message renvoyé par le backend.
///
/// Aucune exception ne remonte jusqu'aux écrans : un réseau coupé, une erreur de
/// validation et un refus métier arrivent tous ici, sous la même forme, et
/// chaque écran décide quoi en montrer. Sur une plateforme où l'on engage de
/// l'argent, un échec silencieux est pire qu'un message maladroit.
sealed class Resultat<T> {
  const Resultat();

  bool get ok => this is Succes<T>;

  /// Donnée en cas de succès, `null` sinon — pratique dans un `if (r.ok)`.
  T? get valeur => this is Succes<T> ? (this as Succes<T>).donnees : null;
}

class Succes<T> extends Resultat<T> {
  const Succes(this.donnees);
  final T donnees;
}

class Echec<T> extends Resultat<T> {
  const Echec(this.statut, this.message, {this.details = const {}});

  /// Code HTTP, ou 0 quand la requête n'a jamais atteint le serveur.
  final int statut;
  final String message;

  /// Erreurs de validation par champ (`{"montantMise": "…"}`), renvoyées en 400.
  final Map<String, String> details;

  /// Vrai quand la requête n'a pas abouti au réseau : on propose de réessayer,
  /// mais on ne réessaie JAMAIS tout seul une action qui engage de l'argent.
  bool get reseau => statut == 0;

  bool get sessionExpiree => statut == 401;

  /// Le backend refuse l'action tant que l'adresse e-mail n'est pas confirmée.
  bool get emailNonConfirme => statut == 403 && message.toLowerCase().contains('mail');

  /// Change de type sans perdre le motif (utile quand un service enchaîne
  /// plusieurs appels et veut remonter l'échec du premier).
  Echec<U> transtyper<U>() => Echec<U>(statut, message, details: details);
}

extension ConversionResultat on Resultat<dynamic> {
  /// Transforme la charge JSON en modèle typé, en laissant passer l'échec tel
  /// quel. C'est ce qui permet à chaque service de tenir en une ligne par route.
  Resultat<T> vers<T>(T Function(dynamic corps) construire) {
    final r = this;
    if (r is Echec<dynamic>) return r.transtyper<T>();
    return Succes<T>(construire((r as Succes<dynamic>).donnees));
  }

  /// Pour les routes dont on ne lit pas le corps (suppression, marquage lu…).
  Resultat<void> versRien() {
    final r = this;
    if (r is Echec<dynamic>) return r.transtyper<void>();
    return const Succes<void>(null);
  }
}
