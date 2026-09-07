import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'couleurs.dart';
import 'typographie.dart';

/// Thème unique de l'application : **clair, fond blanc**.
///
/// Aucun `ThemeData.dark()`, aucune lecture de `platformBrightness`, aucune
/// bascule : le rendu sombre a été explicitement rejeté par le propriétaire.
/// Le `ColorScheme` est construit à la main plutôt que par `fromSeed`, qui
/// fabriquerait des teintes dérivées absentes de la charte.
ThemeData construireTheme() {
  const schema = ColorScheme(
    brightness: Brightness.light,
    primary: Couleurs.vert,
    onPrimary: Couleurs.craie,
    primaryContainer: Couleurs.vertPale,
    onPrimaryContainer: Couleurs.vertSombre,
    secondary: Couleurs.encre,
    onSecondary: Couleurs.craie,
    secondaryContainer: Couleurs.gris,
    onSecondaryContainer: Couleurs.encre,
    tertiary: Couleurs.volt,
    onTertiary: Couleurs.nuit,
    error: Couleurs.perte,
    onError: Couleurs.craie,
    errorContainer: Couleurs.perteFond,
    onErrorContainer: Couleurs.perte,
    surface: Couleurs.craie,
    onSurface: Couleurs.encre,
    surfaceContainerHighest: Couleurs.gris,
    onSurfaceVariant: Couleurs.muet,
    outline: Couleurs.trait,
    outlineVariant: Couleurs.trait,
    shadow: Couleurs.encre,
    scrim: Couleurs.voile,
    inverseSurface: Couleurs.encre,
    onInverseSurface: Couleurs.craie,
    inversePrimary: Couleurs.volt,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: schema,
    scaffoldBackgroundColor: Couleurs.craie,
    canvasColor: Couleurs.craie,
    fontFamily: Typo.familleTexte,
    splashFactory: InkSparkle.splashFactory,
    // Le vert d'action est foncé : sur blanc, une ondulation trop marquée salit
    // les cartes. On garde un retour discret mais visible.
    highlightColor: Couleurs.vertPale,
    textTheme: const TextTheme(
      displayLarge: Typo.display,
      headlineLarge: Typo.h1,
      headlineMedium: Typo.h2,
      titleLarge: Typo.h3,
      bodyLarge: Typo.corps,
      bodyMedium: Typo.legende,
      bodySmall: Typo.petit,
      labelLarge: Typo.etiquette,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Couleurs.craie,
      foregroundColor: Couleurs.encre,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: Typo.h3,
      // Barre d'état sombre sur fond blanc.
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: Couleurs.trait,
      thickness: 1,
      space: 1,
    ),
    cardTheme: const CardThemeData(
      color: Couleurs.papier,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Couleurs.papier,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: Couleurs.trait,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: Couleurs.papier,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(20)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: Couleurs.encre,
      contentTextStyle: Typo.legende.copyWith(color: Couleurs.craie),
      behavior: SnackBarBehavior.floating,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)),
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: Couleurs.vert,
      linearTrackColor: Couleurs.gris,
      circularTrackColor: Couleurs.gris,
    ),
    // `RefreshIndicator` : geste de l'utilisateur, jamais une minuterie.
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Couleurs.papier,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      hintStyle: Typo.corps.copyWith(color: Couleurs.muet),
      labelStyle: Typo.legende.copyWith(color: Couleurs.muet),
      errorStyle: Typo.petit.copyWith(color: Couleurs.perte, fontWeight: FontWeight.w700),
      border: _bordure(Couleurs.trait),
      enabledBorder: _bordure(Couleurs.trait),
      focusedBorder: _bordure(Couleurs.vert, epaisseur: 2),
      errorBorder: _bordure(Couleurs.perte),
      focusedErrorBorder: _bordure(Couleurs.perte, epaisseur: 2),
      disabledBorder: _bordure(Couleurs.trait),
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: Couleurs.muet,
      textColor: Couleurs.encre,
      minVerticalPadding: 12,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: const BoxDecoration(
        color: Couleurs.encre,
        borderRadius: BorderRadius.all(Radius.circular(8)),
      ),
      textStyle: Typo.petit.copyWith(color: Couleurs.craie),
    ),
  );
}

OutlineInputBorder _bordure(Color couleur, {double epaisseur = 1}) => OutlineInputBorder(
      borderRadius: const BorderRadius.all(Radius.circular(12)),
      borderSide: BorderSide(color: couleur, width: epaisseur),
    );
