import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Chronologie du match : où en est-on dans la machine à états du backend.
///
/// Les trois étapes affichées sont celles que le JOUEUR vit. Les branches
/// exceptionnelles (preuve, nul, litige) remplacent l'étape du milieu plutôt que
/// d'allonger la frise, pour rester lisible sur 375 px.
class ChronologieMatch extends StatelessWidget {
  const ChronologieMatch({super.key, required this.statut});

  final String statut;

  List<({String libelle, IconData icone})> get _etapes {
    final milieu = switch (statut) {
      'preuve_requise' => (libelle: 'Preuve exigée', icone: Icons.photo_camera_outlined),
      'nul_en_attente' => (libelle: 'Match nul', icone: Icons.balance),
      'litige' => (libelle: 'Arbitrage', icone: Icons.gavel_outlined),
      _ => (libelle: 'Déclaration', icone: Icons.edit_outlined),
    };
    return [
      (libelle: 'Match joué', icone: Icons.sports_esports_outlined),
      milieu,
      (libelle: 'Règlement', icone: Icons.emoji_events_outlined),
    ];
  }

  int get _indexCourant => switch (statut) {
        'en_cours' => 1,
        'preuve_requise' || 'nul_en_attente' || 'verification' || 'litige' => 1,
        'termine' => 2,
        _ => 0,
      };

  @override
  Widget build(BuildContext context) {
    final etapes = _etapes;
    return Row(
      children: List.generate(etapes.length * 2 - 1, (i) {
        if (i.isOdd) {
          final avant = i ~/ 2;
          return Expanded(
            child: Container(
              height: 2,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              color: avant < _indexCourant ? Couleurs.vert : Couleurs.trait,
            ),
          );
        }
        final index = i ~/ 2;
        final fait = index < _indexCourant;
        final courant = index == _indexCourant;
        final couleur = fait || courant ? Couleurs.vert : Couleurs.muet;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: courant ? Couleurs.vert : (fait ? Couleurs.vertPale : Couleurs.gris),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                fait ? Icons.check : etapes[index].icone,
                size: 16,
                color: courant ? Couleurs.craie : couleur,
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: 78,
              child: Text(
                etapes[index].libelle,
                textAlign: TextAlign.center,
                maxLines: 2,
                style: Typo.petit.copyWith(
                  color: fait || courant ? Couleurs.encre : Couleurs.muet,
                  fontWeight: courant ? FontWeight.w700 : FontWeight.w400,
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}
