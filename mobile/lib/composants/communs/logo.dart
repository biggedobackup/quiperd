import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Logotype QUI PERD : un carré noir portant « QP » en monospace, suivi du nom
/// en Unbounded capitales. Aucun dégradé, aucune image — le logo est dessiné.
class Logo extends StatelessWidget {
  const Logo({super.key, this.taille = 28, this.clair = false, this.marqueSeule = false});

  final double taille;

  /// Posé sur un fond encre.
  final bool clair;

  /// N'affiche que le carré (barres étroites, écrans compacts).
  final bool marqueSeule;

  @override
  Widget build(BuildContext context) {
    final fond = clair ? Couleurs.craie : Couleurs.encre;
    final encreTexte = clair ? Couleurs.encre : Couleurs.craie;

    final marque = Container(
      width: taille,
      height: taille,
      decoration: BoxDecoration(
        color: fond,
        borderRadius: BorderRadius.circular(taille * 0.28),
      ),
      alignment: Alignment.center,
      child: Text(
        'QP',
        style: Typo.chiffres(taille: taille * 0.42, poids: 700, couleur: encreTexte),
      ),
    );

    if (marqueSeule) return marque;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        marque,
        SizedBox(width: taille * 0.34),
        Text(
          'QUI PERD',
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
