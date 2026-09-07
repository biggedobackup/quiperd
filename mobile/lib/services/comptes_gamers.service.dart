import '../modeles/compte_gamer.modele.dart';
import '../modeles/conversion.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

class ComptesGamersService {
  const ComptesGamersService._();

  static Future<Resultat<List<CompteGamer>>> lister() async =>
      (await ClientApi.get('/comptes-gamers'))
          .vers((corps) => liste(corps, CompteGamer.depuisJson));

  static Future<Resultat<CompteGamer>> creer({
    required String jeuId,
    required String plateformeId,
    required String identifiantJoueur,
    String? nomAffichage,
  }) async =>
      (await ClientApi.post('/comptes-gamers', {
        'jeuId': jeuId,
        'plateformeId': plateformeId,
        'identifiantJoueur': identifiantJoueur,
        if (nomAffichage != null && nomAffichage.isNotEmpty) 'nomAffichage': nomAffichage,
      }))
          .vers((corps) => CompteGamer.depuisJson(objet(corps)));

  static Future<Resultat<void>> supprimer(String id) async =>
      (await ClientApi.delete('/comptes-gamers/$id')).versRien();
}
