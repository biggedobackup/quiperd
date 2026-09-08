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

class DemandeDepot {
  const DemandeDepot(this.montant, this.prestataire, this.numero);
  final double montant;
  final String prestataire;
  final String? numero;
}

/// Dépôt Mobile Money. Le paiement se termine sur la page hébergée du
/// prestataire ; le solde, lui, se met à jour tout seul par le socket.
///
/// La liste des passerelles n'est PAS passée en paramètre : la feuille la lit dans
/// `CatalogueEtat` et se reconstruit toute seule si elle change pendant qu'elle est ouverte.
/// C'est ce qui lui permet de revérifier avant d'annoncer « aucun moyen de paiement » — un
/// message qu'on ne doit jamais fonder sur une liste lue au lancement de l'application.
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

  /// `null` tant que le joueur n'a rien choisi : on prend alors la première passerelle de la
  /// liste. La sélection ne peut pas être figée à la construction — la liste peut arriver
  /// après, quand la feuille s'ouvre pendant que le catalogue se relit.
  String? _prestataireChoisi;

  List<PrestatairePublic> get _prestataires => context.watch<CatalogueEtat>().prestataires;

  PrestatairePublic? get _choisi {
    final liste = _prestataires;
    if (liste.isEmpty) return null;
    return liste.where((p) => p.code == _prestataireChoisi).firstOrNull ?? liste.first;
  }

  String get _prestataire => _choisi?.code ?? '';

  /// MoneyFusion exige le numéro ; LigdiCash le demande sur sa propre page.
  /// Le serveur fait foi : on ne devine pas la règle à partir du code.
  bool get _numeroRequis => _choisi?.numeroRequis ?? false;

  /// Plancher de la passerelle choisie, jamais une constante : MoneyFusion refuse
  /// sous 200 F là où la plateforme accepte 100.
  int get _minimum => _choisi?.montantMinimum ?? 100;

  @override
  void dispose() {
    _montant.dispose();
    _numero.dispose();
    super.dispose();
  }

  void _valider() {
    if (!(_cleFormulaire.currentState?.validate() ?? false)) return;
    final montant = double.tryParse(_montant.text.trim().replaceAll(',', '.')) ?? 0;
    final code = _choisi?.code;
    if (code == null) return; // la passerelle a disparu entre-temps : ne rien envoyer
    Navigator.of(context).pop(
      DemandeDepot(montant, code, _numero.text.trim().isEmpty ? null : _numero.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final prestataires = _prestataires;
    if (prestataires.isEmpty) return const AucunPrestataire(pour: 'dépôt');

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
                  aide: 'Minimum : ${formatMontant(_minimum)}',
                  validateur: (valeur) {
                    final n = double.tryParse((valeur ?? '').trim());
                    if (n == null || n <= 0) return 'Entrez un montant valide';
                    if (n < _minimum) return 'Minimum : ${formatMontant(_minimum)}';
                    return null;
                  },
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [1000, 2000, 5000, 10000]
                      .where((m) => m >= _minimum)
                      .map((m) => _MiseRapide(
                            montant: m,
                            onTap: () => setState(() => _montant.text = '$m'),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 18),
                if (prestataires.length > 1)
                  ListeDeroulante(
                    label: 'Prestataire',
                    valeur: _prestataire,
                    options: prestataires.map((p) => OptionListe(p.code, p.libelle)).toList(),
                    onChanged: (v) => setState(() => _prestataireChoisi = v),
                  )
                else
                  // Un seul moyen actif : on l'annonce en clair plutôt que d'imposer
                  // une liste déroulante à un choix.
                  Text('Paiement via ${prestataires.first.libelle}.', style: Typo.petit),
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
class AucunPrestataire extends StatefulWidget {
  const AucunPrestataire({super.key, required this.pour});

  final String pour;

  @override
  State<AucunPrestataire> createState() => _AucunPrestataireState();
}

class _AucunPrestataireState extends State<AucunPrestataire> {
  bool _verification = true;

  @override
  void initState() {
    super.initState();
    // On ne DÉCLARE pas l'indisponibilité, on la vérifie d'abord.
    //
    // La liste des passerelles suit la configuration du serveur, pas le catalogue : une clé
    // qu'on renseigne et elle change, sans que l'application en sache rien. Or une application
    // mobile vit des jours sans être relancée. Sans cette relecture, un joueur restait devant
    // « aucun moyen de paiement » longtemps après que le serveur eut été réparé, et seule une
    // fermeture complète de l'application le débloquait — ce qu'aucun joueur ne devine.
    //
    // Si la relecture trouve une passerelle, `CatalogueEtat` prévient ses auditeurs et la
    // feuille se reconstruit d'elle-même sur le vrai formulaire : cet écran disparaît sans que
    // le joueur ait rien à faire.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await context.read<CatalogueEtat>().rafraichirPrestataires();
      if (mounted) setState(() => _verification = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_verification) {
      return const SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 48),
          child: Center(child: CircularProgressIndicator(color: Couleurs.vert)),
        ),
      );
    }
    final pour = widget.pour;
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
