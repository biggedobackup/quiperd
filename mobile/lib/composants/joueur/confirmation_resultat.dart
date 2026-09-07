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

  /// Issue telle que le web l'annonce, à la lettre : « un match nul », « votre victoire »,
  /// « sa victoire ». Un joueur qui connaît le site doit lire ici exactement la même phrase.
  String get _issue => _nul ? 'un match nul' : (_jeGagne ? 'votre victoire' : 'sa victoire');

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
            'Résultat à confirmer'.toUpperCase(),
            style: Typo.etiquette.copyWith(color: Couleurs.volt, fontSize: 10),
          ),
          const SizedBox(height: 10),
          Text(
            '$nomAdversaire déclare $_issue',
            style: Typo.corpsFort.copyWith(color: Couleurs.craie),
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
                  (_nul ? 'Résultat déclaré' : 'Vainqueur déclaré').toUpperCase(),
                  style: Typo.etiquette.copyWith(
                    color: Couleurs.craie.withValues(alpha: 0.6),
                    fontSize: 10,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _nul ? 'MATCH NUL' : (_jeGagne ? '$nomMoi (vous)' : nomAdversaire),
                  textAlign: TextAlign.center,
                  style: Typo.h3.copyWith(color: Couleurs.volt),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Si c’est bien l’issue de la partie, confirmez : le match est réglé immédiatement, '
            'l’argent est versé, sans preuve ni arbitre. Sinon, annoncez l’inverse — une '
            'divergence fera basculer le match en preuve exigée.',
            style: Typo.legende.copyWith(color: Couleurs.craie.withValues(alpha: 0.75)),
          ),
          if (echeance != null) ...[
            const SizedBox(height: 16),
            BlocCompteARebours(
              echeance: echeance!,
              consequence:
                  'Sans réponse de votre part avant la fin du compte à rebours, le résultat déclaré fera foi.',
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
                'Déclarer un autre résultat'.toUpperCase(),
                style: Typo.etiquette.copyWith(color: Couleurs.craie, fontSize: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
