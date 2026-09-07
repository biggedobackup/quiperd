import 'conversion.dart';

/// Table `utilisateurs` (§7.1). Le mot de passe n'est jamais sérialisé par le
/// backend (`json:"-"`), il n'a donc pas de place ici.
class Utilisateur {
  const Utilisateur({
    required this.id,
    required this.dateCreation,
    required this.nomUtilisateur,
    required this.email,
    required this.telephone,
    required this.photoProfil,
    required this.pays,
    required this.statut,
    required this.emailVerifie,
  });

  final String id;
  final String dateCreation;
  final String nomUtilisateur;
  final String email;
  final String telephone;
  final String photoProfil;
  final String pays;
  final String statut;

  /// Tant qu'elle est fausse, le joueur peut déposer mais ne peut ni créer ou
  /// rejoindre un défi, ni demander un retrait (403 côté backend).
  final bool emailVerifie;

  factory Utilisateur.depuisJson(Map<String, dynamic> json) => Utilisateur(
        id: texte(json, 'id'),
        dateCreation: texte(json, 'dateCreation'),
        nomUtilisateur: texte(json, 'nomUtilisateur'),
        email: texte(json, 'email'),
        telephone: texte(json, 'telephone'),
        photoProfil: texte(json, 'photoProfil'),
        pays: texte(json, 'pays'),
        statut: texte(json, 'statut', 'actif'),
        emailVerifie: booleen(json, 'emailVerifie'),
      );

  Utilisateur copieAvec({bool? emailVerifie}) => Utilisateur(
        id: id,
        dateCreation: dateCreation,
        nomUtilisateur: nomUtilisateur,
        email: email,
        telephone: telephone,
        photoProfil: photoProfil,
        pays: pays,
        statut: statut,
        emailVerifie: emailVerifie ?? this.emailVerifie,
      );
}
