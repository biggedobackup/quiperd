import 'conversion.dart';

/// Table `paiements` (§7.13) : dépôts et retraits Mobile Money.
class Paiement {
  const Paiement({
    required this.id,
    required this.dateCreation,
    required this.type,
    required this.prestataire,
    required this.montant,
    required this.frais,
    required this.devise,
    required this.reference,
    required this.statut,
  });

  final String id;
  final String dateCreation;

  /// depot | retrait
  final String type;

  /// ligdicash | fusionmoney
  final String prestataire;
  final String montant;

  /// Frais de retrait, calculés par le backend — jamais côté mobile.
  final String frais;
  final String devise;
  final String reference;

  /// en_attente | reussi | echoue | rembourse
  final String statut;

  bool get estDepot => type == 'depot';

  factory Paiement.depuisJson(Map<String, dynamic> json) => Paiement(
        id: texte(json, 'id'),
        dateCreation: texte(json, 'dateCreation'),
        type: texte(json, 'type'),
        prestataire: texte(json, 'prestataire'),
        montant: montantDe(json, 'montant'),
        frais: montantDe(json, 'frais'),
        devise: texte(json, 'devise', 'XOF'),
        reference: texte(json, 'reference'),
        statut: texte(json, 'statut', 'en_attente'),
      );

  Paiement copieAvec({String? statut}) => Paiement(
        id: id,
        dateCreation: dateCreation,
        type: type,
        prestataire: prestataire,
        montant: montant,
        frais: frais,
        devise: devise,
        reference: reference,
        statut: statut ?? this.statut,
      );
}

/// Moyen de paiement réellement proposable, tel que le backend l'annonce sur
/// `GET /api/paiements/prestataires`.
///
/// La liste peut être **vide** : une passerelle désactivée ou non configurée ne
/// doit jamais apparaître dans une feuille de dépôt, sans quoi le joueur reçoit
/// un 400 qu'il ne peut pas comprendre.
class PrestatairePublic {
  const PrestatairePublic({
    required this.code,
    required this.libelle,
    required this.numeroRequis,
    required this.montantMinimum,
  });

  /// ligdicash | fusionmoney
  final String code;
  final String libelle;

  /// MoneyFusion exige le numéro à la création ; LigdiCash le collecte sur sa page.
  final bool numeroRequis;

  /// Plancher imposé par la PASSERELLE, en francs entiers : MoneyFusion refuse la
  /// création sous 200 F. Sous ce seuil, le dépôt n'aboutirait jamais.
  final int montantMinimum;

  factory PrestatairePublic.depuisJson(Map<String, dynamic> json) => PrestatairePublic(
        code: texte(json, 'code'),
        libelle: texte(json, 'libelle'),
        numeroRequis: booleen(json, 'numeroRequis'),
        montantMinimum: entier(json, 'montantMinimum', 100),
      );
}

/// Réponse de `POST /api/paiements/depot`.
///
/// Quand le prestataire héberge la page de paiement, [urlPaiement] est renseignée
/// et doit être ouverte dans le navigateur du système — jamais dans une vue
/// interne bricolée. Sinon [message] explique l'attente de confirmation.
class ReponseDepot {
  const ReponseDepot({required this.paiement, this.urlPaiement, this.message});

  final Paiement? paiement;
  final String? urlPaiement;
  final String? message;

  factory ReponseDepot.depuisJson(Map<String, dynamic> json) => ReponseDepot(
        paiement: json['paiement'] == null
            ? null
            : Paiement.depuisJson(objet(json['paiement'])),
        urlPaiement: texteOuNull(json, 'urlPaiement'),
        message: texteOuNull(json, 'message'),
      );
}
