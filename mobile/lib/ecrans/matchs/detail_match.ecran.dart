import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/badge_statut.dart';
import '../../composants/communs/bouton.dart';
import '../../composants/communs/en_tete_page.dart';
import '../../composants/communs/indicateur_direct.dart';
import '../../composants/communs/message.dart';
import '../../composants/communs/squelette.dart';
import '../../composants/joueur/avatar_joueur.dart';
import '../../composants/joueur/chronologie_match.dart';
import '../../composants/joueur/confirmation_resultat.dart';
import '../../composants/joueur/envoi_preuve.dart';
import '../../composants/joueur/feuilles/choix_nul.feuille.dart';
import '../../composants/joueur/feuilles/declaration_resultat.feuille.dart';
import '../../composants/joueur/feuilles/litige.feuille.dart';
import '../../composants/joueur/lecteur_preuve.dart';
import '../../composants/joueur/panneaux_match.dart';
import '../../composants/joueur/presence_adversaire.dart';
import '../../composants/joueur/resultat_match.dart';
import '../../composants/joueur/tableau_score.dart';
import '../../etats/catalogue.etat.dart';
import '../../etats/portefeuille.etat.dart';
import '../../etats/session.etat.dart';
import '../../modeles/match_defi.modele.dart';
import '../../modeles/preuve_match.modele.dart';
import '../../modeles/resultat_declare.modele.dart';
import '../../noyau/format.dart';
import '../../noyau/resultat.dart';
import '../../noyau/statuts.dart';
import '../../services/litiges.service.dart';
import '../../services/matchs.service.dart';
import '../../services/preuves.service.dart';
import '../../temps_reel/client_temps_reel.dart';
import '../../temps_reel/evenements.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../litiges.ecran.dart';

/// Écran de match — entièrement piloté par le direct.
///
/// Aucune minuterie de rafraîchissement : l'écran s'abonne au salon
/// `match:<id>` et applique les événements reçus. Les seules requêtes lancées
/// après le chargement sont la resynchronisation d'après coupure, le
/// rechargement des preuves (l'événement ne porte pas le fichier) et le
/// rattrapage quand un chrono arrive à zéro.
///
/// La machine à états est celle du backend : le mobile ne décide de rien, il
/// appelle la route et affiche l'état renvoyé.
class DetailMatchEcran extends StatefulWidget {
  const DetailMatchEcran({super.key, required this.matchId});

  final String matchId;

  @override
  State<DetailMatchEcran> createState() => _DetailMatchEcranState();
}

class _DetailMatchEcranState extends State<DetailMatchEcran> {
  DetailMatch? _detail;
  List<PreuveMatch> _preuves = const [];
  bool _chargement = true;
  bool _action = false;
  String? _erreur;

  // État poussé par le direct, absent de la fiche du match.
  String? _gain;
  DetailPartage? _partage;
  DetailAbandon? _abandon;
  bool? _presenceAdverse;

  StreamSubscription<EvenementRecu>? _ecoute;

  /// Référence capturée à l'ouverture : `dispose()` ne doit jamais
  /// interroger l'arbre des widgets (assertion `_dependents.isEmpty`).
  late final ClientTempsReel _direct;
  int _derniereResynchro = 0;
  late final String _salon = Salons.match(widget.matchId);

  @override
  void initState() {
    super.initState();
    _charger();

    final direct = _direct = context.read<ClientTempsReel>();
    _derniereResynchro = direct.reconnexions;
    direct.abonner([_salon]);
    direct.declarerPresence(_salon, surLaPage: true);
    _ecoute = direct.flux.where((e) => e.salon == _salon || e.salon == null).listen(_surEvenement);
    direct.addListener(_surEtatDirect);
  }

  @override
  void dispose() {
    _ecoute?.cancel();
    final direct = _direct;
    direct.removeListener(_surEtatDirect);
    // Quitter l'écran éteint la pastille « en ligne » chez l'adversaire.
    direct.declarerPresence(_salon, surLaPage: false);
    direct.desabonner([_salon]);
    super.dispose();
  }

  void _surEtatDirect() {
    final direct = _direct;
    if (!direct.enDirect || direct.reconnexions == _derniereResynchro) return;
    _derniereResynchro = direct.reconnexions;
    direct.declarerPresence(_salon, surLaPage: true);
    _charger(silencieux: true);
  }

