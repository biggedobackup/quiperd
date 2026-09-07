import '../modeles/conversion.dart';
import '../modeles/portefeuille.modele.dart';
import '../modeles/transaction_portefeuille.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

class PortefeuilleService {
  const PortefeuilleService._();

  /// Même pagination que le web : 20 mouvements par page.
  static const int taillePage = 20;

  static Future<Resultat<Portefeuille>> lire() async =>
      (await ClientApi.get('/portefeuille')).vers((corps) => Portefeuille.depuisJson(objet(corps)));

  static Future<Resultat<List<TransactionPortefeuille>>> transactions({int page = 1}) async =>
      (await ClientApi.get('/portefeuille/transactions', params: {
        'limite': taillePage,
        'decalage': (page - 1) * taillePage,
      }))
          .vers((corps) => liste(corps, TransactionPortefeuille.depuisJson));
}
