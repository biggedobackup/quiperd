import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Champ de saisie : étiquette au-dessus, aide en dessous, erreur en rouge.
/// Le suffixe (« FCFA ») reste dans le champ, comme sur le web.
class ChampTexte extends StatelessWidget {
  const ChampTexte({
    super.key,
    required this.controleur,
    required this.label,
    this.aide,
    this.placeholder,
    this.suffixe,
    this.icone,
    this.clavier,
    this.saisieAutomatique,
    this.validateur,
    this.lignes = 1,
    this.longueurMax,
    this.formateurs,
    this.chiffres = false,
    this.actif = true,
    this.onChanged,
    this.onSubmitted,
    this.actionClavier,
    this.focus,
  });

  final TextEditingController controleur;
  final String label;
  final String? aide;
  final String? placeholder;
  final String? suffixe;
  final IconData? icone;
  final TextInputType? clavier;
  final Iterable<String>? saisieAutomatique;
  final String? Function(String?)? validateur;
  final int lignes;
  final int? longueurMax;
  final List<TextInputFormatter>? formateurs;

  /// Montants, scores, références : police monospace tabulaire.
  final bool chiffres;
  final bool actif;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final TextInputAction? actionClavier;
  final FocusNode? focus;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: Typo.etiquette.copyWith(color: Couleurs.muet)),
        const SizedBox(height: 8),
        TextFormField(
          controller: controleur,
          focusNode: focus,
          enabled: actif,
          keyboardType: clavier,
          autofillHints: saisieAutomatique,
          textInputAction: actionClavier,
          validator: validateur,
          maxLines: lignes,
          minLines: lignes > 1 ? lignes : null,
          maxLength: longueurMax,
          inputFormatters: formateurs,
          onChanged: onChanged,
          onFieldSubmitted: onSubmitted,
          style: chiffres ? Typo.chiffres(taille: 16, poids: 700) : Typo.corps,
          decoration: InputDecoration(
            hintText: placeholder,
            helperText: aide,
            helperMaxLines: 3,
            helperStyle: Typo.petit,
            counterText: '',
            prefixIcon: icone == null ? null : Icon(icone, size: 20, color: Couleurs.muet),
            suffixIcon: suffixe == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(right: 14, left: 8),
                    child: Text(
                      suffixe!,
                      style: Typo.etiquette.copyWith(color: Couleurs.muet),
                    ),
                  ),
            suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
          ),
        ),
      ],
    );
  }
}
