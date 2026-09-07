import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Tableau de score — le motif signature du site : gros chiffres monospace sur
/// fond encre, gagnant souligné en volt.
class TableauScore extends StatelessWidget {
  const TableauScore({
    super.key,
    required this.joueur1,
    required this.joueur2,
    required this.score1,
    required this.score2,
    this.gagnant,
    this.etiquette,
    this.sousTitre,
    this.enDirect = false,
  });

  final String joueur1;
  final String joueur2;
  final int? score1;
  final int? score2;

  /// 1, 2 ou `null` tant que le match n'est pas tranché.
  final int? gagnant;
  final String? etiquette;
  final String? sousTitre;
  final bool enDirect;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      decoration: BoxDecoration(
        color: Couleurs.encre,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (etiquette != null)
                Text(
                  etiquette!.toUpperCase(),
                  style: Typo.etiquette.copyWith(
                    color: Couleurs.craie.withValues(alpha: 0.6),
                    fontSize: 10,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(child: _Cote(nom: joueur1, score: score1, gagnant: gagnant == 1)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  '—',
                  style: Typo.chiffres(
                    taille: 24,
                    poids: 400,
                    couleur: Couleurs.craie.withValues(alpha: 0.4),
                  ),
                ),
              ),
              Expanded(child: _Cote(nom: joueur2, score: score2, gagnant: gagnant == 2)),
            ],
          ),
          if (sousTitre != null) ...[
            const SizedBox(height: 14),
            Text(
              sousTitre!,
              textAlign: TextAlign.center,
              style: Typo.legende.copyWith(color: Couleurs.craie.withValues(alpha: 0.75)),
            ),
          ],
        ],
      ),
    );
  }
}

class _Cote extends StatelessWidget {
  const _Cote({required this.nom, required this.score, required this.gagnant});

  final String nom;
  final int? score;
  final bool gagnant;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          nom.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: Typo.etiquette.copyWith(
            color: gagnant ? Couleurs.volt : Couleurs.craie.withValues(alpha: 0.7),
            fontSize: 11,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          decoration: gagnant
              ? const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Couleurs.volt, width: 3)),
                )
              : null,
          padding: const EdgeInsets.only(bottom: 4),
          child: Text(
            score?.toString() ?? '–',
            style: Typo.chiffres(
              taille: 44,
              poids: 700,
              couleur: gagnant ? Couleurs.volt : Couleurs.craie,
              hauteur: 1,
            ),
          ),
        ),
      ],
    );
  }
}
