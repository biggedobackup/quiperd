import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/badge_statut.dart';
import '../../composants/communs/bouton.dart';
import '../../composants/communs/champ_texte.dart';
import '../../composants/communs/confirmation.dart';
import '../../composants/communs/en_tete_page.dart';
import '../../composants/communs/etat_vide.dart';
import '../../composants/communs/indicateur_direct.dart';
import '../../composants/communs/liste_deroulante.dart';
import '../../composants/communs/message.dart';
import '../../composants/communs/squelette.dart';
import '../../composants/joueur/carte_defi.dart';
import '../../composants/joueur/compte_a_rebours.dart';
import '../../etats/catalogue.etat.dart';
import '../../etats/portefeuille.etat.dart';
import '../../etats/session.etat.dart';
import '../../modeles/defi.modele.dart';
import '../../noyau/catalogue.dart';
import '../../noyau/format.dart';
import '../../noyau/resultat.dart';
import '../../noyau/statuts.dart';
import '../../services/defis.service.dart';
import '../../temps_reel/client_temps_reel.dart';
import '../../temps_reel/evenements.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../coquille.ecran.dart';
import '../matchs/detail_match.ecran.dart';
import 'detail_defi.ecran.dart';
import 'nouveau_defi.ecran.dart';

/// Deux onglets : l'arène (« Défis ouverts ») et « Mes défis ».
///
/// L'arène vit sur le salon public : un défi créé par un autre joueur apparaît,
/// un défi rejoint ou annulé disparaît — sans aucun rafraîchissement. Dans
/// « Mes défis », en revanche, une ligne ne disparaît JAMAIS : c'est son statut
/// qui change sous les yeux du créateur.
class DefisEcran extends StatefulWidget {
  const DefisEcran({super.key});

  @override
  State<DefisEcran> createState() => _DefisEcranState();
}

class _DefisEcranState extends State<DefisEcran> {
  int _onglet = 0;
  FiltresDefis _filtres = FiltresDefis.aucun;

  List<Defi> _ouverts = const [];
  List<Defi> _mes = const [];
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
    final moi = context.read<SessionEtat>().utilisateur?.id;

