import 'package:flutter/material.dart';

import '../../modeles/defi.modele.dart';
import '../../noyau/catalogue.dart';
import '../../noyau/format.dart';
import '../../noyau/statuts.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../communs/badge_statut.dart';

/// Carte d'un défi de l'arène : catégorie, jeu, plateforme, mise en gros
/// chiffres, créateur et compte à rebours d'expiration.
class CarteDefi extends StatelessWidget {
  const CarteDefi({super.key, required this.defi, required this.mien, this.onTap});

  final Defi defi;

  /// Un joueur ne rejoint pas son propre défi : la carte le dit clairement.
  final bool mien;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final categorie = decrireCategorie(defi.jeuCategorie);

    return Material(
      color: Couleurs.papier,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Couleurs.trait),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: Couleurs.vertPale,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(categorie.icone, size: 18, color: Couleurs.vert),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          defi.jeuNom,
                          style: Typo.corpsFort,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${categorie.libelle} · ${defi.plateformeNom}',
                          style: Typo.petit,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  BadgeStatut(famille: FamilleStatut.defi, valeur: defi.statut),
                ],
              ),
              const SizedBox(height: 14),
              // Ligne de perforation : le motif « ticket de match » du site.
              const _Perforation(),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('MISE PAR JOUEUR',
                            style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
                        const SizedBox(height: 4),
                        Text(
                          formatMontant(defi.montantMise, defi.devise),
                          style: Typo.chiffres(taille: 22, poids: 700),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        mien ? 'Votre défi' : defi.createurNom,
                        style: Typo.legendeForte.copyWith(
                          color: mien ? Couleurs.vert : Couleurs.encre,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'créé ${formatDateRelative(defi.dateCreation)}',
                        style: Typo.petit,
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Ligne de perforation du motif « ticket de match » : des tirets pleins, jamais
/// un dégradé ni une ombre floue.
class _Perforation extends StatelessWidget {
  const _Perforation();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, contraintes) {
        final tirets = (contraintes.maxWidth / 8).floor();
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(
            tirets,
            (_) => Container(width: 4, height: 2, color: Couleurs.trait),
          ),
        );
      },
    );
  }
}
