import 'package:flutter/material.dart';

import '../../app.dart' show cleMessager;
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Messages éphémères (succès, erreur, information, attention).
///
/// Ils flottent au-dessus de la barre de navigation basse pour ne jamais
/// masquer les onglets, et restent plus longtemps à l'écran quand ils portent
/// une mauvaise nouvelle : un joueur doit avoir le temps de lire « dépôt
/// échoué ».
enum TonMessage { succes, erreur, info, attention }

class Message {
  const Message._();

  static void succes(BuildContext context, String titre, [String? detail]) =>
      _afficher(context, TonMessage.succes, titre, detail);

  static void erreur(BuildContext context, String titre, [String? detail]) =>
      _afficher(context, TonMessage.erreur, titre, detail);

  static void info(BuildContext context, String titre, [String? detail]) =>
      _afficher(context, TonMessage.info, titre, detail);

  static void attention(BuildContext context, String titre, [String? detail]) =>
      _afficher(context, TonMessage.attention, titre, detail);

  /// Le `context` ne sert plus à ATTEINDRE le gestionnaire de messages : on passe par la clé
  /// globale posée sur le `MaterialApp`.
  ///
  /// Le lire depuis le contexte de l'écran inscrivait celui-ci comme dépendant d'un
  /// `InheritedWidget`. Or la plupart de ces messages sont déclenchés par un ÉVÉNEMENT du
  /// socket — un litige ouvert par le worker, une preuve déposée par l'adversaire — et pas par
  /// un geste : quand l'événement tombait pendant le démontage de l'écran, l'ancêtre était
  /// démonté avec un dépendant encore accroché et Flutter s'arrêtait sur « _dependents.isEmpty ».
  ///
  /// Le paramètre est conservé — il évite de réécrire la centaine d'appels — et sert de filet
  /// tant que la clé n'est pas montée (tout premier build, tests de widgets isolés).
  static void _afficher(BuildContext context, TonMessage ton, String titre, String? detail) {
    final messager = cleMessager.currentState ?? ScaffoldMessenger.maybeOf(context);
    if (messager == null) return;

    final (Color accent, IconData icone) = switch (ton) {
      TonMessage.succes => (Couleurs.volt, Icons.check_circle_outline),
      TonMessage.erreur => (Couleurs.perte, Icons.error_outline),
      TonMessage.attention => (Couleurs.alerte, Icons.warning_amber_outlined),
      TonMessage.info => (Couleurs.craie, Icons.info_outline),
    };

    messager
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: Duration(seconds: ton == TonMessage.erreur ? 6 : 4),
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          content: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icone, color: accent, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      titre,
                      style: Typo.legendeForte.copyWith(color: Couleurs.craie),
                    ),
                    if (detail != null && detail.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        detail,
                        style: Typo.petit.copyWith(color: Couleurs.craie.withValues(alpha: 0.85)),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      );
  }
}

/// Encart d'information posé dans le flux d'un écran (pas éphémère) : rappel
/// d'un solde insuffisant, retour d'un prestataire, adresse non confirmée.
class Encart extends StatelessWidget {
  const Encart({
    super.key,
    required this.texte,
    this.ton = TonMessage.info,
    this.icone,
    this.action,
  });

  final String texte;
  final TonMessage ton;
  final IconData? icone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final (Color bordure, Color fond, Color encreTexte) = switch (ton) {
      TonMessage.succes => (Couleurs.gain, Couleurs.gainFond, Couleurs.gain),
      TonMessage.erreur => (Couleurs.perte, Couleurs.perteFond, Couleurs.perte),
      TonMessage.attention => (Couleurs.alerte, Couleurs.alerteFond, Couleurs.alerte),
      TonMessage.info => (Couleurs.trait, Couleurs.gris, Couleurs.info),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: fond,
        border: Border.all(color: bordure),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                icone ??
                    switch (ton) {
                      TonMessage.succes => Icons.check_circle_outline,
                      TonMessage.erreur => Icons.error_outline,
                      TonMessage.attention => Icons.warning_amber_outlined,
                      TonMessage.info => Icons.info_outline,
                    },
                size: 18,
                color: encreTexte,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(texte, style: Typo.legende.copyWith(color: encreTexte)),
              ),
            ],
          ),
          if (action != null) ...[
            const SizedBox(height: 12),
            Align(alignment: Alignment.centerLeft, child: action!),
          ],
        ],
      ),
    );
  }
}