  // ── Chargement ───────────────────────────────────────────────────────────────

  Future<void> _charger({bool silencieux = false}) async {
    if (!mounted) return;
    if (!silencieux) setState(() => _chargement = true);

    final resultats = await Future.wait([
      MatchsService.detail(widget.matchId),
      PreuvesService.lister(widget.matchId),
    ]);
    if (!mounted) return;

    final rDetail = resultats[0];
    if (rDetail is Succes<DetailMatch>) {
      _detail = rDetail.donnees;
      _erreur = null;
    } else if (rDetail is Echec<DetailMatch>) {
      _erreur = rDetail.message;
    }
    final rPreuves = resultats[1];
    if (rPreuves is Succes<List<PreuveMatch>>) _preuves = rPreuves.donnees;

    setState(() => _chargement = false);
  }

  Future<void> _rechargerPreuves() async {
    final r = await PreuvesService.lister(widget.matchId);
    if (!mounted) return;
    if (r is Succes<List<PreuveMatch>>) setState(() => _preuves = r.donnees);
  }

  // ── Direct ───────────────────────────────────────────────────────────────────

  void _majMatch(MatchDefi Function(MatchDefi) transformer) {
    final detail = _detail;
    if (detail == null || !mounted) return;
    setState(() => _detail = detail.copieAvec(match: transformer(detail.match)));
  }

