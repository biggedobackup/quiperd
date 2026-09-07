import 'package:flutter/material.dart';

import '../../../theme/couleurs.dart';
import '../../../theme/typographie.dart';
import '../../communs/bouton.dart';
import '../../communs/message.dart';

/// Ouverture d'un litige : le motif est obligatoire (3 caractères minimum côté
/// backend) et l'écran rappelle la conséquence — les deux mises restent bloquées
/// jusqu'à la décision de l'arbitre.
Future<String?> ouvrirLitige(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) => const _FeuilleLitige(),
  );
}

class _FeuilleLitige extends StatefulWidget {
  const _FeuilleLitige();

  @override
  State<_FeuilleLitige> createState() => _FeuilleLitigeState();
}

class _FeuilleLitigeState extends State<_FeuilleLitige> {
  final TextEditingController _motif = TextEditingController();

  @override
  void dispose() {
    _motif.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Ouvrir un litige', style: Typo.h3),
            const SizedBox(height: 12),
            const Encart(
              ton: TonMessage.attention,
              texte: 'Les deux mises restent bloquées jusqu’à la décision de l’arbitre. '
                  'Joignez une preuve depuis l’écran du match : elle appuiera votre demande.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _motif,
              maxLines: 4,
              maxLength: 500,
              style: Typo.corps,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Expliquez le désaccord : résultat annoncé, déconnexion, '
                    'refus de jouer…',
              ),
            ),
            const SizedBox(height: 8),
            Bouton(
              libelle: 'Ouvrir le litige',
              bloc: true,
              taille: TailleBouton.lg,
              variante: VarianteBouton.danger,
              icone: Icons.gavel_outlined,
              onPressed: _motif.text.trim().length < 3
                  ? null
                  : () => Navigator.of(context).pop(_motif.text.trim()),
            ),
            const SizedBox(height: 10),
            Bouton(
              libelle: 'Annuler',
              bloc: true,
              variante: VarianteBouton.secondaire,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
