import 'package:flutter/material.dart';

import '../../../theme/couleurs.dart';
import '../../../theme/typographie.dart';
import '../../communs/bouton.dart';
import '../../communs/champ_texte.dart';

/// Ce que le joueur déclare : l'issue de sa partie, `gagne`, `perdu` ou `nul`.
///
/// Une seule forme, pour tous les jeux. Un score chiffré n'aurait de sens que sur une partie
/// du catalogue — un combat, une course ou une partie de cartes n'en produit pas — et le
/// demander revenait à faire inventer un « 1-0 » sur une plateforme où l'on mise de l'argent.
/// Qui tient à noter le score de sa partie l'écrit dans le commentaire.
class IssueDeclaree {
  const IssueDeclaree(this.resultat, this.commentaire);

  final String resultat;
  final String commentaire;
}

/// Feuille de déclaration du résultat.
Future<IssueDeclaree?> ouvrirDeclarationResultat(
  BuildContext context, {
  required String nomAdversaire,
  required int manche,
  bool contreProposition = false,
}) {
  return showModalBottomSheet<IssueDeclaree>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) => _FeuilleResultat(
      nomAdversaire: nomAdversaire,
      manche: manche,
      contreProposition: contreProposition,
    ),
  );
}

/// Trois choix, et un commentaire facultatif.
///
/// Le match nul reste offert : deux joueurs peuvent s'accorder pour dire que la partie n'a pas
/// départagé (déconnexion, égalité de temps), et la machine à états sait déjà quoi en faire —
/// rejouer la manche, ou partager les mises.
class _FeuilleResultat extends StatefulWidget {
  const _FeuilleResultat({
    required this.nomAdversaire,
    required this.manche,
    required this.contreProposition,
  });

  final String nomAdversaire;
  final int manche;
  final bool contreProposition;

  @override
  State<_FeuilleResultat> createState() => _FeuilleResultatState();
}

class _FeuilleResultatState extends State<_FeuilleResultat> {
  String? _resultat;
  final _commentaire = TextEditingController();

  @override
  void dispose() {
    _commentaire.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final choix = <({String valeur, String libelle, String aide})>[
      (
        valeur: 'gagne',
        libelle: 'J’ai gagné',
        aide: 'Vous déclarez avoir battu ${widget.nomAdversaire}.',
      ),
      (
        valeur: 'perdu',
        libelle: 'J’ai perdu',
        aide: 'Vous déclarez que ${widget.nomAdversaire} l’a emporté.',
      ),
      (
        valeur: 'nul',
        libelle: 'Match nul',
        aide: 'La partie n’a pas départagé : vous choisirez ensuite de rejouer ou de partager les mises.',
      ),
    ];

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.contreProposition
                    ? 'Déclarer un autre résultat'
                    : widget.manche > 1
                        ? 'Déclarer le résultat — manche ${widget.manche}'
                        : 'Déclarer le résultat',
                style: Typo.h3,
              ),
              const SizedBox(height: 4),
              // Copie reprise mot pour mot du web : un joueur qui connaît le site doit lire
              // exactement la même chose ici.
              Text(
                widget.contreProposition
                    ? 'Votre adversaire a déjà déclaré. Si vous annoncez la même issue que lui, le match '
                        'est réglé sur-le-champ ; sinon une preuve sera exigée des deux côtés.'
                    : 'Une seule déclaration par joueur et par manche, définitive. Si votre adversaire '
                        'annonce la même issue, le match est réglé immédiatement — sans preuve ni arbitre.',
                style: Typo.petit,
              ),
              const SizedBox(height: 18),
              // Même légende de section que le web (`<legend>` du fieldset).
              Text(
                'Issue de la partie'.toUpperCase(),
                style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10),
              ),
              const SizedBox(height: 10),
              for (final c in choix) ...[
                _Choix(
                  libelle: c.libelle,
                  aide: c.aide,
                  actif: _resultat == c.valeur,
                  onTap: () => setState(() => _resultat = c.valeur),
                ),
                const SizedBox(height: 10),
              ],
              const SizedBox(height: 6),
              ChampTexte(
                controleur: _commentaire,
                label: 'Commentaire (optionnel)',
                placeholder: 'Ex. adversaire déconnecté au troisième round.',
                lignes: 3,
              ),
              const SizedBox(height: 20),
              Bouton(
                libelle: _resultat == null
                    ? 'Choisissez une issue'
                    : choix.firstWhere((c) => c.valeur == _resultat).libelle,
                bloc: true,
                taille: TailleBouton.lg,
                variante: VarianteBouton.volt,
                iconeFin: Icons.check,
                onPressed: _resultat == null
                    ? null
                    : () => Navigator.of(context)
                        .pop(IssueDeclaree(_resultat!, _commentaire.text.trim())),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Une des trois issues, en grande cible tactile : c'est le geste qui engage l'argent.
class _Choix extends StatelessWidget {
  const _Choix({
    required this.libelle,
    required this.aide,
    required this.actif,
    required this.onTap,
  });

  final String libelle;
  final String aide;
  final bool actif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: actif ? Couleurs.vertPale : Couleurs.papier,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: actif ? Couleurs.vert : Couleurs.trait),
            ),
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(
                  actif ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                  size: 20,
                  color: actif ? Couleurs.vert : Couleurs.muet,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(libelle, style: Typo.corpsFort),
                      const SizedBox(height: 2),
                      Text(aide, style: Typo.petit),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}
