import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Variantes du bouton — les mêmes noms que sur le web
/// (`components/partages/button/button.tsx`), pour que les deux clients se
/// lisent de la même façon.
///
/// `volt` reste le nom de l'action principale dans tout le code : depuis la
/// refonte, c'est le bouton vert plein à texte blanc.
enum VarianteBouton { primaire, secondaire, volt, danger, fantome, lien }

enum TailleBouton { sm, md, lg }

class Bouton extends StatelessWidget {
  const Bouton({
    super.key,
    required this.libelle,
    this.onPressed,
    this.variante = VarianteBouton.primaire,
    this.taille = TailleBouton.md,
    this.icone,
    this.iconeFin,
    this.chargement = false,
    this.bloc = false,
  });

  final String libelle;
  final VoidCallback? onPressed;
  final VarianteBouton variante;
  final TailleBouton taille;
  final IconData? icone;
  final IconData? iconeFin;
  final bool chargement;
  final bool bloc;

  bool get _actif => onPressed != null && !chargement;

  /// Hauteurs : jamais moins de 48 px pour une cible tactile confortable.
  double get _hauteur => switch (taille) {
        TailleBouton.sm => 44,
        TailleBouton.md => 48,
        TailleBouton.lg => 56,
      };

  double get _tailleTexte => switch (taille) {
        TailleBouton.sm => 11,
        TailleBouton.md => 12,
        TailleBouton.lg => 13,
      };

  ({Color fond, Color texte, Color bordure}) get _couleurs => switch (variante) {
        VarianteBouton.primaire => (
            fond: Couleurs.vert,
            texte: Couleurs.craie,
            bordure: Colors.transparent
          ),
        VarianteBouton.volt => (
            fond: Couleurs.vert,
            texte: Couleurs.craie,
            bordure: Colors.transparent
          ),
        VarianteBouton.secondaire => (
            fond: Couleurs.papier,
            texte: Couleurs.encre,
            bordure: Couleurs.trait
          ),
        VarianteBouton.danger => (
            fond: Couleurs.perte,
            texte: Couleurs.craie,
            bordure: Colors.transparent
          ),
        VarianteBouton.fantome => (
            fond: Colors.transparent,
            texte: Couleurs.muet,
            bordure: Colors.transparent
          ),
        VarianteBouton.lien => (
            fond: Colors.transparent,
            texte: Couleurs.vert,
            bordure: Colors.transparent
          ),
      };

  @override
  Widget build(BuildContext context) {
    final c = _couleurs;

    if (variante == VarianteBouton.lien) {
      return TextButton(
        onPressed: _actif ? onPressed : null,
        style: TextButton.styleFrom(
          minimumSize: Size(bloc ? double.infinity : 0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 4),
          foregroundColor: c.texte,
          textStyle: Typo.legendeForte,
        ),
        child: Text(
          libelle,
          style: Typo.legendeForte.copyWith(
            color: c.texte,
            decoration: TextDecoration.underline,
            decorationThickness: 2,
          ),
        ),
      );
    }

    final contenu = Row(
      mainAxisSize: bloc ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (chargement)
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2, color: c.texte),
          )
        else if (icone != null)
          Icon(icone, size: 18, color: c.texte),
        if (chargement || icone != null) const SizedBox(width: 8),
        Flexible(
          child: Text(
            libelle,
            overflow: TextOverflow.ellipsis,
            style: Typo.etiquette.copyWith(color: c.texte, fontSize: _tailleTexte),
          ),
        ),
        if (iconeFin != null && !chargement) ...[
          const SizedBox(width: 8),
          Icon(iconeFin, size: 18, color: c.texte),
        ],
      ],
    );

    return Opacity(
      opacity: _actif ? 1 : 0.5,
      child: SizedBox(
        height: _hauteur,
        width: bloc ? double.infinity : null,
        child: Material(
          color: c.fond,
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            onTap: _actif ? onPressed : null,
            borderRadius: BorderRadius.circular(10),
            child: Ink(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: c.bordure),
              ),
              padding: EdgeInsets.symmetric(horizontal: taille == TailleBouton.lg ? 24 : 18),
              child: Center(child: contenu),
            ),
          ),
        ),
      ),
    );
  }
}
