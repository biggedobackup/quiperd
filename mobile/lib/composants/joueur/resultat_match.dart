import 'package:flutter/material.dart';

import '../../modeles/match_defi.modele.dart';
import '../../noyau/format.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Détail d'un partage après un match nul (événement `match.partage`).
class DetailPartage {
  const DetailPartage({required this.rendu, required this.commission});
  final String rendu;
  final String commission;
}

/// Détail d'un abandon : l'échéance de confirmation est passée, la victoire
/// revient au joueur qui avait déclaré (événement `match.abandon`).
class DetailAbandon {
  const DetailAbandon({required this.gagnantId, required this.motif});
  final String gagnantId;
  final String motif;
}

/// Bandeau de fin de match : ce que le joueur a gagné ou perdu, et pourquoi.
///
/// Le montant du gain n'est jamais recalculé ici : il arrive avec l'événement
/// `match.termine` ou reste absent, auquel cas on ne l'invente pas.
class ResultatMatch extends StatelessWidget {
  const ResultatMatch({
    super.key,
    required this.match,
    required this.moiId,
    required this.nomAdversaire,
    this.gain,
    this.partage,
    this.abandon,
  });

  final MatchDefi match;
  final String moiId;
  final String nomAdversaire;
  final String? gain;
  final DetailPartage? partage;
  final DetailAbandon? abandon;

  @override
  Widget build(BuildContext context) {
    final partageEnCours = partage != null;
    final gagne = match.gagnantId == null ? null : match.gagnantId == moiId;

    final (String titre, String texte, Color couleur, IconData icone) = switch ((
      partageEnCours,
      gagne
    )) {
      (true, _) => (
          'Mise partagée',
          'Match nul : chaque joueur récupère ${formatMontant(partage!.rendu, match.devise)}, '
              'commission de ${formatMontant(partage!.commission, match.devise)} déduite.',
          Couleurs.info,
          Icons.balance,
        ),
      (false, true) => (
          'Vous avez gagné',
          gain != null
              ? '${formatMontant(gain, match.devise)} crédités sur votre solde disponible.'
              : 'Le gain a été crédité sur votre solde disponible.',
          Couleurs.gain,
          Icons.emoji_events,
        ),
      (false, false) => (
          'Vous avez perdu',
          'Votre mise de ${formatMontant(match.montantMise, match.devise)} revient à $nomAdversaire.',
          Couleurs.perte,
          Icons.sentiment_dissatisfied_outlined,
        ),
      _ => (
          'Match terminé',
          'Le règlement a été effectué par la plateforme.',
          Couleurs.info,
          Icons.flag_outlined,
        ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: couleur == Couleurs.gain
            ? Couleurs.gainFond
            : couleur == Couleurs.perte
                ? Couleurs.perteFond
                : Couleurs.infoFond,
        border: Border.all(color: couleur),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icone, color: couleur, size: 22),
              const SizedBox(width: 10),
              Expanded(child: Text(titre, style: Typo.h3.copyWith(color: couleur))),
            ],
          ),
          const SizedBox(height: 8),
          Text(texte, style: Typo.legende.copyWith(color: Couleurs.encre)),
          if (abandon != null) ...[
            const SizedBox(height: 10),
            Text(
              abandon!.motif.isEmpty
                  ? 'Le délai de réponse de l’adversaire est écoulé.'
                  : abandon!.motif,
              style: Typo.petit,
            ),
          ],
          if (match.dateFin != null) ...[
            const SizedBox(height: 10),
            Text('Réglé le ${formatDateHeure(match.dateFin)}', style: Typo.petit),
          ],
        ],
      ),
    );
  }
}
