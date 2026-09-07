import 'conversion.dart';

/// Table `notifications` (§7.14).
///
/// La classe s'appelle `NotificationJoueur` et **jamais** `Notification` :
/// `Notification` est déjà une classe de `package:flutter/widgets.dart` (la base
/// de `NotificationListener`), et la collision rendrait le code ambigu.
class NotificationJoueur {
  const NotificationJoueur({
    required this.id,
    required this.dateCreation,
    required this.titre,
    required this.message,
    required this.type,
    required this.lu,
  });

  final String id;
  final String dateCreation;
  final String titre;
  final String message;

  /// defi_rejoint | match_score | match_termine | litige_ouvert | paiement_confirme…
  final String type;
  final bool lu;

  factory NotificationJoueur.depuisJson(Map<String, dynamic> json) => NotificationJoueur(
        id: texte(json, 'id'),
        dateCreation: texte(json, 'dateCreation'),
        titre: texte(json, 'titre'),
        message: texte(json, 'message'),
        type: texte(json, 'type'),
        lu: booleen(json, 'lu'),
      );

  NotificationJoueur copieAvec({bool? lu}) => NotificationJoueur(
        id: id,
        dateCreation: dateCreation,
        titre: titre,
        message: message,
        type: type,
        lu: lu ?? this.lu,
      );
}
