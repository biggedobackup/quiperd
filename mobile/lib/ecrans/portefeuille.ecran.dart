import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../composants/communs/badge_statut.dart';
import '../composants/communs/bouton.dart';
import '../composants/communs/en_tete_page.dart';
import '../composants/communs/etat_vide.dart';
import '../composants/communs/indicateur_direct.dart';
import '../composants/communs/message.dart';
import '../composants/communs/squelette.dart';
import '../composants/joueur/bandeau_email_non_confirme.dart';
import '../composants/joueur/feuilles/depot.feuille.dart';
import '../composants/joueur/feuilles/retrait.feuille.dart';
import '../etats/catalogue.etat.dart';
import '../etats/portefeuille.etat.dart';
import '../etats/session.etat.dart';
import '../modeles/transaction_portefeuille.modele.dart';
import '../noyau/format.dart';
import '../noyau/resultat.dart';
import '../noyau/statuts.dart';
import '../services/paiements.service.dart';
import '../services/portefeuille.service.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';
import 'coquille.ecran.dart';

/// Portefeuille : soldes, dépôt, retrait, historique.
///
/// Tout ce qui bouge ici est **poussé** (`portefeuille.maj`,
/// `transaction.creee`, `paiement.statut`). Après un dépôt Mobile Money, on ne
/// sonde jamais le prestataire : l'issue arrive par le socket.
class PortefeuilleEcran extends StatefulWidget {
  const PortefeuilleEcran({super.key});

  @override
  State<PortefeuilleEcran> createState() => _PortefeuilleEcranState();
}

