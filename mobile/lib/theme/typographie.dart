import 'package:flutter/material.dart';

import 'couleurs.dart';

/// Échelle typographique de QUI PERD — déclarée UNE seule fois, jamais improvisée
/// écran par écran.
///
/// Identité identique au site : Unbounded pour les titres (en capitales), Manrope
/// pour le texte, JetBrains Mono pour tous les chiffres. Les trois fichiers sont
/// variables : la graisse se demande par `fontVariations`, en doublant avec
/// `fontWeight` pour que le repli système reste correct si la police manque.
class Typo {
  const Typo._();

  static const String familleTitre = 'Unbounded';
  static const String familleTexte = 'Manrope';
  static const String familleMono = 'JetBrainsMono';

  static List<FontVariation> _poids(double valeur) => [FontVariation('wght', valeur)];

  /// Les chiffres s'alignent en colonne (montants, scores, minuteurs).
  static const List<FontFeature> _tabulaire = [FontFeature.tabularFigures()];

  // ── Titres (Unbounded, capitales) ────────────────────────────────────────────

  /// 40 — le plus grand titre du mobile. Le `display` 72 px du web n'a pas sa
  /// place sur 375 px de large : « PLATEFORMES » y déborderait.
  static const TextStyle display = TextStyle(
    fontFamily: familleTitre,
    fontSize: 40,
    height: 1.05,
    letterSpacing: -0.8,
    fontWeight: FontWeight.w700,
    fontVariations: [FontVariation('wght', 700)],
    color: Couleurs.encre,
  );

  static const TextStyle h1 = TextStyle(
    fontFamily: familleTitre,
    fontSize: 32,
    height: 1.1,
    letterSpacing: -0.64,
    fontWeight: FontWeight.w700,
    fontVariations: [FontVariation('wght', 700)],
    color: Couleurs.encre,
  );

  static const TextStyle h2 = TextStyle(
    fontFamily: familleTitre,
    fontSize: 24,
    height: 1.15,
    letterSpacing: -0.24,
    fontWeight: FontWeight.w700,
    fontVariations: [FontVariation('wght', 700)],
    color: Couleurs.encre,
  );

  static const TextStyle h3 = TextStyle(
    fontFamily: familleTitre,
    fontSize: 18,
    height: 1.3,
    letterSpacing: -0.18,
    fontWeight: FontWeight.w700,
    fontVariations: [FontVariation('wght', 700)],
    color: Couleurs.encre,
  );

  /// Petites capitales très espacées : surtitres, en-têtes de champ, onglets.
  static const TextStyle etiquette = TextStyle(
    fontFamily: familleTitre,
    fontSize: 11,
    height: 1.1,
    letterSpacing: 1.3,
    fontWeight: FontWeight.w700,
    fontVariations: [FontVariation('wght', 700)],
    color: Couleurs.encre,
  );

  // ── Texte (Manrope) ──────────────────────────────────────────────────────────

  static const TextStyle corps = TextStyle(
    fontFamily: familleTexte,
    fontSize: 16,
    height: 1.6,
    fontWeight: FontWeight.w400,
    fontVariations: [FontVariation('wght', 400)],
    color: Couleurs.encre,
  );

  static const TextStyle corpsFort = TextStyle(
    fontFamily: familleTexte,
    fontSize: 16,
    height: 1.5,
    fontWeight: FontWeight.w700,
    fontVariations: [FontVariation('wght', 700)],
    color: Couleurs.encre,
  );

  static const TextStyle legende = TextStyle(
    fontFamily: familleTexte,
    fontSize: 13,
    height: 1.4,
    fontWeight: FontWeight.w400,
    fontVariations: [FontVariation('wght', 400)],
    color: Couleurs.encre,
  );

  static const TextStyle legendeForte = TextStyle(
    fontFamily: familleTexte,
    fontSize: 13,
    height: 1.4,
    fontWeight: FontWeight.w700,
    fontVariations: [FontVariation('wght', 700)],
    color: Couleurs.encre,
  );

  static const TextStyle petit = TextStyle(
    fontFamily: familleTexte,
    fontSize: 12,
    height: 1.35,
    fontWeight: FontWeight.w400,
    fontVariations: [FontVariation('wght', 400)],
    color: Couleurs.muet,
  );

  // ── Chiffres (JetBrains Mono, tabulaires) ────────────────────────────────────

  /// Base monospace : tout montant, score, référence, compteur ou minuteur.
  static TextStyle chiffres({
    double taille = 16,
    double poids = 700,
    Color couleur = Couleurs.encre,
    double? hauteur,
  }) =>
      TextStyle(
        fontFamily: familleMono,
        fontSize: taille,
        height: hauteur,
        fontWeight: poids >= 700 ? FontWeight.w700 : FontWeight.w400,
        fontVariations: _poids(poids),
        fontFeatures: _tabulaire,
        color: couleur,
      );
}
