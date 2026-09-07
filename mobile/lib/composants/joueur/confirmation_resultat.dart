import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../communs/bouton.dart';
import 'compte_a_rebours.dart';

/// Bloc d'action prioritaire : l'adversaire a déclaré, à moi de répondre.
///
/// Deux actions claires, et une seule qui engage : **« Confirmer : j'ai gagné »**
/// (`POST /matchs/:id/confirmation`, sans corps — l'issue confirmée est celle que détient le
/// serveur, le client ne peut donc rien falsifier) ou « Annoncer l'inverse », qui rouvre la
/// feuille de déclaration.
class ConfirmationResultat extends StatelessWidget {
  const ConfirmationResultat({
    super.key,
    required this.nomMoi,
    required this.nomAdversaire,
    required this.scoreMoi,
    required this.scoreAdversaire,
    required this.onConfirmer,
    required this.onProposer,
    this.echeance,
    this.surFinChrono,
    this.chargement = false,
  });

  final String nomMoi;
  final String nomAdversaire;

  /// Issue vue de MON côté (miroir de la déclaration adverse). Le serveur la range en
  /// 1-0 / 0-1 / 0-0 : convention interne, jamais montrée telle quelle au joueur.
  final int scoreMoi;
  final int scoreAdversaire;

  final VoidCallback onConfirmer;
  final VoidCallback onProposer;
  final String? echeance;
  final VoidCallback? surFinChrono;
  final bool chargement;


  bool get _jeGagne => scoreMoi > scoreAdversaire;
  bool get _nul => scoreMoi == scoreAdversaire;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: Couleurs.encre, borderRadius: BorderRadius.circular(20)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'RÉSULTAT À CONFIRMER',
            style: Typo.etiquette.copyWith(color: Couleurs.volt, fontSize: 10),
          ),
          const SizedBox(height: 10),
          Text(
            '$nomAdversaire a déclaré le résultat.',
            style: Typo.corpsFort.copyWith(color: Couleurs.craie),
          ),
          const SizedBox(height: 4),
          Text(
            'Si c’est bien l’issue du match, confirmez : le règlement est immédiat, sans preuve ni arbitre.',
            style: Typo.legende.copyWith(color: Couleurs.craie.withValues(alpha: 0.75)),
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: Couleurs.craie.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              children: [
                Text(
                  _nul ? 'MATCH NUL' : (_jeGagne ? nomMoi : nomAdversaire),
                  textAlign: TextAlign.center,
                  style: Typo.h3.copyWith(color: Couleurs.volt),
                ),
                const SizedBox(height: 4),
                Text(
                  'vous — $nomAdversaire',
                  style: Typo.petit.copyWith(color: Couleurs.craie.withValues(alpha: 0.6)),
                ),
              ],
            ),
          ),
          if (echeance != null) ...[
            const SizedBox(height: 16),
            BlocCompteARebours(
              echeance: echeance!,
              consequence: 'Sans réponse, la victoire revient au joueur qui a déclaré.',
              surFin: surFinChrono,
              clair: true,
            ),
          ],
          const SizedBox(height: 18),
          Bouton(
            libelle: _nul
                ? 'Confirmer le match nul'
                : (_jeGagne ? 'Confirmer : j’ai gagné' : 'Confirmer : j’ai perdu'),
            bloc: true,
            taille: TailleBouton.lg,
            variante: VarianteBouton.volt,
            icone: Icons.check,
            chargement: chargement,
            onPressed: onConfirmer,
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton(
              onPressed: chargement ? null : onProposer,
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: Couleurs.craie.withValues(alpha: 0.35)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: Text(
                'ANNONCER L’INVERSE',
                style: Typo.etiquette.copyWith(color: Couleurs.craie, fontSize: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