class _PortefeuilleEcranState extends State<PortefeuilleEcran> {
  bool _action = false;
  bool _retraitRefuse = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<PortefeuilleEtat>().surEvenementPaiement = _annoncerPaiement;
    });
  }

  void _annoncerPaiement(String evenement, Map<String, dynamic> charge) {
    if (!mounted) return;
    final type = '${charge['type']}';
    final statut = '${charge['statut']}';
    final somme = formatMontant(charge['montant'], '${charge['devise'] ?? 'XOF'}');

    switch (statut) {
      case 'reussi':
        Message.succes(
          context,
          type == 'depot' ? 'Dépôt confirmé' : 'Retrait envoyé',
          type == 'depot'
              ? '$somme crédités sur votre solde disponible.'
              : '$somme transférés vers votre numéro Mobile Money.',
        );
      case 'echoue':
        Message.erreur(
          context,
          type == 'depot' ? 'Dépôt échoué' : 'Retrait échoué',
          type == 'depot'
              ? 'Aucun montant n’a été débité. Vérifiez votre solde Mobile Money, puis réessayez.'
              : 'Montant et frais ont été recrédités sur votre solde disponible.',
        );
      case 'rembourse':
        Message.info(context, 'Dépôt remboursé', '$somme ont été repris sur votre solde.');
    }
  }

  Future<void> _deposer() async {
    final session = context.read<SessionEtat>();
    final demande = await ouvrirDepot(
      context,
      prestataires: context.read<CatalogueEtat>().prestataires,
      telephone: session.utilisateur?.telephone,
    );
    if (demande == null || !mounted) return;

    setState(() => _action = true);
    final r = await PaiementsService.deposer(
      montant: demande.montant,
      prestataire: demande.prestataire,
      numero: demande.numero,
    );
    if (!mounted) return;
    setState(() => _action = false);

    if (r is Echec) {
      Message.erreur(context, 'Dépôt impossible', (r as Echec).message);
      return;
    }

    final reponse = (r as Succes).donnees;
    final portefeuille = context.read<PortefeuilleEtat>();
    if (reponse.paiement != null) {
      portefeuille.suivre(PaiementSuivi(
        id: reponse.paiement!.id,
        type: reponse.paiement!.type,
        montant: reponse.paiement!.montant,
        devise: reponse.paiement!.devise,
        statut: reponse.paiement!.statut,
      ));
    }

    final url = reponse.urlPaiement;
    if (url != null && url.isNotEmpty) {
      // Page hébergée du prestataire : navigateur du système, jamais une vue
      // interne bricolée. Le retour se fait par le socket, pas par un sondage.
      final ouvert = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!mounted) return;
      if (!ouvert) {
        Message.erreur(context, 'Page de paiement inaccessible', 'Réessayez dans un instant.');
        return;
      }
      Message.info(
        context,
        'Paiement ouvert',
        'Validez sur la page du prestataire : votre solde se mettra à jour ici tout seul.',
      );
      return;
    }

    Message.info(
      context,
      'Dépôt enregistré',
      reponse.message ?? 'En attente de confirmation du prestataire.',
    );
    portefeuille.charger(avecTransactions: false);
  }

  Future<void> _retirer() async {
    final session = context.read<SessionEtat>();
    final etat = context.read<PortefeuilleEtat>();
    final regles = context.read<CatalogueEtat>().regles;

    final demande = await ouvrirRetrait(
      context,
      disponible: versNombre(etat.portefeuille.soldeDisponible),
      tauxFrais: regles.fraisRetrait,
      prestataires: context.read<CatalogueEtat>().prestataires,
      telephone: session.utilisateur?.telephone,
    );
    if (demande == null || !mounted) return;

    setState(() => _action = true);
    final r = await PaiementsService.retirer(
      montant: demande.montant,
      prestataire: demande.prestataire,
      numero: demande.numero,
    );
    if (!mounted) return;
    setState(() => _action = false);

    if (r is Echec) {
      final echec = r as Echec;
      if (echec.emailNonConfirme) {
        setState(() => _retraitRefuse = true);
        Message.attention(context, 'Adresse à confirmer', echec.message);
        return;
      }
      Message.erreur(
        context,
        echec.statut == 422 ? 'Solde insuffisant' : 'Retrait impossible',
        echec.message,
      );
      return;
    }

    final paiement = (r as Succes).donnees;
    etat.suivre(PaiementSuivi(
      id: paiement.id,
      type: paiement.type,
      montant: paiement.montant,
      devise: paiement.devise,
      statut: paiement.statut,
    ));
    Message.succes(
      context,
      'Retrait demandé',
      '${formatMontant(paiement.montant, paiement.devise)} '
          '+ ${formatMontant(paiement.frais, paiement.devise)} de frais débités. '
          'Traitement en cours.',
    );
    etat.charger(avecTransactions: false);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionEtat>();
    final etat = context.watch<PortefeuilleEtat>();
    final portefeuille = etat.portefeuille;
    final retraitBloque = session.emailNonConfirme || _retraitRefuse;

    return RefreshIndicator(
      onRefresh: () => etat.charger(),
      color: Couleurs.vert,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          const EnTetePage(
            surtitre: 'Argent',
            titre: 'Portefeuille',
            description: 'Le solde bloqué correspond à vos mises engagées ; seul le solde '
                'disponible peut être misé ou retiré.',
            action: IndicateurDirect(compact: true),
          ),
          const SizedBox(height: 20),
          if (retraitBloque) ...[
            BlocEmailNonConfirme(
              action: 'demander un retrait',
              note: 'Le dépôt, lui, reste possible : vous pouvez alimenter votre '
                  'portefeuille dès maintenant.',
              onConfirmer: () async {
                await CoquilleEcran.de(context)?.ouvrirConfirmationEmail();
                if (mounted) setState(() => _retraitRefuse = false);
              },
            ),
            const SizedBox(height: 20),
          ],
          _CarteSolde(
            titre: 'Disponible',
            montant: portefeuille.soldeDisponible,
            devise: portefeuille.devise,
            legende: 'Misable et retirable.',
            sombre: true,
          ),
          const SizedBox(height: 12),
          _CarteSolde(
            titre: 'Bloqué en séquestre',
            montant: portefeuille.soldeBloque,
            devise: portefeuille.devise,
            legende: 'Vos mises engagées sur des défis ou matchs en cours.',
            sombre: false,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Bouton(
                  libelle: retraitBloque ? 'Confirmer pour retirer' : 'Retirer',
                  variante: VarianteBouton.secondaire,
                  icone: retraitBloque ? Icons.mail_outline : Icons.north_east,
                  chargement: _action,
                  onPressed: retraitBloque
                      ? () => CoquilleEcran.de(context)?.ouvrirConfirmationEmail()
                      : _retirer,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Bouton(
                  libelle: 'Déposer',
                  variante: VarianteBouton.volt,
                  icone: Icons.south_west,
                  chargement: _action,
                  onPressed: _deposer,
                ),
              ),
            ],
          ),
          if (etat.suivis.isNotEmpty) ...[
            const SizedBox(height: 22),
            Text('PAIEMENTS EN COURS',
                style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
            const SizedBox(height: 10),
            ...etat.suivis.map(
              (p) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _CarteSuivi(paiement: p, onMasquer: () => etat.masquerSuivi(p.id)),
              ),
            ),
          ],
          const SizedBox(height: 26),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Historique', style: Typo.h3),
              Text('${PortefeuilleService.taillePage} par page', style: Typo.petit),
            ],
          ),
          const SizedBox(height: 12),
          if (etat.horsPage > 0) ...[
            Encart(
              ton: TonMessage.succes,
              icone: Icons.arrow_upward,
              texte: '${etat.horsPage} '
                  '${pluriel(etat.horsPage, 'nouveau mouvement', 'nouveaux mouvements')} '
                  'sur votre compte.',
              action: Bouton(
                libelle: 'Voir la page 1',
                variante: VarianteBouton.secondaire,
                onPressed: () => etat.chargerTransactions(page: 1),
              ),
            ),
            const SizedBox(height: 14),
          ],
          if (etat.chargementTransactions)
            const SqueletteCartes(nombre: 3, hauteur: 72)
          else if (etat.transactions.isEmpty)
            EtatVide(
              icone: Icons.swap_horiz,
              titre: 'Aucune transaction',
              description: 'Votre premier dépôt apparaîtra ici.',
              action: Bouton(
                libelle: 'Déposer',
                variante: VarianteBouton.volt,
                icone: Icons.south_west,
                onPressed: _deposer,
              ),
            )
          else ...[
            ...etat.transactions.map(
              (t) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _LigneTransaction(
                  transaction: t,
                  nouvelle: etat.recentes.contains(t.id),
                  devise: portefeuille.devise,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Bouton(
                  libelle: 'Précédent',
                  variante: VarianteBouton.secondaire,
                  taille: TailleBouton.sm,
                  icone: Icons.chevron_left,
                  onPressed: etat.page > 1
                      ? () => etat.chargerTransactions(page: etat.page - 1)
                      : null,
                ),
                Text('Page ${etat.page}', style: Typo.chiffres(taille: 12, poids: 700)),
                Bouton(
                  libelle: 'Suivant',
                  variante: VarianteBouton.secondaire,
                  taille: TailleBouton.sm,
                  iconeFin: Icons.chevron_right,
                  onPressed: etat.pageSuivantePossible
                      ? () => etat.chargerTransactions(page: etat.page + 1)
                      : null,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _CarteSolde extends StatelessWidget {
  const _CarteSolde({
    required this.titre,
    required this.montant,
    required this.devise,
    required this.legende,
    required this.sombre,
  });

  final String titre;
  final String montant;
  final String devise;
  final String legende;
  final bool sombre;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: sombre ? Couleurs.encre : Couleurs.papier,
        border: Border.all(color: sombre ? Couleurs.encre : Couleurs.trait),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            titre.toUpperCase(),
            style: Typo.etiquette.copyWith(
              fontSize: 10,
              color: sombre ? Couleurs.craie.withValues(alpha: 0.6) : Couleurs.muet,
            ),
          ),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              formatMontant(montant, devise),
              style: Typo.chiffres(
                taille: 32,
                poids: 700,
                couleur: sombre ? Couleurs.volt : Couleurs.encre,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            legende,
            style: Typo.petit.copyWith(
              color: sombre ? Couleurs.craie.withValues(alpha: 0.7) : Couleurs.muet,
            ),
          ),
        ],
      ),
    );
  }
}

