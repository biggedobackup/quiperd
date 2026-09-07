import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../noyau/format.dart';
import '../../../noyau/statuts.dart';
import '../../../theme/couleurs.dart';
import '../../../theme/typographie.dart';
import '../../communs/bouton.dart';
import '../../communs/champ_texte.dart';
import '../../communs/liste_deroulante.dart';

class DemandeDepot {
  const DemandeDepot(this.montant, this.prestataire, this.numero);
  final double montant;
  final String prestataire;
  final String? numero;
}

/// Dépôt Mobile Money. Le paiement se termine sur la page hébergée du
/// prestataire ; le solde, lui, se met à jour tout seul par le socket.
Future<DemandeDepot?> ouvrirDepot(BuildContext context, {String? telephone}) {
  return showModalBottomSheet<DemandeDepot>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) => _FeuilleDepot(telephone: telephone),
  );
}

class _FeuilleDepot extends StatefulWidget {
  const _FeuilleDepot({this.telephone});

  final String? telephone;

  @override
  State<_FeuilleDepot> createState() => _FeuilleDepotState();
}

class _FeuilleDepotState extends State<_FeuilleDepot> {
  final _cleFormulaire = GlobalKey<FormState>();
  final _montant = TextEditingController(text: '5000');
  late final _numero = TextEditingController(text: widget.telephone ?? '');
  String _prestataire = 'ligdicash';

  /// MoneyFusion exige le numéro ; LigdiCash le demande sur sa propre page.
  bool get _numeroRequis => _prestataire == 'fusionmoney';

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
                ListeDeroulante(
                  label: 'Prestataire',
                  valeur: _prestataire,
                  options: libellesPrestataires.entries
                      .map((e) => OptionListe(e.key, e.value))
                      .toList(),
                  onChanged: (v) => setState(() => _prestataire = v ?? 'ligdicash'),
                ),
                const SizedBox(height: 18),
                ChampTexte(
                  controleur: _numero,
                  label: _numeroRequis ? 'Numéro Mobile Money' : 'Numéro Mobile Money (optionnel)',
                  placeholder: '+225 07 00 00 00 00',
                  clavier: TextInputType.phone,
                  aide: _numeroRequis ? 'Requis par MoneyFusion.' : null,
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
