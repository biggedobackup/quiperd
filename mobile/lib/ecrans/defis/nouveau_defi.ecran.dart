import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/bouton.dart';
import '../../composants/communs/champ_texte.dart';
import '../../composants/communs/en_tete_page.dart';
import '../../composants/communs/liste_deroulante.dart';
import '../../composants/communs/message.dart';
import '../../composants/joueur/bandeau_email_non_confirme.dart';
import '../../composants/joueur/panneaux_match.dart';
import '../../etats/catalogue.etat.dart';
import '../../etats/portefeuille.etat.dart';
import '../../etats/session.etat.dart';
import '../../noyau/format.dart';
import '../../noyau/resultat.dart';
import '../../noyau/validateurs.dart';
import '../../services/defis.service.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../coquille.ecran.dart';
import 'detail_defi.ecran.dart';

/// Création d'un défi.
///
/// Les bornes de mise et la commission viennent de l'API — **jamais** de
/// constantes écrites ici. Le récapitulatif annonce ce qui est bloqué et ce qui
/// serait gagné, en rappelant que le montant réel est calculé au règlement.
class NouveauDefiEcran extends StatefulWidget {
  const NouveauDefiEcran({super.key});

  @override
  State<NouveauDefiEcran> createState() => _NouveauDefiEcranState();
}

class _NouveauDefiEcranState extends State<NouveauDefiEcran> {
  static const List<({String valeur, String libelle})> _durees = [
    (valeur: '6', libelle: '6 heures'),
    (valeur: '12', libelle: '12 heures'),
    (valeur: '24', libelle: '24 heures (défaut)'),
    (valeur: '48', libelle: '48 heures'),
    (valeur: '72', libelle: '72 heures'),
  ];

  final _cle = GlobalKey<FormState>();
  final _mise = TextEditingController();
  final _regles = TextEditingController();

  String? _jeuId;
  String? _plateformeId;
  String _duree = '24';
  bool _envoi = false;

  /// Le backend a répondu 403 alors que la session lue au chargement semblait
  /// confirmée : on bascule sur le bloc explicatif plutôt que de laisser le
  /// joueur réessayer en boucle.
  bool _refuseParLeServeur = false;

  @override
  void initState() {
    super.initState();
    final regles = context.read<CatalogueEtat>().regles;
    _mise.text = regles.miseMinimale.toStringAsFixed(0);
  }

  @override
  void dispose() {
    _mise.dispose();
    _regles.dispose();
    super.dispose();
  }

  double get _valeurMise => double.tryParse(_mise.text.trim().replaceAll(',', '.')) ?? 0;

