import 'dart:io';

import '../modeles/conversion.dart';
import '../modeles/utilisateur.modele.dart';
import '../config/environnement.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

class UtilisateursService {
  const UtilisateursService._();

  /// Modification de son propre profil. `email`, `statut` et `motDePasse` sont
  /// réservés à l'administrateur : les envoyer d'ici vaudrait un 403.
  ///
  /// Les champs vides sont **omis** plutôt qu'envoyés vides : le PATCH backend
  /// ignore les chaînes vides, mais l'omission rend l'intention explicite.
  static Future<Resultat<Utilisateur>> modifierProfil({
    required String id,
    String? nomUtilisateur,
    String? telephone,
    String? pays,

  }) async =>
      (await ClientApi.patch('/utilisateurs/$id', {
        if (nomUtilisateur != null && nomUtilisateur.isNotEmpty) 'nomUtilisateur': nomUtilisateur,
        if (telephone != null && telephone.isNotEmpty) 'telephone': telephone,
        if (pays != null && pays.isNotEmpty) 'pays': pays,
      }))
          .vers((corps) => Utilisateur.depuisJson(objet(corps)));

  /// Envoie la photo de profil du joueur — un FICHIER, jamais une adresse.
  ///
  /// Coller un lien avait trois défauts : la photo pouvait disparaître du jour au
  /// lendemain, l'application allait chercher une image chez un tiers, et rien ne
  /// garantissait que c'en était une. Le backend contrôle le contenu réel et
  /// remplace l'ancienne image.
  static Future<Resultat<Utilisateur>> envoyerPhoto(File fichier) async =>
      (await ClientApi.televerser('/utilisateurs/moi/photo', fichier: fichier, champs: const {}))
          .vers((corps) => Utilisateur.depuisJson(objet(corps)));

  /// Retire la photo de profil (retour aux initiales).
  static Future<Resultat<Utilisateur>> retirerPhoto() async =>
      (await ClientApi.delete('/utilisateurs/moi/photo'))
          .vers((corps) => Utilisateur.depuisJson(objet(corps)));

  /// Adresse de la photo d'un joueur. La route exige une session : on y joint le
  /// même en-tête que pour les preuves.
  static String urlPhoto(String utilisateurId) =>
      '${Environnement.apiBaseUrl}/utilisateurs/$utilisateurId/photo';

  /// En-têtes à joindre pour lire une photo de profil.
  static Map<String, String> get entetesPhoto =>
      ClientApi.connecte ? {'Authorization': 'Bearer ${ClientApi.jeton}'} : const {};
}
