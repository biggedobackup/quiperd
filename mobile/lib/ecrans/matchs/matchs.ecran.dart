import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/en_tete_page.dart';
import '../../composants/communs/etat_vide.dart';
import '../../composants/communs/indicateur_direct.dart';
import '../../composants/communs/squelette.dart';
import '../../composants/joueur/carte_match.dart';
import '../../etats/session.etat.dart';
import '../../modeles/match_defi.modele.dart';
import '../../noyau/resultat.dart';
import '../../noyau/statuts.dart';
import '../../services/matchs.service.dart';
import '../../temps_reel/client_temps_reel.dart';
import '../../temps_reel/evenements.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../coquille.ecran.dart';
import 'detail_match.ecran.dart';

/// « Mes matchs », filtrés par statut.
///
/// L'écran s'abonne aux salons des matchs encore vivants : un score proposé, un
/// désaccord ou une fin de match change la ligne sans que rien ne soit
/// redemandé au serveur.
class MatchsEcran extends StatefulWidget {
  const MatchsEcran({super.key});

  @override
  State<MatchsEcran> createState() => _MatchsEcranState();
}

class _MatchsEcranState extends State<MatchsEcran> {
  /// `verification` ne fait plus partie du parcours joueur : il n'est pas
  /// proposé en filtre, mais un match historique dans cet état reste affiché
  /// sous « Tous ».
  static const List<({String valeur, String libelle})> _filtres = [
    (valeur: '', libelle: 'Tous'),
    (valeur: 'en_cours', libelle: 'En cours'),
    (valeur: 'preuve_requise', libelle: 'Preuve exigée'),
    (valeur: 'nul_en_attente', libelle: 'Match nul'),
    (valeur: 'litige', libelle: 'Litige'),
    (valeur: 'termine', libelle: 'Terminé'),
  ];

  String _statut = '';
  List<MatchDefi> _matchs = const [];
  bool _chargement = true;

