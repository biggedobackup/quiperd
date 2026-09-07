import 'package:flutter/material.dart';

import '../../../noyau/format.dart';
import '../../../theme/couleurs.dart';
import '../../../theme/typographie.dart';
import '../../communs/bouton.dart';
import '../compte_a_rebours.dart';

/// Choix après un match nul déclaré des deux côtés.
///
/// Chaque option annonce sa **conséquence financière** : rejouer ne déplace pas
/// un franc, partager rend à chacun sa mise moins la commission. Sans cela, le
/// joueur choisit à l'aveugle sur une décision qui touche son argent.
Future<String?> ouvrirChoixNul(
  BuildContext context, {
  required String montantMise,
  required String devise,
  required double tauxCommission,
  required int manche,
  String? choixAdverse,
  String? echeance,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) {
      final mise = versNombre(montantMise);
      final total = mise * 2;
      final rendu = (total - total * tauxCommission) / 2;

      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Match nul — que faire ?', style: Typo.h3),
              const SizedBox(height: 4),
              Text(
                choixAdverse == null
                    ? 'Votre adversaire n’a pas encore choisi.'
                    : 'Votre adversaire a choisi « ${choixAdverse == 'rejouer' ? 'rejouer' : 'partager'} ».',
                style: Typo.petit,
              ),
              if (echeance != null) ...[
                const SizedBox(height: 16),
                BlocCompteARebours(
                  echeance: echeance,
                  consequence: 'Sans choix des deux côtés, l’escrow est partagé automatiquement.',
                ),
              ],
              const SizedBox(height: 20),
              _Option(
                titre: 'Rejouer la manche',
                detail: 'Manche ${manche + 1}. Aucun mouvement d’argent : les deux mises '
                    'restent en séquestre.',
                icone: Icons.replay,
                accent: Couleurs.vert,
                onTap: () => Navigator.of(context).pop('rejouer'),
              ),
              const SizedBox(height: 12),
              _Option(
                titre: 'Partager la mise',
                detail: 'Chacun récupère ${formatMontant(rendu, devise)} — '
                    'commission de ${formatPourcentage(tauxCommission)} déduite. Le match est clos.',
                icone: Icons.balance,
                accent: Couleurs.alerte,
                onTap: () => Navigator.of(context).pop('partager'),
              ),
              const SizedBox(height: 16),
              Bouton(
                libelle: 'Plus tard',
                bloc: true,
                variante: VarianteBouton.secondaire,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _Option extends StatelessWidget {
  const _Option({
    required this.titre,
    required this.detail,
    required this.icone,
    required this.accent,
    required this.onTap,
  });

  final String titre;
  final String detail;
  final IconData icone;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Couleurs.papier,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            border: Border.all(color: Couleurs.trait),
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icone, size: 20, color: accent),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(titre, style: Typo.corpsFort),
                    const SizedBox(height: 4),
                    Text(detail, style: Typo.petit),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
