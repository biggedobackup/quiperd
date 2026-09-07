import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../composants/communs/badge_statut.dart';
import '../composants/communs/bouton.dart';
import '../composants/communs/en_tete_page.dart';
import '../composants/communs/etat_vide.dart';
import '../composants/communs/indicateur_direct.dart';
import '../composants/communs/squelette.dart';
import '../modeles/litige.modele.dart';
import '../modeles/match_defi.modele.dart';
import '../noyau/format.dart';
import '../noyau/resultat.dart';
import '../noyau/statuts.dart';
import '../services/litiges.service.dart';
import '../services/matchs.service.dart';
import '../temps_reel/client_temps_reel.dart';
import '../temps_reel/evenements.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';
import 'matchs/detail_match.ecran.dart';

/// Mes litiges — vivants sans aucun rafraîchissement périodique.
///
/// `match.litige_ouvert` et `match.litige_resolu` circulent sur le salon de
/// CHAQUE match, pas sur le salon privé du joueur : l'écran s'abonne donc aux
/// salons des matchs concernés (ceux qui portent déjà un litige, plus les matchs
/// encore actifs sur lesquels un litige peut s'ouvrir pendant la lecture).
class LitigesEcran extends StatefulWidget {
  const LitigesEcran({super.key});

  @override
  State<LitigesEcran> createState() => _LitigesEcranState();
}

class _LitigesEcranState extends State<LitigesEcran> {
  /// Au-delà, on n'ouvre plus de salon : un joueur n'a jamais des dizaines de
  /// matchs vivants.
  static const int _maxSalons = 30;

  List<Litige> _litiges = const [];
  List<MatchDefi> _matchs = const [];
  bool _chargement = true;
  final Set<String> _recents = {};
  final Set<String> _salons = {};

  StreamSubscription<EvenementRecu>? _ecoute;
  /// Référence capturée à l'ouverture : `dispose()` ne doit jamais
  /// interroger l'arbre des widgets (assertion `_dependents.isEmpty`).
  late final ClientTempsReel _direct;
  int _derniereResynchro = 0;

  @override
  void initState() {
    super.initState();
    _charger();
    final direct = _direct = context.read<ClientTempsReel>();
    _derniereResynchro = direct.reconnexions;
    _ecoute = direct.surPlusieurs({
      Evenements.matchLitigeOuvert,
      Evenements.matchLitigeResolu,
    }).listen(_surEvenement);
    direct.addListener(_surEtatDirect);
  }

  @override
  void dispose() {
    _ecoute?.cancel();
    final direct = _direct;
    direct.removeListener(_surEtatDirect);
    if (_salons.isNotEmpty) direct.desabonner(_salons);
    super.dispose();
  }

  void _surEtatDirect() {
    final direct = _direct;
    if (!direct.enDirect || direct.reconnexions == _derniereResynchro) return;
    _derniereResynchro = direct.reconnexions;
    _charger();
  }

  void _synchroniserSalons() {
    final direct = _direct;
    final voulus = <String>{
      ..._litiges.map((l) => Salons.match(l.matchId)),
      ..._matchs.where((m) => m.vivant).map((m) => Salons.match(m.id)),
    }.take(_maxSalons).toSet();

    final aQuitter = _salons.difference(voulus);
    final aRejoindre = voulus.difference(_salons);
    if (aQuitter.isNotEmpty) direct.desabonner(aQuitter);
    if (aRejoindre.isNotEmpty) direct.abonner(aRejoindre);
    _salons
      ..removeAll(aQuitter)
      ..addAll(aRejoindre);
  }

  void _surEvenement(EvenementRecu e) {
    if (!mounted) return;
    final litigeId = '${e.charge['litigeId'] ?? ''}';
    if (litigeId.isEmpty) return;

    if (e.evenement == Evenements.matchLitigeOuvert) {
      final matchId = '${e.charge['matchId'] ?? ''}';
      if (_litiges.any((l) => l.id == litigeId)) return;
      setState(() {
        _litiges = [
          Litige(
            id: litigeId,
            dateCreation: e.horodatage,
            matchId: matchId,
            ouvertParId: null,
            motif: '${e.charge['motif'] ?? ''}',
            statut: 'en_cours',
            decision: '',
            dateResolution: null,
          ),
          ..._litiges,
        ];
        _recents.add(litigeId);
      });
      return;
    }

    setState(() {
      _litiges = _litiges
          .map((l) => l.id == litigeId
              ? l.copieAvec(
                  statut: 'resolu',
                  decision: '${e.charge['decision'] ?? ''}',
                  dateResolution: e.horodatage,
                )
              : l)
          .toList();
      _recents.add(litigeId);
    });
  }