  void _surEvenement(EvenementRecu e) {
    // Le socket vit plus longtemps que l'écran : un événement du worker peut tomber pendant
    // que l'utilisateur revient en arrière. Sans cette garde, la lecture du contexte ci-dessous
    // s'exécuterait sur un élément en cours de démontage.
    if (!mounted) return;

    final detail = _detail;
    final moi = context.read<SessionEtat>().utilisateur?.id ?? '';

    switch (e.evenement) {
      case Evenements.matchPresence:
        if ('${e.charge['utilisateurId']}' == moi) return;
        setState(() => _presenceAdverse = e.charge['present'] == true);

      case Evenements.matchScorePropose:
        // La charge ne contient pas la déclaration complète : on relit, ce qui
        // reste UN appel provoqué par un événement, jamais une boucle.
        _charger(silencieux: true);
        if ('${e.charge['declarant']}' != moi && mounted && detail != null) {
          // Mêmes trois phrases que le web, au mot près : on annonce l'issue déclarée, pas
          // le 1-0 rangé en base — le joueur n'a jamais saisi de chiffre.
          final nom = detail.match.nomAdversaireDe(moi);
          final pour = (e.charge['scorePour'] as num?)?.toInt() ?? 0;
          final contre = (e.charge['scoreContre'] as num?)?.toInt() ?? 0;
          Message.info(
            context,
            'Résultat à confirmer',
            pour == contre
                ? '$nom annonce un match nul. Confirmez, ou annoncez l’inverse.'
                : pour > contre
                ? '$nom se déclare vainqueur. Confirmez, ou annoncez l’inverse.'
                : '$nom vous déclare vainqueur. Confirmez, ou annoncez l’inverse.',
          );
        }

      case Evenements.matchScoreConfirme:
        _charger(silencieux: true);

      case Evenements.matchDesaccord:
        _majMatch(
          (m) => m.copieAvec(
            statut: 'preuve_requise',
            echeance: '${e.charge['echeancePreuve'] ?? ''}',
            echeanceType: 'preuve',
          ),
        );
        if (mounted) {
          Message.erreur(
            context,
            'Déclarations divergentes',
            'Vos déclarations ne concordent pas : envoyez chacun une preuve avant l’échéance, puis un arbitre tranchera.',
          );
        }

      case Evenements.matchNul:
        _majMatch(
          (m) => m.copieAvec(
            statut: 'nul_en_attente',
            echeance: '${e.charge['echeanceChoix'] ?? ''}',
            echeanceType: 'choix_nul',
          ),
        );

      case Evenements.matchNulChoix:
        _charger(silencieux: true);
        if ('${e.charge['utilisateurId']}' != moi && mounted && detail != null) {
          final nom = detail.match.nomAdversaireDe(moi);
          Message.info(
            context,
            'Choix de votre adversaire',
            '${e.charge['choix']}' == 'rejouer'
                ? '$nom veut rejouer la manche. À vous de choisir.'
                : '$nom préfère partager les mises. À vous de choisir.',
          );
        }

      case Evenements.matchRejoue:
        final manche = e.charge['manche'];
        _majMatch(
          (m) => m.copieAvec(
            statut: 'en_cours',
            manche: manche is num ? manche.toInt() : detail?.match.manche,
            echeance: null,
            echeanceType: '',
            scoreJoueur1: null,
            scoreJoueur2: null,
          ),
        );
        _charger(silencieux: true);
        if (mounted) {
          Message.succes(
            context,
            'Manche ${manche is num ? manche.toInt() : ''}'.trim(),
            'Vous avez tous les deux choisi de rejouer. Aucun mouvement d’argent : les mises restent bloquées.',
          );
        }

      case Evenements.matchPartage:
        setState(
          () => _partage = DetailPartage(
            rendu: '${e.charge['rendu'] ?? '0'}',
            commission: '${e.charge['commission'] ?? '0'}',
          ),
        );
        _charger(silencieux: true);

      case Evenements.matchAbandon:
        setState(
          () => _abandon = DetailAbandon(
            gagnantId: '${e.charge['gagnantId'] ?? ''}',
            motif: '${e.charge['motif'] ?? ''}',
          ),
        );
        _charger(silencieux: true);

      case Evenements.matchPreuveEnvoyee:
        _rechargerPreuves();
        if ('${e.charge['utilisateurId']}' != moi && mounted && detail != null) {
          final nom = detail.match.nomAdversaireDe(moi);
          final type = '${e.charge['type']}' == 'video' ? 'vidéo' : 'capture';
          Message.info(context, 'Preuve reçue', '$nom a envoyé sa preuve ($type).');
        }

      case Evenements.matchLitigeOuvert:
        _majMatch((m) => m.copieAvec(statut: 'litige', echeance: null, echeanceType: ''));
        if (mounted) {
          Message.info(
            context,
            'Litige ouvert',
            'Un arbitre va examiner les preuves des deux joueurs. Les mises restent bloquées.',
          );
        }

      case Evenements.matchLitigeResolu:
        _charger(silencieux: true);
        if (mounted) {
          Message.info(context, 'Litige tranché', 'La décision de l’arbitre a été appliquée.');
        }

      case Evenements.matchTermine:
        final match = MatchDefi.depuisJson(e.charge);
        setState(() {
          _gain = '${e.charge['gain'] ?? ''}';
          if (match.id.isNotEmpty && detail != null) {
            _detail = detail.copieAvec(match: match);
          }
        });
        if (mounted) context.read<PortefeuilleEtat>().charger(avecTransactions: false);

      case Evenements.matchChrono:
        _majMatch(
          (m) => m.copieAvec(
            echeance: '${e.charge['echeance'] ?? ''}',
            echeanceType: '${e.charge['type'] ?? ''}',
          ),
        );
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  Future<void> _declarer({required bool contreProposition}) async {
    final detail = _detail;
    final moi = context.read<SessionEtat>().utilisateur?.id ?? '';
    if (detail == null) return;

    final saisie = await ouvrirDeclarationResultat(
      context,
      nomAdversaire: detail.match.nomAdversaireDe(moi),
      manche: detail.match.manche,
      contreProposition: contreProposition,
    );
    if (saisie == null || !mounted) return;

    setState(() => _action = true);
    final r = await MatchsService.declarer(
      widget.matchId,
      resultat: saisie.resultat,
      commentaire: saisie.commentaire,
    );
    if (!mounted) return;
    setState(() => _action = false);

    if (r is Echec) {
      final echec = r as Echec;
      Message.erreur(context, 'Déclaration impossible', echec.message);
      _charger(silencieux: true);
      return;
    }
    Message.succes(
      context,
      'Résultat déclaré',
      'En attente de la réponse de ${detail.match.nomAdversaireDe(moi)}.',
    );
    _charger(silencieux: true);
  }

  Future<void> _confirmer() async {
    if (_action) return;
    setState(() => _action = true);
    final r = await MatchsService.confirmer(widget.matchId);
    if (!mounted) return;
    setState(() => _action = false);

    if (r is Echec) {
      final echec = r as Echec;
      Message.erreur(context, 'Confirmation impossible', echec.message);
      _charger(silencieux: true);
      return;
    }
    Message.succes(
      context,
      'Résultat confirmé',
      'Le match est réglé : l’argent est versé immédiatement.',
    );
    context.read<PortefeuilleEtat>().charger(avecTransactions: false);
    _charger(silencieux: true);
  }

  Future<void> _choisirApresNul() async {
    final detail = _detail;
    if (detail == null) return;
    final moi = context.read<SessionEtat>().utilisateur?.id ?? '';
    final regles = context.read<CatalogueEtat>().regles;
    final choixAdverse = detail.choixCourants.where((c) => c.utilisateurId != moi).firstOrNull;

    final choix = await ouvrirChoixNul(
      context,
      montantMise: detail.match.montantMise,
      devise: detail.match.devise,
      tauxCommission: regles.commissionDefi,
      manche: detail.match.manche,
      choixAdverse: choixAdverse?.choix,
      echeance: detail.match.echeanceType == 'choix_nul' ? detail.match.echeance : null,
    );
    if (choix == null || !mounted) return;

    setState(() => _action = true);
    final r = await MatchsService.choisirApresNul(widget.matchId, choix);
    if (!mounted) return;
    setState(() => _action = false);

    if (r is Echec) {
      final echec = r as Echec;
      Message.erreur(context, 'Choix impossible', echec.message);
      _charger(silencieux: true);
      return;
    }
    Message.succes(
      context,
      'Choix enregistré',
      choix == 'rejouer'
          ? 'Vous voulez rejouer. La manche ne repart que si ${detail.match.nomAdversaireDe(moi)} l’accepte aussi.'
          : 'Vous voulez partager les mises. Le partage sera appliqué.',
    );
    _charger(silencieux: true);
  }

  Future<void> _ouvrirLitige() async {
    final motif = await ouvrirLitige(context);
    if (motif == null || !mounted) return;

    setState(() => _action = true);
    final r = await LitigesService.ouvrir(matchId: widget.matchId, motif: motif);
    if (!mounted) return;
    setState(() => _action = false);

    if (r is Echec) {
      final echec = r as Echec;
      Message.erreur(context, 'Litige impossible', echec.message);
      _charger(silencieux: true);
      return;
    }
    Message.succes(
      context,
      'Litige ouvert',
      'Les mises restent bloquées jusqu’à la décision de l’arbitre.',
    );
    _charger(silencieux: true);
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(
        title: const Text('Match'),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Center(child: IndicateurDirect()),
          ),
        ],
      ),
      body: SafeArea(child: _corps()),
    );
  }

  Widget _corps() {
    if (_chargement && _detail == null) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: SqueletteDiffere(child: SqueletteCartes(nombre: 3)),
      );
    }
    final detail = _detail;
    if (detail == null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Encart(ton: TonMessage.erreur, texte: _erreur ?? 'Match introuvable.'),
            const SizedBox(height: 14),
            Bouton(
              libelle: 'Réessayer',
              variante: VarianteBouton.secondaire,
              icone: Icons.refresh,
              onPressed: _charger,
            ),
          ],
        ),
      );
    }

    final moi = context.watch<SessionEtat>().utilisateur!;
    final direct = context.watch<ClientTempsReel>();
    final match = detail.match;
    final nomMoi = match.nomDe(moi.id);
    final nomAdversaire = match.nomAdversaireDe(moi.id);
    final idAdversaire = match.adversaireDe(moi.id);

    final declarations = detail.declarationsCourantes;
    final maDeclaration = declarations.where((d) => d.utilisateurId == moi.id).firstOrNull;
    final declarationAdverse = declarations.where((d) => d.utilisateurId != moi.id).firstOrNull;
    final monChoix = detail.choixCourants.where((c) => c.utilisateurId == moi.id).firstOrNull;
    final choixAdverse = detail.choixCourants.where((c) => c.utilisateurId != moi.id).firstOrNull;

    final statut = match.statut;
    final aConfirmer = statut == 'en_cours' && declarationAdverse != null && maDeclaration == null;
    final peutDeclarer = statut == 'en_cours' && maDeclaration == null;
    final enAttenteAdverse =
        statut == 'en_cours' && maDeclaration != null && declarationAdverse == null;
    final peutOuvrirLitige =
        statut == 'en_cours' ||
        statut == 'preuve_requise' ||
        statut == 'nul_en_attente' ||
        statut == 'verification';
    final gagne = match.gagnantId == null ? null : match.gagnantId == moi.id;

    return RefreshIndicator(
      onRefresh: () => _charger(silencieux: true),
      color: Couleurs.vert,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          EnTetePage(
            surtitre:
                '${match.jeuNom} · ${match.plateformeNom}'
                '${match.manche > 1 ? ' · Manche ${match.manche}' : ''}',
            titre: '$nomMoi vs $nomAdversaire',
            description:
                'Mise de ${formatMontant(match.montantMise, match.devise)} par joueur · '
                '${formatMontant(versNombre(match.montantMise) * 2, match.devise)} en séquestre '
                'jusqu’au règlement.',
          ),
          const SizedBox(height: 20),

          // ── Bloc d'action prioritaire : toujours en haut de l'écran ──────────
          if (aConfirmer) ...[
            ConfirmationResultat(
              nomMoi: nomMoi,
              nomAdversaire: nomAdversaire,
              scoreMoi: declarationAdverse.scoreContre,
              scoreAdversaire: declarationAdverse.scorePour,
              echeance: match.echeanceType == 'confirmation' ? match.echeance : null,
              surFinChrono: () => _charger(silencieux: true),
              chargement: _action,
              onConfirmer: _confirmer,
              onProposer: () => _declarer(contreProposition: true),
            ),
            const SizedBox(height: 20),
          ],

          if (statut == 'nul_en_attente') ...[
            PanneauNul(
              nomAdversaire: nomAdversaire,
              monChoix: monChoix?.choix,
              choixAdverse: choixAdverse?.choix,
              echeance: match.echeance,
              surFinChrono: () => _charger(silencieux: true),
              onOuvrir: _choisirApresNul,
            ),
            const SizedBox(height: 20),
          ],

          if (statut == 'preuve_requise') ...[
            PanneauPreuveRequise(
              nomAdversaire: nomAdversaire,
              jaiEnvoye: _preuves.any((p) => p.utilisateurId == moi.id),
              adversaireAEnvoye: _preuves.any((p) => p.utilisateurId == idAdversaire),
              echeance: match.echeance,
              surFinChrono: () => _charger(silencieux: true),
              zoneEnvoi: EnvoiPreuve(matchId: widget.matchId, onEnvoye: _rechargerPreuves),
            ),
            const SizedBox(height: 20),
          ],

          if (statut == 'litige') ...[
            PanneauLitige(
              onVoirLitiges: () => Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => const LitigesEcran())),
            ),
            const SizedBox(height: 20),
          ],

          if (enAttenteAdverse) ...[
            PanneauAttente(
              nomAdversaire: nomAdversaire,
              echeance: match.echeanceType == 'confirmation' ? match.echeance : null,
              surFinChrono: () => _charger(silencieux: true),
            ),
            const SizedBox(height: 20),
          ],

          if (statut == 'termine') ...[
            ResultatMatch(
              match: match,
              moiId: moi.id,
              nomAdversaire: nomAdversaire,
              gain: _gain,
              partage: _partage,
              abandon: _abandon,
            ),
            const SizedBox(height: 20),
          ],

          // ── Tableau d'affichage ─────────────────────────────────────────────
          TableauScore(
            joueur1: match.joueur1Nom,
            joueur2: match.joueur2Nom,
            // Tant qu'aucun gagnant n'est désigné, le backend garde la DERNIÈRE
            // déclaration reçue dans `scoreJoueur1/2` — y compris quand les deux
            // joueurs se contredisent. L'afficher en grand ferait passer la
            // version de l'adversaire pour l'issue du match : on ne montre donc
            // une issue que lorsque la plateforme a tranché.
            score1: match.gagnantId == null ? null : match.scoreJoueur1,
            score2: match.gagnantId == null ? null : match.scoreJoueur2,
            gagnant: match.gagnantId == null ? null : (match.gagnantId == match.joueur1Id ? 1 : 2),
            etiquette: match.manche > 1
                ? 'Manche ${match.manche}'
                : (statut == 'termine' ? 'Résultat final' : 'Match'),
            sousTitre: _sousTitreScore(statut, gagne),
            enDirect: statut == 'en_cours',
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // La photo de l'adversaire, s'il en a une : on joue de l'argent contre
                    // quelqu'un, autant voir son visage et pas seulement son pseudo.
                    AvatarJoueur(
                      utilisateurId: match.adversaireDe(moi.id),
                      pseudo: nomAdversaire,
                      photo: match.photoAdversaireDe(moi.id),
                      taille: 34,
                    ),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Text.rich(
                        TextSpan(
                          text: 'Face à ',
                          style: Typo.legende.copyWith(color: Couleurs.muet),
                          children: [TextSpan(text: nomAdversaire, style: Typo.legendeForte)],
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              PresenceAdversaire(enLigne: _presenceAdverse, direct: direct.enDirect),
            ],
          ),
          const SizedBox(height: 20),
          ChronologieMatch(statut: statut),
          const SizedBox(height: 24),

          // ── Déclarations ────────────────────────────────────────────────────
          Container(
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
                    Flexible(
                      child: Text(
                        'Déclarations${match.manche > 1 ? ' — manche ${match.manche}' : ''}',
                        style: Typo.h3,
                      ),
                    ),
                    BadgeStatut(famille: FamilleStatut.match, valeur: statut),
                  ],
                ),
                const SizedBox(height: 14),
                _LigneDeclaration(
                  nom: '$nomMoi (vous)',
                  declaration: maDeclaration,
                  attente: 'Vous n’avez pas encore déclaré.',
                  nomDe: match.nomDe,
                ),
                const SizedBox(height: 10),
                _LigneDeclaration(
                  nom: nomAdversaire,
                  declaration: declarationAdverse,
                  attente: 'En attente de la déclaration adverse.',
                  nomDe: match.nomDe,
                ),
                if (peutDeclarer && !aConfirmer) ...[
                  const SizedBox(height: 16),
                  Bouton(
                    libelle: 'Déclarer le résultat',
                    bloc: true,
                    taille: TailleBouton.lg,
                    variante: VarianteBouton.volt,
                    icone: Icons.scoreboard_outlined,
                    chargement: _action,
                    onPressed: () => _declarer(contreProposition: false),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Que faire maintenant ? ──────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Couleurs.papier,
              border: Border.all(color: Couleurs.trait),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Que faire maintenant ?', style: Typo.h3),
                const SizedBox(height: 14),
                ..._consignes(
                  statut: statut,
                  aDeclare: maDeclaration != null,
                  aConfirmer: aConfirmer,
                  nomAdversaire: nomAdversaire,
                ).map((c) => Consigne(fait: c.fait, texte: c.texte)),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // ── Preuves ─────────────────────────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Preuves', style: Typo.h3),
              Text('${_preuves.length} ${pluriel(_preuves.length, 'fichier')}', style: Typo.petit),
            ],
          ),
          const SizedBox(height: 12),
          // En « preuve exigée », la zone d'envoi est déjà en haut : pas de doublon.
          if (statut != 'termine' && statut != 'preuve_requise') ...[
            EnvoiPreuve(matchId: widget.matchId, onEnvoye: _rechargerPreuves),
            const SizedBox(height: 14),
          ],
          if (_preuves.isEmpty)
            Text(
              'Aucune preuve envoyée. Deux déclarations identiques suffisent à régler le '
              'match : la preuve n’est exigée qu’en cas de divergence.',
              style: Typo.legende.copyWith(color: Couleurs.muet),
            )
          else
            ..._preuves.map(
              (p) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: LecteurPreuve(
                  preuve: p,
                  auteur: p.utilisateurId == moi.id ? '$nomMoi (vous)' : nomAdversaire,
                ),
              ),
            ),

          if (peutOuvrirLitige) ...[
            const SizedBox(height: 24),
            Bouton(
              libelle: 'Ouvrir un litige',
              bloc: true,
              variante: VarianteBouton.danger,
              icone: Icons.gavel_outlined,
              chargement: _action,
              onPressed: _ouvrirLitige,
            ),
          ],
          const SizedBox(height: 18),
          Text(
            'Match créé le ${formatDateHeure(match.dateCreation)}'
            '${match.dateFin != null ? ' · réglé le ${formatDateHeure(match.dateFin)}' : ''}.',
            style: Typo.petit,
          ),
        ],
      ),
    );
  }

  String? _sousTitreScore(String statut, bool? gagne) {
    if (statut == 'termine') {
      if (gagne != null) {
        return gagne ? 'Vous avez gagné ce match.' : 'Vous avez perdu ce match.';
      }
      // Sans gagnant : soit un nul partagé, soit un remboursement décidé par
      // l'arbitre. Ce n'est pas la même histoire, on ne les confond pas.
      return _partage != null
          ? 'Match nul : la mise a été partagée.'
          : 'Match clos sans vainqueur désigné.';
    }
    if (statut == 'preuve_requise') return 'Scores divergents : preuve exigée des deux côtés.';
    if (statut == 'nul_en_attente') return 'Match nul : rejouer ou partager la mise.';
    if (statut == 'litige') return 'Litige en cours : un arbitre va trancher.';
    return null;
  }

  /// Consignes du bloc « Que faire maintenant ? ».
  ///
  /// Copie du web à la lettre (`consignes()` dans `routes/joueur/matchs/$matchId.tsx`), y
  /// compris l'ordre et l'état coché de chaque ligne : un joueur qui connaît le site doit lire
  /// exactement la même chose ici, sinon il doute d'être au même endroit.
  List<({bool fait, String texte})> _consignes({
    required String statut,
    required bool aDeclare,
    required bool aConfirmer,
    required String nomAdversaire,
  }) {
    return switch (statut) {
      'termine' => [
        (fait: true, texte: 'Jouer le match et déclarer le résultat.'),
        (fait: true, texte: 'Accord des deux joueurs sur le résultat.'),
        (fait: true, texte: 'Règlement automatique : l’argent est versé.'),
      ],
      'preuve_requise' => [
        (fait: false, texte: 'Envoyer votre preuve (capture ou vidéo).'),
        (fait: false, texte: 'Attendre la preuve de $nomAdversaire.'),
        (fait: false, texte: 'Un arbitre examine les deux preuves et tranche.'),
      ],
      'nul_en_attente' => [
        (fait: false, texte: 'Choisir : rejouer la manche ou partager les mises.'),
        (fait: false, texte: 'Attendre le choix de $nomAdversaire.'),
        (fait: false, texte: 'Rejouer si vous êtes d’accord tous les deux, sinon partage.'),
      ],
      'litige' || 'verification' => [
        (fait: true, texte: 'Jouer le match et déclarer le résultat.'),
        (fait: false, texte: 'Envoyer vos preuves : capture et, si possible, vidéo.'),
        (fait: false, texte: 'Attendre la décision : le règlement suit automatiquement.'),
      ],
      _ => [
        (fait: aDeclare, texte: 'Jouer le match sur le jeu et la plateforme du défi.'),
        (
          fait: aDeclare,
          texte: aConfirmer
              ? 'Confirmer le résultat annoncé par $nomAdversaire, ou annoncer l’inverse.'
              : 'Déclarer qui a gagné.',
        ),
        (
          fait: false,
          texte: 'Deux déclarations identiques = règlement immédiat, sans preuve ni arbitre.',
        ),
      ],
    };
  }
}

