import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Tableau d'affichage — le motif signature du site : grande marque monospace sur
/// fond encre, gagnant souligné en volt. Un match se déclare en désignant le vainqueur :
/// on montre donc une coche, une croix ou un signe égal, jamais un chiffre — les 1-0 rangés
/// en base sont une convention interne du moteur de règlement.
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


  /// Symbole affiché pour chaque camp, déduit de l'issue rangée par le serveur.
  String _symbole(int? moi, int? lui) {
    if (moi == null || lui == null) return '–';
    if (moi == lui) return '=';
    return moi > lui ? '✓' : '✗';
  }

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
              Expanded(
                child: _Cote(
                  nom: joueur1,
                  texte: _symbole(score1, score2),
                  gagnant: gagnant == 1,
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  'vs',
                  style: Typo.chiffres(
                    taille: 24,
                    poids: 400,
                    couleur: Couleurs.craie.withValues(alpha: 0.4),
                  ),
                ),
              ),
              Expanded(
                child: _Cote(
                  nom: joueur2,
                  texte: _symbole(score2, score1),
                  gagnant: gagnant == 2,
                ),
              ),
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
  const _Cote({required this.nom, required this.texte, required this.gagnant});

  final String nom;
  /// Déjà mis en forme par le parent : un chiffre, ou un symbole pour un jeu sans score.
  final String texte;
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
            texte,
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