  Future<void> _creer() async {
    if (_envoi || !(_cle.currentState?.validate() ?? false)) return;
    if (_jeuId == null || _plateformeId == null) {
      Message.attention(context, 'Choix incomplet', 'Sélectionnez un jeu et une plateforme.');
      return;
    }
    setState(() => _envoi = true);

    final r = await DefisService.creer(
      jeuId: _jeuId!,
      plateformeId: _plateformeId!,
      montantMise: _valeurMise,
      regles: _regles.text.trim(),
      dureeHeures: int.parse(_duree),
    );

    if (!mounted) return;
    setState(() => _envoi = false);

    if (r is Echec) {
      final echec = r as Echec;
      if (echec.emailNonConfirme) {
        setState(() => _refuseParLeServeur = true);
        Message.attention(context, 'Adresse à confirmer', echec.message);
        return;
      }
      Message.erreur(
        context,
        echec.statut == 422 ? 'Solde insuffisant' : 'Création impossible',
        echec.message,
      );
      return;
    }

    final defi = (r as Succes).donnees;
    Message.succes(
      context,
      'Défi créé',
      '${formatMontant(defi.montantMise, defi.devise)} bloqués en séquestre. '
          'En attente d’un adversaire.',
    );
    context.read<PortefeuilleEtat>().charger(avecTransactions: false);
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => DetailDefiEcran(defiId: defi.id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionEtat>();
    final catalogue = context.watch<CatalogueEtat>();
    final regles = catalogue.regles;
    final disponible = versNombre(context.watch<PortefeuilleEtat>().portefeuille.soldeDisponible);
    final devise = context.watch<PortefeuilleEtat>().portefeuille.devise;
    final bloque = session.emailNonConfirme || _refuseParLeServeur;
    final soldeInsuffisant = _valeurMise > disponible;

    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(title: const Text('Nouveau défi')),
      body: SafeArea(
        child: bloque
            ? ListView(
                padding: const EdgeInsets.all(16),
                children: [BlocEmailNonConfirme(
                  action: 'créer un défi',
                  note: 'Vous pourrez reprendre la création juste après.',
                  onConfirmer: () async {
                    await CoquilleEcran.de(context)?.ouvrirConfirmationEmail();
                    if (mounted) setState(() => _refuseParLeServeur = false);
                  },
                )],
              )
            : Form(
                key: _cle,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  children: [
                    const EnTetePage(
                      surtitre: 'Arène',
                      titre: 'Nouveau défi',
                      description: 'Votre mise est bloquée dès la création ; si personne ne '
                          'rejoint, elle vous est rendue en totalité, sans commission.',
                    ),
                    const SizedBox(height: 24),
                    ListeDeroulante(
                      label: 'Jeu',
                      valeur: _jeuId,
                      placeholder: 'Choisissez un jeu',
                      aide: 'Classés par catégorie : sport, combat, course, tir…',
                      groupes: catalogue.jeuxGroupes.entries
                          .map((e) => GroupeOptions(
                                e.key.libelle,
                                e.value.map((j) => OptionListe(j.id, j.nom)).toList(),
                              ))
                          .toList(),
                      onChanged: (v) => setState(() => _jeuId = v),
                    ),
                    const SizedBox(height: 18),
                    ListeDeroulante(
                      label: 'Plateforme',
                      valeur: _plateformeId,
                      placeholder: 'Choisissez une plateforme',
                      aide: 'PC, consoles ou mobile.',
                      groupes: catalogue.plateformesGroupees.entries
                          .map((e) => GroupeOptions(
                                e.key.libelle,
                                e.value.map((p) => OptionListe(p.id, p.nom)).toList(),
                              ))
                          .toList(),
                      onChanged: (v) => setState(() => _plateformeId = v),
                    ),
                    const SizedBox(height: 18),
                    ChampTexte(
                      controleur: _mise,
                      label: 'Mise par joueur',
                      suffixe: 'FCFA',
                      chiffres: true,
                      clavier: const TextInputType.numberWithOptions(decimal: false),
                      formateurs: [FilteringTextInputFormatter.digitsOnly],
                      onChanged: (_) => setState(() {}),
                      aide: 'Entre ${formatMontant(regles.miseMinimale)} et '
                          '${formatMontant(regles.miseMaximale)}. '
                          'Disponible : ${formatMontant(disponible, devise)}.',
                      validateur: (valeur) => validerMontant(
                        valeur,
                        minimum: regles.miseMinimale,
                        maximum: regles.miseMaximale,
                        formater: formatMontant,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [500, 1000, 2000, 5000, 10000]
                          .where((m) => m >= regles.miseMinimale && m <= regles.miseMaximale)
                          .map((m) => _MiseRapide(
                                montant: m,
                                onTap: () => setState(() => _mise.text = '$m'),
                              ))
                          .toList(),
                    ),
                    const SizedBox(height: 18),
                    ListeDeroulante(
                      label: 'Durée d’ouverture',
                      valeur: _duree,
                      options: _durees.map((d) => OptionListe(d.valeur, d.libelle)).toList(),
                      aide: 'Sans adversaire à l’échéance, le défi expire et la mise vous '
                          'est rendue en totalité, sans commission.',
                      onChanged: (v) => setState(() => _duree = v ?? '24'),
                    ),
                    const SizedBox(height: 18),
                    ChampTexte(
                      controleur: _regles,
                      label: 'Règles du match (optionnel)',
                      placeholder: 'Ex. 2 × 6 min, connexion stable exigée.',
                      lignes: 3,
                      longueurMax: 500,
                      validateur: (valeur) =>
                          (valeur ?? '').length > 500 ? '500 caractères maximum' : null,
                    ),
                    const SizedBox(height: 24),
                    RecapitulatifEnjeu(
                      mise: _valeurMise,
                      devise: devise,
                      tauxCommission: regles.commissionDefi,
                    ),
                    const SizedBox(height: 16),
                    if (soldeInsuffisant)
                      Encart(
                        ton: TonMessage.erreur,
                        texte: 'Solde disponible insuffisant '
                            '(${formatMontant(disponible, devise)}).',
                        action: Bouton(
                          libelle: 'Déposer des fonds',
                          variante: VarianteBouton.secondaire,
                          icone: Icons.south_west,
                          onPressed: () {
                            // La coquille est capturée AVANT le dépilement :
                            // après le pop, ce contexte n'est plus monté.
                            final coquille = CoquilleEcran.de(context);
                            Navigator.of(context).pop();
                            coquille?.allerA(3);
                          },
                        ),
                      )
                    else
                      Encart(
                        texte: 'Après création, il vous restera '
                            '${formatMontant(disponible - _valeurMise, devise)} disponibles.',
                      ),
                    const SizedBox(height: 20),
                    Bouton(
                      libelle: _valeurMise > 0
                          ? 'Créer et bloquer ${formatMontant(_valeurMise, devise)}'
                          : 'Créer et bloquer la mise',
                      bloc: true,
                      taille: TailleBouton.lg,
                      variante: VarianteBouton.volt,
                      icone: Icons.local_fire_department_outlined,
                      chargement: _envoi,
                      onPressed: soldeInsuffisant ? null : _creer,
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _MiseRapide extends StatelessWidget {
  const _MiseRapide({required this.montant, required this.onTap});

  final int montant;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Couleurs.gris,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Ink(
          decoration: BoxDecoration(
            border: Border.all(color: Couleurs.trait),
            borderRadius: BorderRadius.circular(10),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Text(formatMontant(montant), style: Typo.chiffres(taille: 13, poids: 700)),
        ),
      ),
    );
  }
}