class _LigneDeclaration extends StatelessWidget {
  const _LigneDeclaration({
    required this.nom,
    required this.declaration,
    required this.nomDe,
    required this.attente,
  });

  final String nom;
  final ResultatDeclare? declaration;
  final String attente;
  final String Function(String) nomDe;

  @override
  Widget build(BuildContext context) {
    final d = declaration;
    // Sous-titre repris du web à la lettre : « Gagnant déclaré : X · date · « commentaire » ».
    // Le commentaire compte : c'est là qu'un joueur note le score de sa partie s'il y tient.
    final sousTitre = d == null
        ? attente
        : 'Gagnant déclaré : ${d.gagnantDeclareId == null ? 'match nul' : nomDe(d.gagnantDeclareId!)}'
              ' · ${formatDateHeure(d.dateDeclaration)}'
              '${d.commentaire.isEmpty ? '' : ' · « ${d.commentaire} »'}';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: d == null ? Couleurs.gris : Couleurs.vertPale,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            d == null ? Icons.hourglass_empty : Icons.check_circle,
            size: 18,
            color: d == null ? Couleurs.muet : Couleurs.vert,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(nom, style: Typo.legendeForte, overflow: TextOverflow.ellipsis),
                Text(sousTitre, style: Typo.petit),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Les 1-0 / 0-1 rangés en base sont une convention interne du moteur de règlement.
          // Les afficher montrerait au joueur un chiffre que personne n'a saisi.
          if (d != null)
            Text(
              d.scorePour == d.scoreContre
                  ? 'Match nul'
                  : d.scorePour > d.scoreContre
                  ? 'Se déclare vainqueur'
                  : 'Se déclare battu',
              textAlign: TextAlign.right,
              style: Typo.legendeForte.copyWith(color: Couleurs.vert),
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