  StreamSubscription<EvenementRecu>? _ecoute;
  /// Référence capturée à l'ouverture : `dispose()` ne doit jamais
  /// interroger l'arbre des widgets (assertion `_dependents.isEmpty`).
  late final ClientTempsReel _direct;
  int _derniereResynchro = 0;
  final Set<String> _salonsOuverts = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _charger());

    final direct = _direct = context.read<ClientTempsReel>();
    // On part de l'état courant : seule une RE-connexion doit relancer un
    // chargement, pas la connexion déjà établie au moment où l'écran s'ouvre.
    _derniereResynchro = direct.reconnexions;
    _ecoute = direct.surPlusieurs({
      Evenements.matchCree,
      Evenements.matchScorePropose,
      Evenements.matchScoreConfirme,
      Evenements.matchDesaccord,
      Evenements.matchNul,
      Evenements.matchRejoue,
      Evenements.matchTermine,
      Evenements.matchLitigeOuvert,
      Evenements.matchChrono,
    }).listen(_surEvenement);
    direct.addListener(_surEtatDirect);
  }

  @override
  void dispose() {
    _ecoute?.cancel();
    final direct = _direct;
    direct.removeListener(_surEtatDirect);
    if (_salonsOuverts.isNotEmpty) direct.desabonner(_salonsOuverts);
    super.dispose();
  }

  void _surEtatDirect() {
    final direct = _direct;
    if (!direct.enDirect || direct.reconnexions == _derniereResynchro) return;
    _derniereResynchro = direct.reconnexions;
    _charger();
  }

  /// Un salon par match vivant : les événements de match circulent sur
  /// `match:<id>`, pas sur le salon privé du joueur.
  void _synchroniserSalons() {
    final direct = _direct;
    final voulus = _matchs
        .where((m) => m.vivant)
        .map((m) => Salons.match(m.id))
        .toSet();
    final aQuitter = _salonsOuverts.difference(voulus);
    final aRejoindre = voulus.difference(_salonsOuverts);
    if (aQuitter.isNotEmpty) direct.desabonner(aQuitter);
    if (aRejoindre.isNotEmpty) direct.abonner(aRejoindre);
    _salonsOuverts
      ..removeAll(aQuitter)
      ..addAll(aRejoindre);
  }

  void _surEvenement(EvenementRecu e) {
    final id = '${e.charge['matchId'] ?? e.charge['id'] ?? ''}';

    switch (e.evenement) {
      case Evenements.matchCree:
        _charger();

      case Evenements.matchTermine:
        final match = MatchDefi.depuisJson(e.charge);
        if (match.id.isEmpty) return;
        _remplacer(match.id, (m) => match);

      case Evenements.matchScorePropose:
        _remplacer(id, (m) => m.copieAvec(
              echeance: '${e.charge['echeanceConfirmation'] ?? ''}',
              echeanceType: 'confirmation',
            ));

      case Evenements.matchDesaccord:
        _remplacer(id, (m) => m.copieAvec(
              statut: 'preuve_requise',
              echeance: '${e.charge['echeancePreuve'] ?? ''}',
              echeanceType: 'preuve',
            ));

      case Evenements.matchNul:
        _remplacer(id, (m) => m.copieAvec(
              statut: 'nul_en_attente',
              echeance: '${e.charge['echeanceChoix'] ?? ''}',
              echeanceType: 'choix_nul',
            ));

      case Evenements.matchRejoue:
        final manche = e.charge['manche'];
        _remplacer(id, (m) => m.copieAvec(
              statut: 'en_cours',
              manche: manche is num ? manche.toInt() : m.manche + 1,
              echeance: null,
              echeanceType: '',
            ));

      case Evenements.matchLitigeOuvert:
        _remplacer(id, (m) => m.copieAvec(statut: 'litige', echeance: null, echeanceType: ''));

      case Evenements.matchChrono:
        _remplacer(id, (m) => m.copieAvec(
              echeance: '${e.charge['echeance'] ?? ''}',
              echeanceType: '${e.charge['type'] ?? ''}',
            ));

      case Evenements.matchScoreConfirme:
        _charger();
    }
  }

  void _remplacer(String id, MatchDefi Function(MatchDefi) transformer) {
    if (id.isEmpty || !mounted) return;
    setState(() {
      _matchs = _matchs.map((m) => m.id == id ? transformer(m) : m).toList();
    });
    _synchroniserSalons();
  }

  Future<void> _charger() async {
    if (!mounted) return;
    setState(() => _chargement = true);
    final r = await MatchsService.lister(statut: _statut.isEmpty ? null : _statut);
    if (!mounted) return;
    if (r is Succes<List<MatchDefi>>) _matchs = r.donnees;
    setState(() => _chargement = false);
    _synchroniserSalons();
  }

  @override
  Widget build(BuildContext context) {
    final moi = context.watch<SessionEtat>().utilisateur;
    if (moi == null) return const SizedBox.shrink();
    final coquille = CoquilleEcran.de(context);

    return RefreshIndicator(
      onRefresh: _charger,
      color: Couleurs.vert,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          const EnTetePage(
            surtitre: 'Arène',
            titre: 'Mes matchs',
            description: 'Tous vos matchs, du premier coup d’envoi au règlement.',
            action: IndicateurDirect(compact: true),
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _filtres.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final filtre = _filtres[i];
                final actif = _statut == filtre.valeur;
                return _Puce(
                  libelle: filtre.libelle,
                  actif: actif,
                  onTap: () {
                    setState(() => _statut = filtre.valeur);
                    _charger();
                  },
                );
              },
            ),
          ),
          const SizedBox(height: 18),
          if (_chargement)
            const SqueletteDiffere(child: SqueletteCartes(nombre: 3))
          else if (_matchs.isEmpty)
            EtatVide(
              icone: Icons.sports_esports_outlined,
              titre: _statut.isEmpty ? 'Aucun match pour l’instant' : 'Aucun match dans cet état',
              description: _statut.isEmpty
                  ? 'Rejoignez un défi ouvert ou créez le vôtre.'
                  : 'Essayez un autre filtre : '
                      '${decrireStatut(FamilleStatut.match, _statut).libelle.toLowerCase()} '
                      'ne concerne aucun de vos matchs.',
            )
          else
            ..._matchs.map(
              (m) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: CarteMatch(
                  match: m,
                  moiId: moi.id,
                  onTap: () => coquille?.ouvrir(DetailMatchEcran(matchId: m.id)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Puce extends StatelessWidget {
  const _Puce({required this.libelle, required this.actif, required this.onTap});

  final String libelle;
  final bool actif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: actif ? Couleurs.vert : Couleurs.papier,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          decoration: BoxDecoration(
            border: Border.all(color: actif ? Couleurs.vert : Couleurs.trait),
            borderRadius: BorderRadius.circular(999),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Center(
            child: Text(
              libelle.toUpperCase(),
              style: Typo.etiquette.copyWith(
                fontSize: 10,
                color: actif ? Couleurs.craie : Couleurs.muet,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