class _CarteSuivi extends StatelessWidget {
  const _CarteSuivi({required this.paiement, required this.onMasquer});

  final PaiementSuivi paiement;
  final VoidCallback onMasquer;

  /// Ce que le joueur doit comprendre, en une phrase, pour chaque issue.
  String get _aide {
    if (paiement.statut == 'en_attente') {
      return paiement.type == 'depot'
          ? 'Validez la demande sur votre téléphone : le solde se met à jour ici tout seul.'
          : 'Transfert en cours de traitement vers votre numéro Mobile Money.';
    }
    if (paiement.statut == 'reussi') {
      return paiement.type == 'depot'
          ? 'Montant crédité sur votre solde disponible.'
          : 'Transfert envoyé vers votre numéro Mobile Money.';
    }
    if (paiement.statut == 'echoue') {
      return paiement.type == 'depot'
          ? 'Rien n’a été débité. Vérifiez votre solde Mobile Money, puis réessayez.'
          : 'Montant et frais ont été recrédités sur votre solde disponible.';
    }
    if (paiement.statut == 'rembourse') {
      return 'Le dépôt a été remboursé : le montant a été repris sur votre solde.';
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: Couleurs.trait),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: Couleurs.vertPale,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  paiement.type == 'depot' ? Icons.south_west : Icons.north_east,
                  size: 17,
                  color: Couleurs.vert,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${paiement.type == 'depot' ? 'Dépôt' : 'Retrait'} de '
                  '${formatMontant(paiement.montant, paiement.devise)}',
                  style: Typo.legendeForte,
                ),
              ),
              BadgeStatut(famille: FamilleStatut.paiement, valeur: paiement.statut, compact: true),
            ],
          ),
          const SizedBox(height: 8),
          Text(_aide, style: Typo.petit),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: onMasquer,
              style: TextButton.styleFrom(minimumSize: const Size(0, 40)),
              child: Text('MASQUER',
                  style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10)),
            ),
          ),
        ],
      ),
    );
  }
}

