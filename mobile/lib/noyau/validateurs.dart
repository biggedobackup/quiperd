/// Validation des formulaires — mêmes règles et mêmes messages que le web
/// (`frontend/src/lib/formulaires.ts`), pour qu'un joueur qui passe du site à
/// l'application ne rencontre pas deux exigences différentes.
///
/// La validation côté client sert au confort : le backend revalide tout, et
/// c'est lui qui fait autorité.
class Messages {
  const Messages._();

  static const requis = 'Ce champ est obligatoire';
  static const email = 'Adresse e-mail invalide';
  static const pseudo = 'Entre 3 et 50 caractères';
  static const motDePasse = '6 caractères minimum';
  static const montant = 'Entrez un montant valide';
  static const telephone = 'Numéro invalide (format international, ex. +225 07 00 00 00 00)';
}

final RegExp _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$');

/// Format international permissif : « + » facultatif puis 7 à 20 chiffres,
/// espaces, points ou tirets.
final RegExp _telephone = RegExp(r'^\+?\d[\d\s.\-]{6,19}$');

/// Indicatif seul (issu du préremplissage) : équivaut à « pas de numéro ».
final RegExp _indicatifSeul = RegExp(r'^\+\d{1,4}$');

String? validerRequis(String? valeur) =>
    (valeur == null || valeur.trim().isEmpty) ? Messages.requis : null;

String? validerEmail(String? valeur) {
  final v = (valeur ?? '').trim();
  if (v.isEmpty) return Messages.requis;
  return _email.hasMatch(v) ? null : Messages.email;
}

String? validerPseudo(String? valeur) {
  final v = (valeur ?? '').trim();
  if (v.isEmpty) return Messages.requis;
  return (v.length < 3 || v.length > 50) ? Messages.pseudo : null;
}

String? validerMotDePasse(String? valeur) {
  final v = valeur ?? '';
  if (v.isEmpty) return Messages.requis;
  return v.length < 6 ? Messages.motDePasse : null;
}

/// Le téléphone est facultatif partout : un champ vide, ou réduit à l'indicatif
/// prérempli, n'est pas une erreur (le PATCH backend ignore les chaînes vides).
String? validerTelephone(String? valeur) {
  final v = nettoyerTelephone(valeur);
  if (v == null) return null;
  return _telephone.hasMatch(v) ? null : Messages.telephone;
}

String? nettoyerTelephone(String? valeur) {
  final v = (valeur ?? '').trim();
  if (v.isEmpty || _indicatifSeul.hasMatch(v)) return null;
  return v;
}

/// Montant borné par les règles financières lues sur l'API — jamais par des
/// constantes écrites en dur.
String? validerMontant(
  String? valeur, {
  required double minimum,
  required double maximum,
  required String Function(double) formater,
}) {
  final v = (valeur ?? '').trim().replaceAll(' ', '').replaceAll(',', '.');
  if (v.isEmpty) return Messages.requis;
  final n = double.tryParse(v);
  if (n == null || n.isNaN) return Messages.montant;
  if (n < minimum) return 'Minimum : ${formater(minimum)}';
  if (n > maximum) return 'Maximum : ${formater(maximum)}';
  return null;
}