    switch (e.evenement) {
      case Evenements.defiCree:
        final defi = Defi.depuisJson(e.charge);
        if (defi.id.isEmpty) return;
        setState(() {
          if (!_ouverts.any((d) => d.id == defi.id) && _correspond(defi)) {
            _ouverts = [defi, ..._ouverts];
          }
          if (defi.createurId == moi && !_mes.any((d) => d.id == defi.id)) {
            _mes = [defi, ..._mes];
          }
        });

      case Evenements.defiAnnule:
      case Evenements.defiExpire:
      case Evenements.defiRejoint:
        final id = e.charge['defiId'];
        if (id is! String) return;
        final nouveauStatut = switch (e.evenement) {
          Evenements.defiAnnule => 'annule',
          Evenements.defiExpire => 'expire',
          _ => 'complet',
        };
        setState(() {
          _ouverts = _ouverts.where((d) => d.id != id).toList();
          _mes = _mes
              .map((d) => d.id == id ? d.copieAvec(statut: nouveauStatut) : d)
              .toList();
        });

        // Mon défi vient d'être rejoint : on INVITE, on ne navigue jamais de
        // force — le joueur peut être en train de faire autre chose.
        if (e.evenement == Evenements.defiRejoint && mounted) {
          final mien = _mes.any((d) => d.id == id);
          final matchId = e.charge['matchId'];
          if (mien && matchId is String) _inviterAuMatch(matchId);
        }
    }
  }

  bool _correspond(Defi defi) {
    if (_filtres.categorie != null && defi.jeuCategorie != _filtres.categorie) return false;
    if (_filtres.jeu != null && defi.jeuId != _filtres.jeu) return false;
    if (_filtres.plateforme != null && defi.plateformeId != _filtres.plateforme) return false;
    if (_filtres.miseMax != null && versNombre(defi.montantMise) > _filtres.miseMax!) {
      return false;
    }
    return true;
  }

  void _inviterAuMatch(String matchId) {
    final messager = ScaffoldMessenger.maybeOf(context);
    messager?.showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 20),
        content: const Text('Un adversaire a rejoint votre défi. Le match peut commencer.'),
        action: SnackBarAction(
          label: 'VOIR',
          textColor: Couleurs.volt,
          onPressed: () =>
              CoquilleEcran.de(context)?.ouvrir(DetailMatchEcran(matchId: matchId)),
        ),
      ),
    );
  }

  Future<void> _charger() async {
    if (!mounted) return;
    setState(() => _chargement = true);
    final resultats = await Future.wait([
      DefisService.ouverts(_filtres),
      DefisService.mesDefis(),
    ]);
    if (!mounted) return;
    final rOuverts = resultats[0];
    if (rOuverts is Succes<List<Defi>>) _ouverts = rOuverts.donnees;
    final rMes = resultats[1];
    if (rMes is Succes<List<Defi>>) _mes = rMes.donnees;
    setState(() => _chargement = false);
  }

  Future<void> _rechargerOuverts() async {
    final r = await DefisService.ouverts(_filtres);
    if (!mounted) return;
    if (r is Succes<List<Defi>>) setState(() => _ouverts = r.donnees);
  }

  Future<void> _annuler(Defi defi) async {
    final ok = await confirmer(
      context,
      titre: 'Annuler ce défi ?',
      message: 'Le défi de ${formatMontant(defi.montantMise, defi.devise)} sera retiré de '
          'l’arène et votre mise sera remboursée, moins la commission de la plateforme.',
      libelleConfirmer: 'Annuler le défi',
      libelleAnnuler: 'Garder',
      destructif: true,
    );
    if (!ok || !mounted) return;

    final r = await DefisService.annuler(defi.id);
    if (!mounted) return;
    if (r is Echec<void>) {
      Message.erreur(context, 'Annulation impossible', r.message);
      return;
    }
    Message.succes(
      context,
      'Défi annulé',
      'Votre mise vous a été rendue sur votre solde disponible, moins la commission.',
    );
    setState(() {
      _mes = _mes.map((d) => d.id == defi.id ? d.copieAvec(statut: 'annule') : d).toList();
      _ouverts = _ouverts.where((d) => d.id != defi.id).toList();
    });
    if (mounted) context.read<PortefeuilleEtat>().charger(avecTransactions: false);
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
          EnTetePage(
            surtitre: 'Arène',
            titre: 'Défis',
            description: 'Les défis ouverts de tous les joueurs, et les vôtres.',
            action: const IndicateurDirect(compact: true),
          ),
          const SizedBox(height: 18),
          Bouton(
            libelle: 'Créer un défi',
            bloc: true,
            variante: VarianteBouton.volt,
            icone: Icons.add,
            onPressed: () => coquille?.ouvrir(const NouveauDefiEcran()),
          ),
          const SizedBox(height: 18),
          _Onglets(
            index: _onglet,
            libelles: const ['Défis ouverts', 'Mes défis'],
            onChange: (i) => setState(() => _onglet = i),
          ),
          const SizedBox(height: 16),
          if (_onglet == 0) ...[
            _Filtres(
              filtres: _filtres,
              onChange: (f) {
                setState(() => _filtres = f);
                _rechargerOuverts();
              },
            ),
            const SizedBox(height: 16),
            if (_chargement)
              const SqueletteCartes(nombre: 3)
            else if (_ouverts.isEmpty)
              EtatVide(
                icone: Icons.local_fire_department_outlined,
                titre: 'Aucun défi disponible, créez le premier !',
                description: _filtres.actifs
                    ? 'Aucun défi ne correspond à ces filtres.'
                    : 'Votre mise sera bloquée en séquestre jusqu’à ce qu’un adversaire '
                        'rejoigne.',
                action: Column(
                  children: [
                    if (_filtres.actifs)
                      Bouton(
                        libelle: 'Effacer les filtres',
                        variante: VarianteBouton.secondaire,
                        onPressed: () {
                          setState(() => _filtres = FiltresDefis.aucun);
                          _rechargerOuverts();
                        },
                      ),
                    if (_filtres.actifs) const SizedBox(height: 10),
                    Bouton(
                      libelle: 'Créer un défi',
                      variante: VarianteBouton.volt,
                      icone: Icons.add,
                      onPressed: () => coquille?.ouvrir(const NouveauDefiEcran()),
                    ),
                  ],
                ),
              )
            else
              ..._ouverts.map(
                (d) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: CarteDefi(
                    defi: d,
                    mien: d.createurId == moi.id,
                    onTap: () => coquille?.ouvrir(DetailDefiEcran(defiId: d.id)),
                  ),
                ),
              ),
          ] else ...[
            if (_chargement)
              const SqueletteCartes(nombre: 2)
            else if (_mes.isEmpty)
              EtatVide(
                icone: Icons.confirmation_number_outlined,
                titre: 'Vous n’avez encore créé aucun défi',
                action: Bouton(
                  libelle: 'Créer mon premier défi',
                  variante: VarianteBouton.volt,
                  icone: Icons.add,
                  onPressed: () => coquille?.ouvrir(const NouveauDefiEcran()),
                ),
              )
            else
              ..._mes.map(
                (d) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _LigneMonDefi(
                    defi: d,
                    onDetail: () => coquille?.ouvrir(DetailDefiEcran(defiId: d.id)),
                    onAnnuler: d.ouvert ? () => _annuler(d) : null,
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _Onglets extends StatelessWidget {
  const _Onglets({required this.index, required this.libelles, required this.onChange});

  final int index;
  final List<String> libelles;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: Couleurs.trait),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        children: List.generate(libelles.length, (i) {
          final actif = i == index;
          return Expanded(
            child: Material(
              color: actif ? Couleurs.vert : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
              child: InkWell(
                onTap: () => onChange(i),
                borderRadius: BorderRadius.circular(999),
                child: SizedBox(
                  height: 40,
                  child: Center(
                    child: Text(
                      libelles[i].toUpperCase(),
                      style: Typo.etiquette.copyWith(
                        fontSize: 11,
                        color: actif ? Couleurs.craie : Couleurs.muet,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _Filtres extends StatefulWidget {
  const _Filtres({required this.filtres, required this.onChange});

  final FiltresDefis filtres;
  final ValueChanged<FiltresDefis> onChange;

  @override
  State<_Filtres> createState() => _FiltresState();
}

class _FiltresState extends State<_Filtres> {
  // Le champ garde son propre contrôleur : reconstruire un `TextField` à chaque
  // frappe lui ferait perdre le focus et le curseur au premier chiffre tapé.
  late final TextEditingController _miseMax = TextEditingController(
    text: widget.filtres.miseMax == null ? '' : widget.filtres.miseMax!.toStringAsFixed(0),
  );

  @override
  void dispose() {
    _miseMax.dispose();
    super.dispose();
  }

  FiltresDefis get filtres => widget.filtres;
  ValueChanged<FiltresDefis> get onChange => widget.onChange;

  @override
  Widget build(BuildContext context) {
    final catalogue = context.watch<CatalogueEtat>();
    final jeux = catalogue.jeuxDeCategorie(filtres.categorie);

    return Column(
      children: [
        ListeDeroulante(
          label: 'Catégorie',
          valeur: filtres.categorie,
          placeholder: 'Toutes les catégories',
          options: categoriesJeu.map((c) => OptionListe(c.valeur, c.libelle)).toList(),
          // Changer de catégorie remet le jeu à zéro : garder un jeu d'une autre
          // catégorie donnerait une liste vide sans explication.
          onChanged: (v) => onChange(filtres.copieAvec(categorie: v, jeu: null)),
        ),
        const SizedBox(height: 14),
        ListeDeroulante(
          label: 'Jeu',
          valeur: filtres.jeu,
          placeholder: 'Tous les jeux',
          options: jeux.map((j) => OptionListe(j.id, j.nom)).toList(),
          onChanged: (v) => onChange(filtres.copieAvec(jeu: v)),
        ),
        const SizedBox(height: 14),
        ListeDeroulante(
          label: 'Plateforme',
          valeur: filtres.plateforme,
          placeholder: 'Toutes les plateformes',
          groupes: catalogue.plateformesGroupees.entries
              .map((e) => GroupeOptions(
                    e.key.libelle,
                    e.value.map((p) => OptionListe(p.id, p.nom)).toList(),
                  ))
              .toList(),
          onChanged: (v) => onChange(filtres.copieAvec(plateforme: v)),
        ),
        const SizedBox(height: 14),
        ChampTexte(
          controleur: _miseMax,
          label: 'Mise max',
          suffixe: 'FCFA',
          chiffres: true,
          clavier: const TextInputType.numberWithOptions(decimal: false),
          formateurs: [FilteringTextInputFormatter.digitsOnly],
          placeholder: 'Toutes les mises',
          onChanged: (valeur) {
            final n = double.tryParse(valeur.trim());
            onChange(filtres.copieAvec(miseMax: (n == null || n <= 0) ? null : n));
          },
        ),
        if (filtres.actifs) ...[
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: Bouton(
              libelle: 'Effacer les filtres',
              variante: VarianteBouton.lien,
              onPressed: () {
                _miseMax.clear();
                onChange(FiltresDefis.aucun);
              },
            ),
          ),
        ],
      ],
    );
  }
}

/// Ligne de « Mes défis » : statut, mise, expiration, détail et annulation.
class _LigneMonDefi extends StatelessWidget {
  const _LigneMonDefi({required this.defi, required this.onDetail, this.onAnnuler});

  final Defi defi;
  final VoidCallback onDetail;
  final VoidCallback? onAnnuler;

  @override
  Widget build(BuildContext context) {
    return Container(
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
            children: [
              BadgeStatut(famille: FamilleStatut.defi, valeur: defi.statut),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  formatMontant(defi.montantMise, defi.devise),
                  style: Typo.chiffres(taille: 18, poids: 700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${defi.jeuNom} · ${defi.plateformeNom} · créé ${formatDateRelative(defi.dateCreation)}',
            style: Typo.petit,
          ),
          if (defi.ouvert && defi.dateExpiration != null) ...[
            const SizedBox(height: 4),
            CompteARebours(
              echeance: defi.dateExpiration!,
              libelle: 'expire dans',
              style: Typo.chiffres(taille: 12, poids: 700, couleur: Couleurs.alerte),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Bouton(
                  libelle: 'Détail',
                  variante: VarianteBouton.secondaire,
                  iconeFin: Icons.chevron_right,
                  onPressed: onDetail,
                ),
              ),
              if (onAnnuler != null) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: Bouton(
                    libelle: 'Annuler',
                    variante: VarianteBouton.danger,
                    icone: Icons.block,
                    onPressed: onAnnuler,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
