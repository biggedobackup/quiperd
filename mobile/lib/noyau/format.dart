import 'package:intl/intl.dart';

/// Formatage centralisé (locale fr) — miroir de `frontend/src/lib/format.ts`.
/// Jamais de `toStringAsFixed` improvisé dans un widget : les montants et les
/// dates doivent se lire à l'identique sur le site et dans l'application.

const String _locale = 'fr_FR';

// L'espace insécable étroit sépare les milliers en français ; `intl` l'utilise
// déjà pour fr_FR, on garde donc ses formateurs tels quels.
final NumberFormat _montantEntier = NumberFormat.decimalPatternDigits(
  locale: _locale,
  decimalDigits: 0,
);
// Au plus deux décimales, et aucune quand le montant est rond — exactement ce
// que fait `Intl.NumberFormat` côté web (`maximumFractionDigits: 2`,
// `minimumFractionDigits: 0`). Les deux clients doivent écrire le même montant.
final NumberFormat _montantPrecis = NumberFormat('#,##0.##', _locale);

// Fuseau : les dates sont affichées en UTC, comme sur le web. Abidjan est à
// UTC+0, l'affichage reste donc juste pour les joueurs, et les deux clients
// montrent la même heure pour un même match.
final DateFormat _date = DateFormat('dd MMM yyyy', _locale);
final DateFormat _dateHeure = DateFormat('dd MMM yyyy, HH:mm', _locale);
final DateFormat _heure = DateFormat('HH:mm', _locale);

/// Convertit une chaîne décimale du backend (`"2000.50"`) ou un nombre.
/// Les montants voyagent en `String` (`shopspring/decimal`) et ne sont convertis
/// que pour l'affichage : aucun calcul d'argent n'est fait côté mobile.
double versNombre(Object? valeur) {
  if (valeur == null) return 0;
  if (valeur is num) return valeur.toDouble();
  final texte = valeur.toString().trim();
  if (texte.isEmpty) return 0;
  return double.tryParse(texte) ?? 0;
}

/// `intl` sépare les milliers par une espace insécable ÉTROITE (U+202F). Manrope
/// n'en a pas le glyphe et la rend quasi nulle : « 21600 FCFA » au lieu de
/// « 21 600 FCFA ». On repasse sur l'espace insécable ordinaire, présente dans
/// les trois polices du projet — sur une application d'argent, un montant à cinq
/// chiffres doit rester lisible d'un coup d'œil.
String _lisible(String montant) => montant.replaceAll(' ', ' ');

/// `2000` → « 2 000 FCFA ». La devise reste explicite (charte API).
String formatMontant(Object? valeur, [String devise = 'XOF']) {
  final libelle = devise == 'XOF' ? 'FCFA' : devise;
  return '${formatMontantNu(valeur)} $libelle';
}

/// Montant sans devise — pour un compteur qui affiche l'unité à part.
String formatMontantNu(Object? valeur) {
  final n = versNombre(valeur);
  return _lisible(n == n.roundToDouble() ? _montantEntier.format(n) : _montantPrecis.format(n));
}

enum SensMontant { credit, debit, neutre }

/// « + 3 600 FCFA » / « − 2 000 FCFA ».
String formatMontantSigne(Object? valeur, SensMontant sens, [String devise = 'XOF']) {
  final base = formatMontant(valeur, devise);
  return switch (sens) {
    SensMontant.credit => '+ $base',
    SensMontant.debit => '− $base',
    SensMontant.neutre => base,
  };
}

/// `0.1` → « 10 % ».
String formatPourcentage(Object? taux) {
  final n = versNombre(taux) * 100;
  final texte = n == n.roundToDouble()
      ? n.toStringAsFixed(0)
      : n.toStringAsFixed(2).replaceAll('.', ',').replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r',$'), '');
  return '$texte %';
}

DateTime? _analyser(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  return DateTime.tryParse(iso)?.toUtc();
}

String formatDate(String? iso) {
  final d = _analyser(iso);
  return d == null ? '—' : _date.format(d);
}

String formatDateHeure(String? iso) {
  final d = _analyser(iso);
  return d == null ? '—' : _dateHeure.format(d);
}

String formatHeure(String? iso) {
  final d = _analyser(iso);
  return d == null ? '—' : _heure.format(d);
}

/// « il y a 3 min », « dans 2 h », « hier ».
String formatDateRelative(String? iso, {DateTime? maintenant}) {
  final d = _analyser(iso);
  if (d == null) return '—';
  final reference = (maintenant ?? DateTime.now()).toUtc();
  final secondes = d.difference(reference).inSeconds;
  final abs = secondes.abs();
  final passe = secondes < 0;

  String tourner(String quantite) => passe ? 'il y a $quantite' : 'dans $quantite';

  // Sous 45 secondes, l'écart n'est que du décalage d'horloge entre le serveur
  // et le téléphone : annoncer « dans un instant » pour une action DÉJÀ faite
  // (un défi créé, un score déclaré) serait faux.
  if (abs < 45) return 'à l’instant';
  if (abs < 3600) {
    final minutes = (abs / 60).round();
    return tourner('$minutes min');
  }
  if (abs < 86400) {
    final heures = (abs / 3600).round();
    return tourner('$heures h');
  }
  if (abs < 86400 * 30) {
    final jours = (abs / 86400).round();
    if (jours == 1) return passe ? 'hier' : 'demain';
    return tourner('$jours jours');
  }
  return formatDate(iso);
}

/// Compte à rebours d'une échéance : « 04:32 », « 1 h 12 min », « échu ».
/// Purement client, calculé depuis une date fournie par le serveur — jamais un
/// appel réseau périodique.
String formatDuree(Duration restant) {
  if (restant.isNegative || restant.inSeconds <= 0) return 'échu';
  final heures = restant.inHours;
  final minutes = restant.inMinutes % 60;
  final secondes = restant.inSeconds % 60;
  if (heures >= 24) {
    final jours = restant.inDays;
    final resteHeures = heures % 24;
    return '$jours j ${resteHeures.toString().padLeft(2, '0')} h';
  }
  if (heures > 0) return '$heures h ${minutes.toString().padLeft(2, '0')} min';
  return '${minutes.toString().padLeft(2, '0')}:${secondes.toString().padLeft(2, '0')}';
}

/// Référence courte pour l'affichage : « PAY-5eb206a1… ».
String formatReference(String? reference, {int longueur = 14}) {
  if (reference == null || reference.isEmpty) return '—';
  return reference.length > longueur ? '${reference.substring(0, longueur)}…' : reference;
}

/// Identifiant UUID abrégé : « #a1b2c3d4 ».
String formatIdentifiant(String? id) {
  if (id == null || id.isEmpty) return '—';
  return '#${id.length > 8 ? id.substring(0, 8) : id}';
}

String pluriel(int n, String singulier, [String? formePluriel]) =>
    n > 1 ? (formePluriel ?? '${singulier}s') : singulier;

/// Monogramme d'avatar : les deux premières lettres du pseudo, en capitales.
String monogramme(String? pseudo) {
  final texte = (pseudo ?? '').trim();
  if (texte.isEmpty) return '?';
  return texte.substring(0, texte.length >= 2 ? 2 : 1).toUpperCase();
}