  Future<void> _charger() async {
    if (!mounted) return;
    setState(() => _chargement = true);
    final resultats = await Future.wait([
      LitigesService.mesLitiges(),
      MatchsService.lister(),
    ]);
    if (!mounted) return;
    final rLitiges = resultats[0];
    if (rLitiges is Succes<List<Litige>>) _litiges = rLitiges.donnees;
    final rMatchs = resultats[1];
    if (rMatchs is Succes<List<MatchDefi>>) _matchs = rMatchs.donnees;
    setState(() => _chargement = false);
    _synchroniserSalons();
  }

  MatchDefi? _matchDe(String id) => _matchs.where((m) => m.id == id).firstOrNull;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(
        title: const Text('Mes litiges'),
        actions: const [
          Padding(padding: EdgeInsets.only(right: 16), child: Center(child: IndicateurDirect())),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _charger,
          color: Couleurs.vert,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              const EnTetePage(
                surtitre: 'Arbitrage',
                titre: 'Mes litiges',
                description: 'Tant qu’un litige est en cours, les deux mises restent bloquées. '
                    'L’arbitre règle le match au gagnant ou rend leur mise aux deux joueurs, '
                    'moins la commission.',
              ),
              const SizedBox(height: 20),
              if (_chargement)
                const SqueletteDiffere(child: SqueletteCartes(nombre: 2, hauteur: 150))
              else if (_litiges.isEmpty)
                const EtatVide(
                  icone: Icons.gavel_outlined,
                  titre: 'Aucun litige',
                  description: 'Tant mieux : vos matchs se règlent sans arbitre.',
                )
              else
                ..._litiges.map((l) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _CarteLitige(
                        litige: l,
                        match: _matchDe(l.matchId),
                        recent: _recents.contains(l.id),
                        onVoirMatch: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => DetailMatchEcran(matchId: l.matchId),
                          ),
                        ),
                      ),
                    )),
            ],
          ),
        ),
      ),
    );
  }
}

class _CarteLitige extends StatelessWidget {
  const _CarteLitige({
    required this.litige,
    required this.match,
    required this.recent,
    required this.onVoirMatch,
  });

  final Litige litige;
  final MatchDefi? match;
  final bool recent;
  final VoidCallback onVoirMatch;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: recent ? Couleurs.vert : Couleurs.trait),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              BadgeStatut(famille: FamilleStatut.litige, valeur: litige.statut),
              if (litige.decision.isNotEmpty)
                Text(
                  'Décision : ${litige.decision == 'gagnant' ? 'règlement au gagnant' : 'remboursement des deux joueurs'}',
                  style: Typo.petit,
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            match != null
                ? '${match!.joueur1Nom} vs ${match!.joueur2Nom}'
                : 'Match ${formatIdentifiant(litige.matchId)}',
            style: Typo.h3,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            '${match != null ? '${match!.jeuNom} · ${formatMontant(match!.montantMise, match!.devise)} par joueur · ' : ''}'
            'ouvert le ${formatDateHeure(litige.dateCreation)}'
            '${litige.dateResolution != null ? ' · résolu le ${formatDateHeure(litige.dateResolution)}' : ''}',
            style: Typo.petit,
          ),
          if (litige.motif.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.only(left: 12),
              decoration: const BoxDecoration(
                border: Border(left: BorderSide(color: Couleurs.trait, width: 2)),
              ),
              child: Text('« ${litige.motif} »', style: Typo.legende),
            ),
          ],
          const SizedBox(height: 14),
          Bouton(
            libelle: 'Voir le match',
            variante: VarianteBouton.secondaire,
            iconeFin: Icons.chevron_right,
            onPressed: onVoirMatch,
          ),
        ],
      ),
    );
  }
}

extension _Premier<T> on Iterable<T> {
  T? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}
