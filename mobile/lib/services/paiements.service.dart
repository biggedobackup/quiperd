import '../modeles/conversion.dart';
import '../modeles/paiement.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

/// Dépôts et retraits Mobile Money.
///
/// Le montant part en nombre décimal ; les **frais de retrait sont calculés par
/// le backend**, jamais ici — le mobile ne fait aucun calcul d'argent.
class PaiementsService {
  const PaiementsService._();

  /// Le dépôt reste ouvert même sans adresse confirmée : faire entrer de
  /// l'argent ne présente pas le même risque qu'en faire sortir.
  static Future<Resultat<ReponseDepot>> deposer({
    required double montant,
    required String prestataire,
    String? numero,
  }) async =>
      (await ClientApi.post('/paiements/depot', {
        'montant': montant,
        'prestataire': prestataire,
        if (numero != null && numero.isNotEmpty) 'numero': numero,
      }))
          .vers((corps) => ReponseDepot.depuisJson(objet(corps)));

  /// Exige une adresse e-mail confirmée (403 sinon) et un solde suffisant (422).
  static Future<Resultat<Paiement>> retirer({
    required double montant,
    required String prestataire,
    required String numero,
  }) async =>
      (await ClientApi.post('/paiements/retrait', {
        'montant': montant,
        'prestataire': prestataire,
        'numero': numero,
      }))
          .vers((corps) => Paiement.depuisJson(objet(corps)));
}
