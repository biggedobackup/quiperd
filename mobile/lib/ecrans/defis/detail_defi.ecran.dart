import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/badge_statut.dart';
import '../../composants/communs/bouton.dart';
import '../../composants/communs/confirmation.dart';
import '../../composants/communs/en_tete_page.dart';
import '../../composants/communs/message.dart';
import '../../composants/communs/squelette.dart';
import '../../composants/joueur/compte_a_rebours.dart';
import '../../composants/joueur/panneaux_match.dart';
import '../../etats/catalogue.etat.dart';
import '../../etats/portefeuille.etat.dart';
import '../../etats/session.etat.dart';
import '../../noyau/catalogue.dart';
import '../../noyau/format.dart';
import '../../noyau/resultat.dart';
import '../../noyau/statuts.dart';
import '../../services/defis.service.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../matchs/detail_match.ecran.dart';

/// Fiche d'un défi : l'enjeu, les règles, et l'action qui va avec (rejoindre,
/// ou annuler s'il s'agit du sien).
class DetailDefiEcran extends StatefulWidget {
  const DetailDefiEcran({super.key, required this.defiId});

  final String defiId;

  @override
  State<DetailDefiEcran> createState() => _DetailDefiEcranState();
}

class _DetailDefiEcranState extends State<DetailDefiEcran> {
  DetailDefi? _detail;
  bool _chargement = true;
  bool _action = false;
  String? _erreur;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    final r = await DefisService.detail(widget.defiId);
    if (!mounted) return;
    setState(() {
      _chargement = false;
      if (r is Succes<DetailDefi>) {
        _detail = r.donnees;
        _erreur = null;
      } else if (r is Echec<DetailDefi>) {
        _erreur = r.message;
      }
    });
  }

  Future<void> _rejoindre() async {
    final detail = _detail;
    if (detail == null || _action) return;

    final ok = await confirmer(
      context,
      titre: 'Rejoindre ce défi ?',
      message: '${formatMontant(detail.defi.montantMise, detail.defi.devise)} seront bloqués '
          'sur votre solde jusqu’au règlement du match. Celui qui perd perd sa mise.',
      libelleConfirmer: 'Bloquer et jouer',
      icone: Icons.handshake_outlined,
    );
    if (!ok || !mounted) return;

    setState(() => _action = true);
    final r = await DefisService.rejoindre(widget.defiId);
    if (!mounted) return;
    setState(() => _action = false);

    if (r is Echec) {
      final echec = r as Echec;
      Message.erreur(
        context,
        switch (echec.statut) {
          403 => 'Action refusée',
          409 => 'Défi indisponible',
          422 => 'Solde insuffisant',
          _ => 'Impossible de rejoindre',
        },
        echec.message,
      );
      _charger();
      return;
    }

    final match = (r as Succes).donnees;
    context.read<PortefeuilleEtat>().charger(avecTransactions: false);
    Message.succes(context, 'Défi rejoint', 'Le match commence : bonne chance.');
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => DetailMatchEcran(matchId: match.id)),
    );
  }

  Future<void> _annuler() async {
    final detail = _detail;
    if (detail == null || _action) return;

    final ok = await confirmer(
      context,
      titre: 'Annuler ce défi ?',
      message: 'Votre mise sera remboursée, moins la commission de la plateforme.',
      libelleConfirmer: 'Annuler le défi',
      libelleAnnuler: 'Garder',
      destructif: true,
    );
    if (!ok || !mounted) return;

    setState(() => _action = true);
    final r = await DefisService.annuler(widget.defiId);
    if (!mounted) return;
    setState(() => _action = false);

    if (r is Echec<void>) {
      Message.erreur(context, 'Annulation impossible', r.message);
      return;
    }
    context.read<PortefeuilleEtat>().charger(avecTransactions: false);
    Message.succes(context, 'Défi annulé', 'Votre mise vous a été rendue, moins la commission.');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final moi = context.watch<SessionEtat>().utilisateur;
    final regles = context.watch<CatalogueEtat>().regles;

    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(title: const Text('Détail du défi')),
      body: SafeArea(
        child: _construireCorps(moi?.id ?? '', regles.commissionDefi),
      ),
    );
  }

  Widget _construireCorps(String moiId, double commission) {
    if (_chargement) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: SqueletteDiffere(child: SqueletteCartes(nombre: 3)),
      );
    }
    if (_erreur != null || _detail == null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Encart(ton: TonMessage.erreur, texte: _erreur ?? 'Défi introuvable.'),
            const SizedBox(height: 14),
            Bouton(
              libelle: 'Réessayer',
              variante: VarianteBouton.secondaire,
              icone: Icons.refresh,
              onPressed: () {
                setState(() => _chargement = true);
                _charger();
              },
            ),
          ],
        ),
      );
    }

    final detail = _detail!;
    final defi = detail.defi;
    final mien = defi.createurId == moiId;
    final categorie = decrireCategorie(defi.jeuCategorie);
    final mise = versNombre(defi.montantMise);

    return RefreshIndicator(
      onRefresh: _charger,
      color: Couleurs.vert,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          EnTetePage(
            surtitre: 'Défi · ${defi.jeuNom}',
            titre: formatMontant(defi.montantMise, defi.devise),
            description: mien ? 'Vous avez créé ce défi.' : 'Proposé par ${defi.createurNom}.',
          ),
          const SizedBox(height: 20),

          // Le défi a déjà donné un match : on y mène plutôt que de laisser
          // croire qu'il est encore rejoignable.
          if (detail.match != null) ...[
            Encart(
              ton: TonMessage.info,
              icone: Icons.sports_esports_outlined,
              texte: 'Ce défi a été rejoint : le match est en cours.',
              action: Bouton(
                libelle: 'Voir le match',
                variante: VarianteBouton.volt,
                iconeFin: Icons.chevron_right,
                onPressed: () => Navigator.of(context).pushReplacement(
                  MaterialPageRoute(
                    builder: (_) => DetailMatchEcran(matchId: detail.match!.id),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],

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
                _Info(
                  libelle: 'Statut',
                  enfant: BadgeStatut(famille: FamilleStatut.defi, valeur: defi.statut),
                ),
                _Info(
                  libelle: 'Jeu',
                  enfant: Row(
                    children: [
                      Icon(categorie.icone, size: 16, color: Couleurs.vert),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text('${defi.jeuNom} · ${categorie.libelle}',
                            style: Typo.legendeForte, overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ),
                ),
                _Info(
                  libelle: 'Plateforme',
                  enfant: Text(defi.plateformeNom, style: Typo.legendeForte),
                ),
                _Info(
                  libelle: 'Créé',
                  enfant: Text(formatDateHeure(defi.dateCreation), style: Typo.legende),
                ),
                if (defi.dateExpiration != null)
                  _Info(
                    libelle: 'Expiration',
                    enfant: defi.ouvert
                        ? CompteARebours(
                            echeance: defi.dateExpiration!,
                            libelle: 'dans',
                            style: Typo.chiffres(taille: 13, poids: 700, couleur: Couleurs.alerte),
                            surFin: _charger,
                          )
                        : Text(formatDateHeure(defi.dateExpiration), style: Typo.legende),
                  ),
                if (defi.regles.isNotEmpty)
                  _Info(
                    libelle: 'Règles du match',
                    pleineLargeur: true,
                    enfant: Text(defi.regles, style: Typo.legende),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          RecapitulatifEnjeu(
            mise: mise,
            devise: defi.devise,
            tauxCommission: commission,
            titre: 'Enjeu',
          ),
          const SizedBox(height: 22),
          if (defi.ouvert && detail.match == null)
            if (mien)
              Bouton(
                libelle: 'Annuler le défi',
                bloc: true,
                taille: TailleBouton.lg,
                variante: VarianteBouton.danger,
                icone: Icons.block,
                chargement: _action,
                onPressed: _annuler,
              )
            else
              Bouton(
                libelle: 'Rejoindre ce défi',
                bloc: true,
                taille: TailleBouton.lg,
                variante: VarianteBouton.volt,
                icone: Icons.handshake_outlined,
                chargement: _action,
                onPressed: _rejoindre,
              )
          else if (detail.match == null)
            Encart(
              texte: 'Ce défi n’est plus ouvert : '
                  '${decrireStatut(FamilleStatut.defi, defi.statut).libelle.toLowerCase()}.',
            ),
        ],
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.libelle, required this.enfant, this.pleineLargeur = false});

  final String libelle;
  final Widget enfant;
  final bool pleineLargeur;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: pleineLargeur
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(libelle.toUpperCase(),
                    style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
                const SizedBox(height: 6),
                enfant,
              ],
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(libelle.toUpperCase(),
                    style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
                const SizedBox(width: 12),
                Flexible(child: Align(alignment: Alignment.centerRight, child: enfant)),
              ],
            ),
    );
  }
}
