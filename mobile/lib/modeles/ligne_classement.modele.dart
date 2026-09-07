import 'conversion.dart';

/// Ligne du classement (`GET /api/classement`). Le tableau est recalculé à la
/// lecture par le serveur, à partir des matchs réellement terminés et des gains
/// réellement crédités : rien n'est agrégé côté mobile.
class LigneClassement {
  const LigneClassement({
    required this.rang,
    required this.utilisateurId,
    required this.nomUtilisateur,
    required this.photoProfil,
    required this.pays,
    required this.matchs,
    required this.victoires,
    required this.gains,
    required this.devise,
  });

  final int rang;
  final String utilisateurId;
  final String nomUtilisateur;
  final String photoProfil;
  final String pays;
  final int matchs;
  final int victoires;

  /// Somme des transactions de type `gain` — l'argent réellement crédité, pas le
  /// total des mises engagées.
  final String gains;
  final String devise;

  int get defaites => matchs - victoires;

  factory LigneClassement.depuisJson(Map<String, dynamic> json) => LigneClassement(
        rang: entier(json, 'rang'),
        utilisateurId: texte(json, 'utilisateurId'),
        nomUtilisateur: texte(json, 'nomUtilisateur'),
        photoProfil: texte(json, 'photoProfil'),
        pays: texte(json, 'pays'),
        matchs: entier(json, 'matchs'),
        victoires: entier(json, 'victoires'),
        gains: montantDe(json, 'gains'),
        devise: texte(json, 'devise', 'XOF'),
      );
}

/// Réponse complète : le haut du tableau, et la ligne du joueur connecté s'il
/// n'y figure pas déjà — sans quoi un joueur classé 32e n'aurait aucun moyen de
/// se situer.
class Classement {
  const Classement({required this.periode, required this.elements, required this.moi});

  /// general | mois | semaine
  final String periode;
  final List<LigneClassement> elements;
  final LigneClassement? moi;

  factory Classement.depuisJson(Map<String, dynamic> json) => Classement(
        periode: texte(json, 'periode', 'general'),
        elements: liste(json['elements'], LigneClassement.depuisJson),
        moi: json['moi'] == null ? null : LigneClassement.depuisJson(objet(json['moi'])),
      );

  static const Classement vide =
      Classement(periode: 'general', elements: [], moi: null);
}
