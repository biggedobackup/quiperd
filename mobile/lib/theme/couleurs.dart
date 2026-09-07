import 'package:flutter/material.dart';

/// Palette de QUI PERD — transcription littérale du bloc `@theme` de
/// `frontend/src/styles/app.css`. C'est la SEULE source de couleurs de
/// l'application : aucune valeur hexadécimale n'est écrite dans un widget.
///
/// Fond blanc, vert et noir comme couleurs d'identité ; rouge et ambre sont
/// sémantiques (perte, attente). Aucun dégradé nulle part, aucun thème sombre.
class Couleurs {
  const Couleurs._();

  /// Noir : texte principal, blocs forts (carte de solde, tableau de score, barre basse).
  static const Color encre = Color(0xFF0E0F12);

  /// Noir garanti quel que soit le contexte (texte posé sur du volt).
  static const Color nuit = Color(0xFF0E0F12);

  /// Fond des écrans : blanc pur.
  static const Color craie = Color(0xFFFFFFFF);

  /// Cartes, champs, feuilles : blanc, séparé du fond par un trait et non par une teinte.
  static const Color papier = Color(0xFFFFFFFF);

  /// Seule surface discrète autorisée (en-tête de tableau, pied de carte, appui).
  static const Color gris = Color(0xFFF4F4F5);

  /// Vert d'action : 5,0:1 sur blanc, donc lisible en petit corps. TOUJOURS avec du texte blanc.
  static const Color vert = Color(0xFF15803D);

  /// Appui d'un bouton vert, panneau d'appel.
  static const Color vertSombre = Color(0xFF14532D);

  /// Fond de badge, pastille discrète.
  static const Color vertPale = Color(0xFFEAF7EF);

  /// Surface de section, très légèrement froide — jamais perçue comme une couleur.
  static const Color ardoise = Color(0xFFF6F8F7);

  /// Vert vif : surlignages et accents portant du texte NOIR.
  static const Color volt = Color(0xFF22C55E);
  static const Color voltFond = Color(0xFFE9F9EF);

  /// Montants crédités, succès.
  static const Color gain = Color(0xFF15803D);
  static const Color gainFond = Color(0xFFE9F9EF);

  /// Montants débités, perte, actions destructrices.
  static const Color perte = Color(0xFFB91C1C);
  static const Color perteFond = Color(0xFFFDECEC);

  /// En attente, preuve exigée, litige en cours.
  static const Color alerte = Color(0xFFA16207);
  static const Color alerteFond = Color(0xFFFDF6E3);

  /// Statut « en cours » : gris foncé, jamais de bleu.
  static const Color info = Color(0xFF374151);
  static const Color infoFond = Color(0xFFF4F4F5);

  /// Texte secondaire, légendes (AA sur blanc).
  static const Color muet = Color(0xFF6B7280);

  /// Séparateurs fins, bordures de carte et de champ.
  static const Color trait = Color(0xFFE4E4E7);

  /// Voile des feuilles et boîtes de dialogue.
  static const Color voile = Color(0x8C0E0F12);
}
