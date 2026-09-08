import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../etats/catalogue.etat.dart';
import '../../../modeles/paiement.modele.dart';
import '../../../noyau/format.dart';
import '../../../theme/couleurs.dart';
import '../../../theme/typographie.dart';
import '../../communs/bouton.dart';
import '../../communs/champ_texte.dart';
import '../../communs/liste_deroulante.dart';
import '../../communs/message.dart';
import 'depot.feuille.dart' show AucunPrestataire;

class DemandeRetrait {
  const DemandeRetrait(this.montant, this.prestataire, this.numero);
  final double montant;
  final String prestataire;
  final String numero;
}

/// Retrait vers Mobile Money.
///
/// Les frais affichés ici sont une **estimation au taux en vigueur**, calculée
/// pour que le joueur sache ce qui sera débité ; le montant qui fait foi est
/// celui que le backend calcule et renvoie.
Future<DemandeRetrait?> ouvrirRetrait(
  BuildContext context, {
  required double retirable,
  required double nonJoue,
  required double tauxFrais,
  String? telephone,
}) {
  return showModalBottomSheet<DemandeRetrait>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) => _FeuilleRetrait(
      retirable: retirable,
      nonJoue: nonJoue,
      tauxFrais: tauxFrais,
      telephone: telephone,
    ),
  );
}

class _FeuilleRetrait extends StatefulWidget {
  const _FeuilleRetrait({
    required this.retirable,
    required this.nonJoue,
    required this.tauxFrais,
    this.telephone,
  });

  /// Plafond RÉEL du retrait : `soldeRetirable` du serveur, jamais le disponible brut.
  final double retirable;

  /// Part venue d'un dépôt jamais misé — sert à expliquer pourquoi le plafond est plus bas.
  final double nonJoue;
  final double tauxFrais;

  final String? telephone;

  @override
  State<_FeuilleRetrait> createState() => _FeuilleRetraitState();
}

class _FeuilleRetraitState extends State<_FeuilleRetrait> {
  final _cleFormulaire = GlobalKey<FormState>();
  final _montant = TextEditingController(text: '1000');
  late final _numero = TextEditingController(text: widget.telephone ?? '');
  /// `null` tant que le joueur n'a rien choisi : voir la note de `depot.feuille.dart`.
  String? _prestataireChoisi;

  List<PrestatairePublic> get _prestataires => context.watch<CatalogueEtat>().prestataires;

  PrestatairePublic? get _choisi {
    final liste = _prestataires;
    if (liste.isEmpty) return null;
    return liste.where((p) => p.code == _prestataireChoisi).firstOrNull ?? liste.first;
  }

  String get _prestataire => _choisi?.code ?? '';

  double get _valeur => double.tryParse(_montant.text.trim().replaceAll(',', '.')) ?? 0;
  double get _frais => _valeur * widget.tauxFrais;
  double get _total => _valeur + _frais;

  @override
  void dispose() {
    _montant.dispose();
    _numero.dispose();
    super.dispose();
  }

  void _valider() {
    if (!(_cleFormulaire.currentState?.validate() ?? false)) return;
    final code = _choisi?.code;
    if (code == null) return; // la passerelle a disparu entre-temps : ne rien envoyer
    Navigator.of(context).pop(DemandeRetrait(_valeur, code, _numero.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final prestataires = _prestataires;
    if (prestataires.isEmpty) return const AucunPrestataire(pour: 'retrait');

    final insuffisant = _total > widget.retirable;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: SingleChildScrollView(
          child: Form(
            key: _cleFormulaire,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Retirer des fonds', style: Typo.h3),
                const SizedBox(height: 4),
                Text(
                  'Le montant et les frais sont débités immédiatement du solde '
                  'disponible. En cas d’échec du retrait, tout est recrédité.',
                  style: Typo.petit,
                ),
                // Sans cette phrase, un joueur qui voit « 5 000 FCFA » et ne peut rien retirer
                // croit à une panne. On nomme le montant concerné et la façon d'y remédier :
                // miser, ce qui est précisément l'objet de la plateforme.
                if (widget.nonJoue > 0) ...[
                  const SizedBox(height: 16),
                  Encart(
                    ton: TonMessage.attention,
                    texte: '${formatMontant(widget.nonJoue)} de votre solde vient d’un dépôt qui '
                        'n’a pas encore été misé. Un dépôt se joue avant de pouvoir être retiré : '
                        'lancez ou rejoignez un défi et ce montant redeviendra retirable.',
                  ),
                ],
                const SizedBox(height: 20),
                ChampTexte(
                  controleur: _montant,
                  label: 'Montant à recevoir',
                  suffixe: 'FCFA',
                  chiffres: true,
                  clavier: const TextInputType.numberWithOptions(decimal: false),
                  formateurs: [FilteringTextInputFormatter.digitsOnly],
                  aide: 'Retirable : ${formatMontant(widget.retirable)}',
                  onChanged: (_) => setState(() {}),
                  validateur: (valeur) {
                    final n = double.tryParse((valeur ?? '').trim());
                    if (n == null || n <= 0) return 'Entrez un montant valide';
                    if (n < 500) return 'Minimum : ${formatMontant(500)}';
                    if (n + n * widget.tauxFrais > widget.retirable) {
                      return 'Au-delà du solde retirable, frais compris';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Couleurs.gris,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    children: [
                      _Ligne('Montant reçu', formatMontant(_valeur)),
                      const SizedBox(height: 6),
                      _Ligne(
                        'Frais (${formatPourcentage(widget.tauxFrais)})',
                        formatMontant(_frais),
                      ),
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Divider(height: 1),
                      ),
                      _Ligne('Débité de votre solde', formatMontant(_total), fort: true),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                if (prestataires.length > 1)
                  ListeDeroulante(
                    label: 'Prestataire',
                    valeur: _prestataire,
                    options: prestataires
                        .map((p) => OptionListe(p.code, p.libelle))
                        .toList(),
                    onChanged: (v) =>
                        setState(() => _prestataireChoisi = v),
                  )
                else
                  Text('Transfert via ${prestataires.first.libelle}.', style: Typo.petit),
                const SizedBox(height: 18),
                ChampTexte(
                  controleur: _numero,
                  label: 'Numéro Mobile Money',
                  placeholder: '+225 07 00 00 00 00',
                  clavier: TextInputType.phone,
                  validateur: (valeur) =>
                      (valeur ?? '').trim().isEmpty ? 'Numéro obligatoire' : null,
                ),
                if (insuffisant) ...[
                  const SizedBox(height: 16),
                  Encart(
                    ton: TonMessage.erreur,
                    texte: 'Au-delà de votre solde retirable : il faut '
                        '${formatMontant(_total)} frais compris.',
                  ),
                ],
                const SizedBox(height: 22),
                Bouton(
                  libelle: 'Demander le retrait',
                  bloc: true,
                  taille: TailleBouton.lg,
                  variante: VarianteBouton.volt,
                  icone: Icons.north_east,
                  onPressed: insuffisant ? null : _valider,
                ),
                const SizedBox(height: 10),
                Bouton(
                  libelle: 'Annuler',
                  bloc: true,
                  variante: VarianteBouton.secondaire,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne(this.libelle, this.valeur, {this.fort = false});

  final String libelle;
  final String valeur;
  final bool fort;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          libelle,
          style: fort ? Typo.legendeForte : Typo.legende.copyWith(color: Couleurs.muet),
        ),
        Text(valeur, style: Typo.chiffres(taille: 13, poids: fort ? 700 : 400)),
      ],
    );
  }
}
