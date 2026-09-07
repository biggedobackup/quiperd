import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../modeles/paiement.modele.dart';
import '../../../noyau/format.dart';
import '../../../theme/couleurs.dart';
import '../../../theme/typographie.dart';
import '../../communs/bouton.dart';
import '../../communs/champ_texte.dart';
import '../../communs/liste_deroulante.dart';
import '../../communs/message.dart';

class DemandeDepot {
  const DemandeDepot(this.montant, this.prestataire, this.numero);
  final double montant;
  final String prestataire;
  final String? numero;
}

/// Dépôt Mobile Money. Le paiement se termine sur la page hébergée du
/// prestataire ; le solde, lui, se met à jour tout seul par le socket.
Future<DemandeDepot?> ouvrirDepot(
  BuildContext context, {
  required List<PrestatairePublic> prestataires,
  String? telephone,
}) {
  return showModalBottomSheet<DemandeDepot>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) => _FeuilleDepot(prestataires: prestataires, telephone: telephone),
  );
}

class _FeuilleDepot extends StatefulWidget {
  const _FeuilleDepot({required this.prestataires, this.telephone});

  /// Moyens de paiement annoncés par le backend — jamais une liste en dur ici.
  final List<PrestatairePublic> prestataires;
  final String? telephone;

  @override
  State<_FeuilleDepot> createState() => _FeuilleDepotState();
}

class _FeuilleDepotState extends State<_FeuilleDepot> {
  final _cleFormulaire = GlobalKey<FormState>();
  final _montant = TextEditingController(text: '5000');
  late final _numero = TextEditingController(text: widget.telephone ?? '');
  late String _prestataire = widget.prestataires.isEmpty ? '' : widget.prestataires.first.code;

  PrestatairePublic? get _choisi =>
      widget.prestataires.where((p) => p.code == _prestataire).firstOrNull;

  /// MoneyFusion exige le numéro ; LigdiCash le demande sur sa propre page.
  /// Le serveur fait foi : on ne devine pas la règle à partir du code.
  bool get _numeroRequis => _choisi?.numeroRequis ?? false;

  @override
  void dispose() {
    _montant.dispose();
    _numero.dispose();
    super.dispose();
  }

  void _valider() {
    if (!(_cleFormulaire.currentState?.validate() ?? false)) return;
    final montant = double.tryParse(_montant.text.trim().replaceAll(',', '.')) ?? 0;
    Navigator.of(context).pop(
      DemandeDepot(montant, _prestataire, _numero.text.trim().isEmpty ? null : _numero.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.prestataires.isEmpty) return const AucunPrestataire(pour: 'dépôt');

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
                Text('Déposer des fonds', style: Typo.h3),
                const SizedBox(height: 4),
                Text(
                  'Paiement Mobile Money sur la page sécurisée du prestataire ; votre '
                  'solde est crédité dès confirmation.',
                  style: Typo.petit,
                ),
                const SizedBox(height: 20),
                ChampTexte(
                  controleur: _montant,
                  label: 'Montant',
                  suffixe: 'FCFA',
                  chiffres: true,
                  clavier: const TextInputType.numberWithOptions(decimal: false),
                  formateurs: [FilteringTextInputFormatter.digitsOnly],
                  validateur: (valeur) {
                    final n = double.tryParse((valeur ?? '').trim());
                    if (n == null || n <= 0) return 'Entrez un montant valide';
                    if (n < 100) return 'Minimum : ${formatMontant(100)}';
                    return null;
                  },
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [1000, 2000, 5000, 10000]
                      .map((m) => _MiseRapide(
                            montant: m,
                            onTap: () => setState(() => _montant.text = '$m'),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 18),
                if (widget.prestataires.length > 1)
                  ListeDeroulante(
                    label: 'Prestataire',
                    valeur: _prestataire,
                    options: widget.prestataires
                        .map((p) => OptionListe(p.code, p.libelle))
                        .toList(),
                    onChanged: (v) =>
                        setState(() => _prestataire = v ?? widget.prestataires.first.code),
                  )
                else
                  // Un seul moyen actif : on l'annonce en clair plutôt que d'imposer
                  // une liste déroulante à un choix.
                  Text('Paiement via ${widget.prestataires.first.libelle}.', style: Typo.petit),
                const SizedBox(height: 18),
                ChampTexte(
                  controleur: _numero,
                  label: _numeroRequis ? 'Numéro Mobile Money' : 'Numéro Mobile Money (optionnel)',
                  placeholder: '+225 07 00 00 00 00',
                  clavier: TextInputType.phone,
                  aide: _numeroRequis ? 'Requis par ${_choisi?.libelle}.' : null,
                  validateur: (valeur) {
                    if (!_numeroRequis) return null;
                    return (valeur ?? '').trim().isEmpty ? 'Numéro obligatoire' : null;
                  },
                ),
                const SizedBox(height: 22),
                Bouton(
                  libelle: 'Continuer vers le paiement',
                  bloc: true,
                  taille: TailleBouton.lg,
                  variante: VarianteBouton.volt,
                  icone: Icons.south_west,
                  onPressed: _valider,
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

/// Aucune passerelle Mobile Money active : on le dit, au lieu de laisser le
/// joueur remplir un formulaire que le backend refusera par un 400.
class AucunPrestataire extends StatelessWidget {
  const AucunPrestataire({super.key, required this.pour});

  final String pour;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(pour == 'dépôt' ? 'Déposer des fonds' : 'Retirer des fonds', style: Typo.h3),
            const SizedBox(height: 14),
            Encart(
              ton: TonMessage.attention,
              texte: pour == 'dépôt'
                  ? 'Aucun moyen de paiement n’est disponible pour le moment. Le dépôt '
                      'rouvrira dès qu’une passerelle Mobile Money sera de nouveau active.'
                  : 'Aucun moyen de paiement n’est disponible pour le moment. Votre solde '
                      'reste intact : le retrait rouvrira dès qu’une passerelle Mobile Money '
                      'sera de nouveau active.',
            ),
            const SizedBox(height: 18),
            Bouton(
              libelle: 'Fermer',
              bloc: true,
              variante: VarianteBouton.secondaire,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
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
