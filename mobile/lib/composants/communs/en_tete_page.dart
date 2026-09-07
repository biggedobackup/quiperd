import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// En-tête d'écran : surtitre vert, titre en Unbounded capitales, description.
/// Même gabarit que `EnTetePage` du web, pour que les deux clients se lisent de
/// la même façon.
class EnTetePage extends StatelessWidget {
  const EnTetePage({
    super.key,
    required this.titre,
    this.surtitre,
    this.description,
    this.action,
  });

  final String titre;
  final String? surtitre;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (surtitre != null) ...[
          Text(surtitre!.toUpperCase(), style: Typo.etiquette.copyWith(color: Couleurs.vert)),
          const SizedBox(height: 8),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              // `text-h1` plutôt que `display` : « PLATEFORMES » en Unbounded 40
              // déborde des 343 px utiles d'un écran de 375.
              child: Text(titre, style: Typo.h1),
            ),
            if (action != null) ...[const SizedBox(width: 12), action!],
          ],
        ),
        if (description != null) ...[
          const SizedBox(height: 10),
          Text(description!, style: Typo.legende.copyWith(color: Couleurs.muet)),
        ],
      ],
    );
  }
}

/// Titre de section avec, à droite, un lien « tout voir ».
class TitreSection extends StatelessWidget {
  const TitreSection({super.key, required this.titre, this.lien, this.onLien});

  final String titre;
  final String? lien;
  final VoidCallback? onLien;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(child: Text(titre, style: Typo.h3)),
          if (lien != null)
            TextButton(
              onPressed: onLien,
              style: TextButton.styleFrom(
                minimumSize: const Size(0, 44),
                foregroundColor: Couleurs.vert,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(lien!.toUpperCase(),
                      style: Typo.etiquette.copyWith(color: Couleurs.vert, fontSize: 10)),
                  const Icon(Icons.chevron_right, size: 16),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
