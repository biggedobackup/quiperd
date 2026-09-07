import 'package:flutter/material.dart';

import '../../../theme/couleurs.dart';
import '../../../theme/typographie.dart';
import '../../communs/bouton.dart';

/// Score déclaré par le joueur.
class ScoreDeclare {
  const ScoreDeclare(this.scorePour, this.scoreContre, this.commentaire);
  final int scorePour;
  final int scoreContre;
  final String commentaire;
}

/// Feuille de déclaration du score.
///
/// Deux compteurs plutôt qu'un clavier : sur téléphone, taper un chiffre dans un
/// champ numérique ouvre un clavier qui masque la moitié de l'écran, et les
/// scores utiles tiennent presque toujours entre 0 et 20.
Future<ScoreDeclare?> ouvrirDeclarationScore(
  BuildContext context, {
  required String nomMoi,
  required String nomAdversaire,
  required int manche,
  bool contreProposition = false,
  int scoreInitialPour = 0,
  int scoreInitialContre = 0,
}) {
  return showModalBottomSheet<ScoreDeclare>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) => _FeuilleDeclaration(
      nomMoi: nomMoi,
      nomAdversaire: nomAdversaire,
      manche: manche,
      contreProposition: contreProposition,
      scoreInitialPour: scoreInitialPour,
      scoreInitialContre: scoreInitialContre,
    ),
  );
}

class _FeuilleDeclaration extends StatefulWidget {
  const _FeuilleDeclaration({
    required this.nomMoi,
    required this.nomAdversaire,
    required this.manche,
    required this.contreProposition,
    required this.scoreInitialPour,
    required this.scoreInitialContre,
  });

  final String nomMoi;
  final String nomAdversaire;
  final int manche;
  final bool contreProposition;
  final int scoreInitialPour;
  final int scoreInitialContre;

  @override
  State<_FeuilleDeclaration> createState() => _FeuilleDeclarationState();
}

class _FeuilleDeclarationState extends State<_FeuilleDeclaration> {
  late int _pour = widget.scoreInitialPour;
  late int _contre = widget.scoreInitialContre;
  final TextEditingController _commentaire = TextEditingController();

  @override
  void dispose() {
    _commentaire.dispose();
    super.dispose();
  }

  String get _consequence {
    if (_pour == _contre) {
      return 'Match nul : si votre adversaire déclare la même chose, vous choisirez '
          'ensemble de rejouer ou de partager la mise.';
    }
    final jeGagne = _pour > _contre;
    return jeGagne
        ? 'Vous vous déclarez vainqueur. Si ${widget.nomAdversaire} confirme, le gain '
            'est crédité immédiatement.'
        : 'Vous déclarez avoir perdu. Si ${widget.nomAdversaire} confirme, votre mise '
            'lui revient immédiatement.';
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.contreProposition ? 'Proposer un autre score' : 'Déclarer le score',
                style: Typo.h3,
              ),
              const SizedBox(height: 4),
              Text(
                widget.manche > 1
                    ? 'Manche ${widget.manche} · le score que vous déclarez engage le règlement.'
                    : 'Le score que vous déclarez engage le règlement du match.',
                style: Typo.petit,
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  Expanded(
                    child: _Compteur(
                      nom: '${widget.nomMoi} (vous)',
                      valeur: _pour,
                      onChange: (v) => setState(() => _pour = v),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _Compteur(
                      nom: widget.nomAdversaire,
                      valeur: _contre,
                      onChange: (v) => setState(() => _contre = v),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _pour == _contre ? Couleurs.alerteFond : Couleurs.vertPale,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _consequence,
                  style: Typo.petit.copyWith(
                    color: _pour == _contre ? Couleurs.alerte : Couleurs.vert,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _commentaire,
                maxLines: 2,
                style: Typo.corps,
                decoration: const InputDecoration(
                  hintText: 'Commentaire (optionnel)',
                ),
              ),
              const SizedBox(height: 20),
              Bouton(
                libelle: 'Déclarer $_pour-$_contre',
                bloc: true,
                taille: TailleBouton.lg,
                variante: VarianteBouton.volt,
                icone: Icons.send_outlined,
                onPressed: () => Navigator.of(context).pop(
                  ScoreDeclare(_pour, _contre, _commentaire.text.trim()),
                ),
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
    );
  }
}

class _Compteur extends StatelessWidget {
  const _Compteur({required this.nom, required this.valeur, required this.onChange});

  final String nom;
  final int valeur;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        border: Border.all(color: Couleurs.trait),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              nom.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 10),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _Rond(
                icone: Icons.remove,
                onTap: valeur > 0 ? () => onChange(valeur - 1) : null,
              ),
              Text('$valeur', style: Typo.chiffres(taille: 30, poids: 700)),
              _Rond(
                icone: Icons.add,
                onTap: valeur < 99 ? () => onChange(valeur + 1) : null,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Rond extends StatelessWidget {
  const _Rond({required this.icone, this.onTap});

  final IconData icone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: onTap == null ? Couleurs.gris : Couleurs.vertPale,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icone, size: 20, color: onTap == null ? Couleurs.muet : Couleurs.vert),
        ),
      ),
    );
  }
}
