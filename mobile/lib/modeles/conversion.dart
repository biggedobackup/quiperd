/// Petits convertisseurs partagés par tous les modèles.
///
/// Le backend omet les champs nuls (`json:",omitempty"`) et envoie les montants
/// en **chaîne décimale** (`shopspring/decimal`). Les modèles gardent donc les
/// montants en `String` : aucune arithmétique d'argent n'est faite côté mobile.
library;

Map<String, dynamic> objet(Object? valeur) =>
    valeur is Map ? valeur.cast<String, dynamic>() : <String, dynamic>{};

String texte(Map<String, dynamic> json, String cle, [String defaut = '']) {
  final v = json[cle];
  if (v == null) return defaut;
  return v is String ? v : v.toString();
}

String? texteOuNull(Map<String, dynamic> json, String cle) {
  final v = json[cle];
  if (v == null) return null;
  final t = v is String ? v : v.toString();
  return t.isEmpty ? null : t;
}

/// Montant : toujours conservé tel que le serveur l'a écrit (`"1750.50"`).
String montantDe(Map<String, dynamic> json, String cle) {
  final v = json[cle];
  if (v == null) return '0';
  return v is String ? v : v.toString();
}

int entier(Map<String, dynamic> json, String cle, [int defaut = 0]) {
  final v = json[cle];
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? defaut;
  return defaut;
}

int? entierOuNull(Map<String, dynamic> json, String cle) {
  final v = json[cle];
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v);
  return null;
}

double reel(Map<String, dynamic> json, String cle, [double defaut = 0]) {
  final v = json[cle];
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? defaut;
  return defaut;
}

bool booleen(Map<String, dynamic> json, String cle, [bool defaut = false]) {
  final v = json[cle];
  if (v is bool) return v;
  if (v is String) return v == 'true' || v == '1';
  if (v is num) return v != 0;
  return defaut;
}

/// Liste d'objets typés à partir d'une réponse tableau. Une réponse `null`
/// (corps vide) donne une liste vide plutôt qu'une exception : un écran doit
/// pouvoir afficher son état vide, jamais planter.
List<T> liste<T>(Object? source, T Function(Map<String, dynamic>) construire) {
  if (source is! List) return <T>[];
  return source
      .whereType<Object>()
      .map((e) => construire(objet(e)))
      .toList(growable: false);
}
