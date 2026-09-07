import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Logotype Défis en Ligne : le « D » couronné à la manette, suivi du nom en Unbounded
/// capitales — « Défis en » dans la couleur du texte, « Ligne » en vert.
///
/// L'image est le calque avant de l'icône d'application (`ic_launcher_foreground`), en PNG
/// transparent : le même dessin sur l'écran d'accueil du téléphone et dans l'application, et
/// il se pose aussi bien sur fond clair que sur fond encre. Ce calque réserve la marge de
/// sécurité des icônes adaptatives Android — d'où le facteur d'échelle, qui compense ce vide
/// pour que le logo pèse visuellement autant que le texte à côté.
class Logo extends StatelessWidget {
  const Logo({super.key, this.taille = 28, this.clair = false, this.marqueSeule = false});

  final double taille;

  /// Posé sur un fond encre.
  final bool clair;

  /// N'affiche que le dessin (barres étroites, écrans compacts).
  final bool marqueSeule;

  @override
  Widget build(BuildContext context) {
    final marque = Image.asset(
      'assets/images/logo.png',
      width: taille * 1.5,
      height: taille * 1.5,
      filterQuality: FilterQuality.medium,
      // Le nom reste annoncé par le texte à côté ; en marque seule, on l'annonce ici.
      semanticLabel: marqueSeule ? 'Défis en Ligne' : null,
      excludeFromSemantics: !marqueSeule,
    );

    if (marqueSeule) return marque;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        marque,
        SizedBox(width: taille * 0.18),
        Text.rich(
          TextSpan(
            children: [
              const TextSpan(text: 'Défis en '),
              TextSpan(text: 'Ligne', style: TextStyle(color: Couleurs.vert)),
            ],
          ),
          style: Typo.etiquette.copyWith(
            fontSize: taille * 0.55,
            letterSpacing: taille * 0.06,
            color: clair ? Couleurs.craie : Couleurs.encre,
          ),
        ),
      ],
    );
  }
}
