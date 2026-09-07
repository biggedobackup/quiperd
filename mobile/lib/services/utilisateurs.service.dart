import '../modeles/conversion.dart';
import '../modeles/utilisateur.modele.dart';
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
    String? photoProfil,
  }) async =>
      (await ClientApi.patch('/utilisateurs/$id', {
        if (nomUtilisateur != null && nomUtilisateur.isNotEmpty) 'nomUtilisateur': nomUtilisateur,
        if (telephone != null && telephone.isNotEmpty) 'telephone': telephone,
        if (pays != null && pays.isNotEmpty) 'pays': pays,
        'photoProfil': ?photoProfil,
      }))
          .vers((corps) => Utilisateur.depuisJson(objet(corps)));
}
