import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import 'bouton.dart';

/// Confirmation avant une action engageante ou irréversible : annuler un défi,
/// rejoindre (bloquer une mise), supprimer un identifiant, se déconnecter.
///
/// Feuille inférieure plutôt que boîte de dialogue centrée : les deux boutons
/// tombent sous le pouce, et le texte a la place d'expliquer la conséquence
/// financière — c'est le point important sur une plateforme où l'on mise.
Future<bool> confirmer(
  BuildContext context, {
  required String titre,
  required String message,
  String libelleConfirmer = 'Confirmer',
  String libelleAnnuler = 'Annuler',
  bool destructif = false,
  IconData? icone,
}) async {
  final reponse = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: destructif ? Couleurs.perteFond : Couleurs.vertPale,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    icone ?? (destructif ? Icons.warning_amber_outlined : Icons.help_outline),
                    color: destructif ? Couleurs.perte : Couleurs.vert,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(titre, style: Typo.h3)),
              ],
            ),
            const SizedBox(height: 14),
            Text(message, style: Typo.legende.copyWith(color: Couleurs.muet)),
            const SizedBox(height: 22),
            Bouton(
              libelle: libelleConfirmer,
              bloc: true,
              taille: TailleBouton.lg,
              variante: destructif ? VarianteBouton.danger : VarianteBouton.volt,
              onPressed: () => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: 10),
            Bouton(
              libelle: libelleAnnuler,
              bloc: true,
              variante: VarianteBouton.secondaire,
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    ),
  );
  return reponse ?? false;
}
