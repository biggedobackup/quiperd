import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../composants/communs/bouton.dart';
import '../composants/communs/en_tete_page.dart';
import '../composants/communs/etat_vide.dart';
import '../composants/communs/indicateur_direct.dart';
import '../composants/communs/squelette.dart';
import '../composants/joueur/carte_defi.dart';
import '../composants/joueur/carte_match.dart';
import '../etats/notifications.etat.dart';
import '../etats/portefeuille.etat.dart';
import '../etats/session.etat.dart';
import '../modeles/defi.modele.dart';
import '../modeles/match_defi.modele.dart';
import '../noyau/format.dart';
import '../noyau/resultat.dart';
import '../services/defis.service.dart';
import '../services/matchs.service.dart';
import '../temps_reel/client_temps_reel.dart';
import '../temps_reel/evenements.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';
import 'coquille.ecran.dart';
import 'defis/detail_defi.ecran.dart';
import 'defis/nouveau_defi.ecran.dart';
import 'matchs/detail_match.ecran.dart';

/// Tableau de bord : solde, notifications, matchs en cours, défis ouverts.
///
/// Les listes vivent par le socket (salon public pour l'arène, salon privé pour
/// l'argent) : **aucune minuterie de rafraîchissement**.
class TableauDeBordEcran extends StatefulWidget {
  const TableauDeBordEcran({super.key});

  @override
  State<TableauDeBordEcran> createState() => _TableauDeBordEcranState();
}

class _TableauDeBordEcranState extends State<TableauDeBordEcran> {
  List<MatchDefi> _matchs = const [];
  List<Defi> _defis = const [];
  bool _chargement = true;

  StreamSubscription<EvenementRecu>? _ecoute;
  /// Référence capturée à l'ouverture : `dispose()` ne doit jamais
  /// interroger l'arbre des widgets (assertion `_dependents.isEmpty`).
  late final ClientTempsReel _direct;
  int _derniereResynchro = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _charger());

    final direct = _direct = context.read<ClientTempsReel>();
    // On part de l'état courant : seule une RE-connexion doit relancer un
    // chargement, pas la connexion déjà établie au moment où l'écran s'ouvre.
    _derniereResynchro = direct.reconnexions;
    _ecoute = direct.surPlusieurs({
      Evenements.defiCree,
      Evenements.defiAnnule,
      Evenements.defiExpire,
      Evenements.defiRejoint,
      Evenements.matchCree,
      Evenements.matchTermine,
      Evenements.matchScoreConfirme,
    }).listen(_surEvenement);
    direct.addListener(_surEtatDirect);
  }

  @override
  void dispose() {
    _ecoute?.cancel();
    _direct.removeListener(_surEtatDirect);
    super.dispose();
  }

  void _surEtatDirect() {
    final direct = _direct;
    if (!direct.enDirect || direct.reconnexions == _derniereResynchro) return;
    _derniereResynchro = direct.reconnexions;
    _charger();
  }

  void _surEvenement(EvenementRecu e) {
    switch (e.evenement) {
      // Un défi entre dans l'arène : on l'insère sans rien redemander.
      case Evenements.defiCree:
        final defi = Defi.depuisJson(e.charge);
        if (defi.id.isEmpty || _defis.any((d) => d.id == defi.id)) return;
        setState(() => _defis = [defi, ..._defis]);

      case Evenements.defiAnnule:
      case Evenements.defiExpire:
      case Evenements.defiRejoint:
        final id = e.charge['defiId'];
        if (id is! String) return;
        setState(() => _defis = _defis.where((d) => d.id != id).toList());

      // Un match commence ou se termine : la liste du haut suit.
      case Evenements.matchCree:
        final match = MatchDefi.depuisJson(e.charge);
        if (match.id.isEmpty || _matchs.any((m) => m.id == match.id)) return;
        setState(() => _matchs = [match, ..._matchs]);

      case Evenements.matchTermine:
        final id = '${e.charge['id'] ?? ''}';
        setState(() => _matchs = _matchs.where((m) => m.id != id).toList());

      case Evenements.matchScoreConfirme:
        _charger();
    }
  }

  Future<void> _charger() async {
    if (!mounted) return;
    setState(() => _chargement = true);

    final resultats = await Future.wait([
      MatchsService.lister(statut: 'en_cours'),
      DefisService.ouverts(FiltresDefis.aucun),
    ]);
    if (!mounted) return;

    final rMatchs = resultats[0];
    if (rMatchs is Succes<List<MatchDefi>>) _matchs = rMatchs.donnees;
    final rDefis = resultats[1];
    if (rDefis is Succes<List<Defi>>) _defis = rDefis.donnees;

    setState(() => _chargement = false);
  }

  @override
  Widget build(BuildContext context) {
    final moi = context.watch<SessionEtat>().utilisateur;
    if (moi == null) return const SizedBox.shrink();

    final portefeuille = context.watch<PortefeuilleEtat>().portefeuille;
    final notifications = context.watch<NotificationsEtat>();
    final heure = DateTime.now().hour;
    final salut = heure < 18 ? 'Bonjour' : 'Bonsoir';
    final coquille = CoquilleEcran.de(context);

    return RefreshIndicator(
      // Geste de l'utilisateur — pas une minuterie.
      onRefresh: () async {
        await Future.wait([
          _charger(),
          context.read<PortefeuilleEtat>().charger(avecTransactions: false),
          context.read<NotificationsEtat>().charger(force: true),
        ]);
      },
      color: Couleurs.vert,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          EnTetePage(
            surtitre: salut,
            titre: moi.nomUtilisateur,
            description: 'Votre arène : solde, matchs en cours, défis à relever.',
            action: const IndicateurDirect(compact: true),
          ),
          const SizedBox(height: 20),
          _CarteSolde(
            disponible: portefeuille.soldeDisponible,
            bloque: portefeuille.soldeBloque,
            devise: portefeuille.devise,
            onHistorique: () => coquille?.allerA(3),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Bouton(
                  libelle: 'Déposer',
                  variante: VarianteBouton.secondaire,
                  icone: Icons.south_west,
                  onPressed: () => coquille?.allerA(3),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Bouton(
                  libelle: 'Créer un défi',
                  variante: VarianteBouton.volt,
                  icone: Icons.add,
                  onPressed: () => coquille?.ouvrir(const NouveauDefiEcran()),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          _CarteNotifications(etat: notifications, onTout: () => coquille?.ouvrirNotifications()),
          const SizedBox(height: 28),
          TitreSection(
            titre: 'Matchs en cours',
            lien: 'Tous mes matchs',
            onLien: () => coquille?.allerA(2),
          ),
          if (_chargement)
            const SqueletteDiffere(child: SqueletteCartes(nombre: 2))
          else if (_matchs.isEmpty)
            const EtatVide(
              icone: Icons.sports_esports_outlined,
              titre: 'Aucun match en cours',
              description: 'Rejoignez un défi ouvert ou créez le vôtre : le match démarre '
                  'dès qu’un adversaire accepte.',
            )
          else
            ..._matchs.take(4).map(
                  (m) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: CarteMatch(
                      match: m,
                      moiId: moi.id,
                      onTap: () => coquille?.ouvrir(DetailMatchEcran(matchId: m.id)),
                    ),
                  ),
                ),
          const SizedBox(height: 20),
          TitreSection(
            titre: 'Défis ouverts',
            lien: 'Tous les défis',
            onLien: () => coquille?.allerA(1),
          ),
          if (_chargement)
            const SqueletteDiffere(child: SqueletteCartes(nombre: 2))
          else if (_defis.isEmpty)
            EtatVide(
              icone: Icons.local_fire_department_outlined,
              titre: 'Aucun défi disponible',
              description: 'Créez le premier : votre mise est bloquée en séquestre jusqu’à '
                  'ce qu’un adversaire rejoigne.',
              action: Bouton(
                libelle: 'Créer un défi',
                variante: VarianteBouton.volt,
                icone: Icons.add,
                onPressed: () => coquille?.ouvrir(const NouveauDefiEcran()),
              ),
            )
          else
            ..._defis.take(3).map(
                  (d) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: CarteDefi(
                      defi: d,
                      mien: d.createurId == moi.id,
                      onTap: () => coquille?.ouvrir(DetailDefiEcran(defiId: d.id)),
                    ),
                  ),
                ),
        ],
      ),
    );
  }
}

