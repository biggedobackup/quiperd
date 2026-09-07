import '../modeles/conversion.dart';
import '../modeles/defi.modele.dart';
import '../modeles/match_defi.modele.dart';
import '../noyau/client_api.dart';
import '../noyau/resultat.dart';

/// Détail d'un défi : la fiche, et le match qui en est né s'il existe déjà.
class DetailDefi {
  const DetailDefi({required this.defi, required this.match});
  final Defi defi;
  final MatchDefi? match;

  factory DetailDefi.depuisJson(Map<String, dynamic> json) => DetailDefi(
        defi: Defi.depuisJson(objet(json['defi'])),
        match: json['match'] == null ? null : MatchDefi.depuisJson(objet(json['match'])),
      );
}

class DefisService {
  const DefisService._();

  /// L'arène : les défis ouverts de tous les joueurs.
  static Future<Resultat<List<Defi>>> ouverts(FiltresDefis filtres) async =>
      (await ClientApi.get('/defis', params: filtres.parametres))
          .vers((corps) => liste(corps, Defi.depuisJson));

  /// Mes défis, tous statuts confondus — une ligne n'y disparaît jamais, c'est
  /// son statut qui change sous les yeux du créateur.
  static Future<Resultat<List<Defi>>> mesDefis() async =>
      (await ClientApi.get('/defis', params: const {'mes': '1'}))
          .vers((corps) => liste(corps, Defi.depuisJson));

  static Future<Resultat<DetailDefi>> detail(String id) async =>
      (await ClientApi.get('/defis/$id')).vers((corps) => DetailDefi.depuisJson(objet(corps)));

  /// La mise est bloquée en séquestre dès la création. Refusé en 403 si
  /// l'adresse e-mail n'est pas confirmée, en 422 si le solde est insuffisant.
  static Future<Resultat<Defi>> creer({
    required String jeuId,
    required String plateformeId,
    required double montantMise,
    String? regles,
    int dureeHeures = 24,
  }) async =>
      (await ClientApi.post('/defis', {
        'jeuId': jeuId,
        'plateformeId': plateformeId,
        // Le backend attend un décimal : on envoie un nombre, jamais une chaîne
        // localisée (« 2 000 » serait rejeté).
        'montantMise': montantMise,
        if (regles != null && regles.isNotEmpty) 'regles': regles,
        'dureeHeures': dureeHeures,
      }))
          .vers((corps) => Defi.depuisJson(objet(corps)));

  /// Rejoindre bloque la mise et crée le match : la réponse est le match.
  static Future<Resultat<MatchDefi>> rejoindre(String id) async =>
      (await ClientApi.post('/defis/$id/rejoindre'))
          .vers((corps) => MatchDefi.depuisJson(objet(corps)));

  /// Annuler rend la mise moins la commission de la plateforme.
  static Future<Resultat<void>> annuler(String id) async =>
      (await ClientApi.delete('/defis/$id')).versRien();
}
