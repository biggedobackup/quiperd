import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// État vide explicite : jamais une liste qui reste blanche sans explication.
/// Chaque état vide dit ce qui manque ET ce que le joueur peut faire.
class EtatVide extends StatelessWidget {
  const EtatVide({
    super.key,
    required this.icone,
    required this.titre,
    this.description,
    this.action,
  });

  final IconData icone;
  final String titre;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Couleurs.trait),
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: Couleurs.vertPale,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icone, color: Couleurs.vert, size: 26),
          ),
          const SizedBox(height: 16),
          Text(titre, style: Typo.h3, textAlign: TextAlign.center),
          if (description != null) ...[
            const SizedBox(height: 8),
            Text(
              description!,
              style: Typo.legende.copyWith(color: Couleurs.muet),
              textAlign: TextAlign.center,
            ),
          ],
          if (action != null) ...[
            const SizedBox(height: 20),
            action!,
          ],
        ],
      ),
    );
  }
}
