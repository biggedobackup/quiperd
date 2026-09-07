import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Tout mot de passe passe par ce champ : bouton voir/masquer avec une cible
/// tactile d'au moins 48 px. Sur mobile, saisir un mot de passe à l'aveugle est
/// la première cause d'échec de connexion.
class ChampMotDePasse extends StatefulWidget {
  const ChampMotDePasse({
    super.key,
    required this.controleur,
    required this.label,
    this.aide,
    this.validateur,
    this.saisieAutomatique,
    this.actionClavier,
    this.onSubmitted,
  });

  final TextEditingController controleur;
  final String label;
  final String? aide;
  final String? Function(String?)? validateur;
  final Iterable<String>? saisieAutomatique;
  final TextInputAction? actionClavier;
  final ValueChanged<String>? onSubmitted;

  @override
  State<ChampMotDePasse> createState() => _ChampMotDePasseState();
}

class _ChampMotDePasseState extends State<ChampMotDePasse> {
  bool _masque = true;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label.toUpperCase(), style: Typo.etiquette.copyWith(color: Couleurs.muet)),
        const SizedBox(height: 8),
        TextFormField(
          controller: widget.controleur,
          obscureText: _masque,
          autofillHints: widget.saisieAutomatique,
          textInputAction: widget.actionClavier,
          validator: widget.validateur,
          onFieldSubmitted: widget.onSubmitted,
          style: Typo.corps,
          decoration: InputDecoration(
            hintText: '••••••••',
            helperText: widget.aide,
            helperStyle: Typo.petit,
            prefixIcon: const Icon(Icons.lock_outline, size: 20, color: Couleurs.muet),
            suffixIcon: IconButton(
              onPressed: () => setState(() => _masque = !_masque),
              icon: Icon(_masque ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              color: Couleurs.muet,
              tooltip: _masque ? 'Afficher le mot de passe' : 'Masquer le mot de passe',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            ),
          ),
        ),
      ],
    );
  }
}