class _CarteSolde extends StatelessWidget {
  const _CarteSolde({
    required this.disponible,
    required this.bloque,
    required this.devise,
    required this.onHistorique,
  });

  final String disponible;
  final String bloque;
  final String devise;
  final VoidCallback onHistorique;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Couleurs.encre,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('SOLDE DISPONIBLE',
                  style: Typo.etiquette.copyWith(
                      color: Couleurs.craie.withValues(alpha: 0.6), fontSize: 10)),
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Couleurs.vert,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.account_balance_wallet_outlined,
                    size: 18, color: Couleurs.craie),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              formatMontant(disponible, devise),
              style: Typo.chiffres(taille: 36, poids: 700, couleur: Couleurs.volt),
            ),
          ),
          const SizedBox(height: 16),
          Divider(color: Couleurs.craie.withValues(alpha: 0.15), height: 1),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Bloqué en séquestre : ${formatMontant(bloque, devise)}',
                  style: Typo.petit.copyWith(color: Couleurs.craie.withValues(alpha: 0.7)),
                ),
              ),
              TextButton(
                onPressed: onHistorique,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 44),
                  foregroundColor: Couleurs.volt,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('HISTORIQUE',
                        style: Typo.etiquette.copyWith(color: Couleurs.volt, fontSize: 10)),
                    const Icon(Icons.chevron_right, size: 16, color: Couleurs.volt),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CarteNotifications extends StatelessWidget {
  const _CarteNotifications({required this.etat, required this.onTout});

  final NotificationsEtat etat;
  final VoidCallback onTout;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: Couleurs.trait),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('NOTIFICATIONS',
                  style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
              TextButton(
                onPressed: onTout,
                style: TextButton.styleFrom(minimumSize: const Size(0, 40)),
                child: Text('TOUT VOIR',
                    style: Typo.etiquette.copyWith(color: Couleurs.encre, fontSize: 10)),
              ),
            ],
          ),
          if (etat.chargement)
            const Padding(padding: EdgeInsets.only(top: 8), child: SqueletteDiffere(child: SqueletteTexte(lignes: 3)))
          else if (etat.liste.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Aucune notification pour l’instant.', style: Typo.legende.copyWith(color: Couleurs.muet)),
            )
          else
            ...etat.liste.take(4).map(
                  (n) => Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          margin: const EdgeInsets.only(top: 6),
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: n.lu ? Couleurs.trait : Couleurs.vert,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                n.titre,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: n.lu ? Typo.legende : Typo.legendeForte,
                              ),
                              Text(formatDateRelative(n.dateCreation), style: Typo.petit),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
        ],
      ),
    );
  }
}
