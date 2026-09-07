import 'package:flutter/material.dart';

import '../../modeles/match_defi.modele.dart';
import '../../noyau/format.dart';
import '../../noyau/statuts.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../communs/badge_statut.dart';
import 'avatar_joueur.dart';
import 'compte_a_rebours.dart';

/// Carte d'un match dans « Mes matchs » et sur le tableau de bord : adversaire,
/// jeu, mise, statut et échéance en cours.
class CarteMatch extends StatelessWidget {
  const CarteMatch({super.key, required this.match, required this.moiId, this.onTap});

  final MatchDefi match;
  final String moiId;
  final VoidCallback? onTap;

  /// Ce que le chrono en cours signifie, dit en clair plutôt qu'en jargon.
  String? get _consequence => switch (match.echeanceType) {
        'confirmation' => 'pour confirmer',
        'preuve' => 'pour la preuve',
        'choix_nul' => 'pour choisir',
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    final gagne = match.gagnantId == null ? null : match.gagnantId == moiId;

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
                  // Le visage de l'adversaire vaut mieux qu'un pseudo seul : on voit à qui
                  // on joue dès la liste, sans ouvrir le match.
                  AvatarJoueur(
                    utilisateurId: match.adversaireDe(moiId),
                    pseudo: match.nomAdversaireDe(moiId),
                    photo: match.photoAdversaireDe(moiId),
                    taille: 30,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Face à ${match.nomAdversaireDe(moiId)}',
                      style: Typo.corpsFort,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  BadgeStatut(famille: FamilleStatut.match, valeur: match.statut),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${match.jeuNom} · ${match.plateformeNom}'
                '${match.manche > 1 ? ' · Manche ${match.manche}' : ''}',
                style: Typo.petit,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('MISE',
                            style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
                        const SizedBox(height: 2),
                        Text(
                          formatMontant(match.montantMise, match.devise),
                          style: Typo.chiffres(taille: 18, poids: 700),
                        ),
                      ],
                    ),
                  ),
                  // Même règle que l'écran de match : un score contesté ne
                  // s'affiche pas comme s'il était acquis.
                  if (match.gagnantId != null &&
                      match.scoreJoueur1 != null &&
                      match.scoreJoueur2 != null)
                    _Score(match: match, moiId: moiId, gagne: gagne)
                  else if (match.echeance != null && _consequence != null)
                    CompteARebours(
                      echeance: match.echeance!,
                      libelle: _consequence,
                      style: Typo.chiffres(taille: 13, poids: 700, couleur: Couleurs.alerte),
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

class _Score extends StatelessWidget {
  const _Score({required this.match, required this.moiId, required this.gagne});

  final MatchDefi match;
  final String moiId;
  final bool? gagne;

  @override
  Widget build(BuildContext context) {
    final jeSuisJ1 = match.joueur1Id == moiId;
    final scoreMoi = jeSuisJ1 ? match.scoreJoueur1 : match.scoreJoueur2;
    final scoreLui = jeSuisJ1 ? match.scoreJoueur2 : match.scoreJoueur1;
    final couleur = gagne == null
        ? Couleurs.encre
        : gagne!
            ? Couleurs.gain
            : Couleurs.perte;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text('$scoreMoi — $scoreLui', style: Typo.chiffres(taille: 20, poids: 700, couleur: couleur)),
        if (gagne != null)
          Text(
            gagne! ? 'Gagné' : 'Perdu',
            style: Typo.etiquette.copyWith(color: couleur, fontSize: 10),
          ),
      ],
    );
  }
}