class _LigneTransaction extends StatelessWidget {
  const _LigneTransaction({
    required this.transaction,
    required this.nouvelle,
    required this.devise,
  });

  final TransactionPortefeuille transaction;
  final bool nouvelle;
  final String devise;

  @override
  Widget build(BuildContext context) {
    final type = typesTransaction[transaction.type];
    final informative = transaction.commissionInformative;
    final sens = informative
        ? SensMontant.neutre
        : switch (type?.sens) {
            'credit' => SensMontant.credit,
            'debit' => SensMontant.debit,
            _ => SensMontant.neutre,
          };
    final couleur = informative
        ? Couleurs.muet
        : switch (sens) {
            SensMontant.credit => Couleurs.gain,
            SensMontant.debit => Couleurs.perte,
            SensMontant.neutre => Couleurs.encre,
          };

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Couleurs.papier,
        border: Border.all(color: nouvelle ? Couleurs.vert : Couleurs.trait),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      child: Text(
                        type?.libelle ?? transaction.type,
                        style: Typo.legendeForte,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (nouvelle) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Couleurs.vert,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('NOUVEAU',
                            style: Typo.etiquette.copyWith(
                                color: Couleurs.craie, fontSize: 9)),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                formatMontantSigne(transaction.montant, sens, devise),
                style: Typo.chiffres(taille: 14, poids: 700, couleur: couleur),
              ),
            ],
          ),
          if (transaction.description.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(transaction.description,
                style: Typo.petit, maxLines: 2, overflow: TextOverflow.ellipsis),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(formatDateHeure(transaction.dateCreation), style: Typo.petit),
              ),
              BadgeStatut(
                famille: FamilleStatut.transaction,
                valeur: transaction.statut,
                compact: true,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
