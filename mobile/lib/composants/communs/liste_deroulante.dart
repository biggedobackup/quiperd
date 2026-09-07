import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

class OptionListe {
  const OptionListe(this.valeur, this.libelle);
  final String valeur;
  final String libelle;
}

class GroupeOptions {
  const GroupeOptions(this.libelle, this.options);
  final String libelle;
  final List<OptionListe> options;
}

/// Liste déroulante, éventuellement groupée (catégories de jeu, familles de
/// plateforme, pays fréquents puis tous).
///
/// **Aucune valeur présélectionnée arbitraire** : un placeholder « Choisissez un
/// jeu » plutôt que le premier de la liste — sans quoi un joueur crée un défi
/// sur un jeu qu'il n'a pas choisi.
class ListeDeroulante extends StatelessWidget {
  const ListeDeroulante({
    super.key,
    required this.label,
    required this.valeur,
    required this.onChanged,
    this.options = const [],
    this.groupes = const [],
    this.placeholder = 'Choisissez…',
    this.aide,
    this.erreur,
    this.actif = true,
  });

  final String label;
  final String? valeur;
  final ValueChanged<String?> onChanged;
  final List<OptionListe> options;
  final List<GroupeOptions> groupes;
  final String placeholder;
  final String? aide;
  final String? erreur;
  final bool actif;

  @override
  Widget build(BuildContext context) {
    final entrees = <DropdownMenuItem<String>>[];
    // `DropdownButton` exige qu'une valeur n'apparaisse qu'UNE fois : deux
    // entrées de même valeur font échouer une assertion et l'écran devient
    // rouge. Or un même élément peut légitimement figurer dans deux groupes —
    // la Côte d'Ivoire est à la fois un « pays fréquent » et un pays de la
    // liste complète. On garde donc la première occurrence et on saute les
    // suivantes : le choix reste possible, la liste ne se répète plus.
    final dejaVues = <String>{};

    if (groupes.isNotEmpty) {
      for (final groupe in groupes) {
        final membres = groupe.options.where((o) => dejaVues.add(o.valeur)).toList();
        if (membres.isEmpty) continue;
        // Flutter n'a pas d'`<optgroup>` : l'en-tête est une entrée désactivée,
        // ce qui donne le même repérage visuel sans casser la sélection.
        entrees.add(
          DropdownMenuItem<String>(
            enabled: false,
            value: '__groupe_${groupe.libelle}',
            child: Text(
              groupe.libelle.toUpperCase(),
              style: Typo.etiquette.copyWith(color: Couleurs.muet),
            ),
          ),
        );
        entrees.addAll(
          membres.map(
            (o) => DropdownMenuItem<String>(
              value: o.valeur,
              child: Text(o.libelle, style: Typo.corps, overflow: TextOverflow.ellipsis),
            ),
          ),
        );
      }
    } else {
      entrees.addAll(
        options.where((o) => dejaVues.add(o.valeur)).map(
              (o) => DropdownMenuItem<String>(
                value: o.valeur,
                child: Text(o.libelle, style: Typo.corps, overflow: TextOverflow.ellipsis),
              ),
            ),
      );
    }

    // Une valeur absente de la liste (catalogue rechargé, pays inconnu) ne doit
    // pas faire planter le Dropdown : on retombe sur le placeholder.
    final valeurSure = dejaVues.contains(valeur) ? valeur : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: Typo.etiquette.copyWith(color: Couleurs.muet)),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: valeurSure,
          isExpanded: true,
          onChanged: actif ? onChanged : null,
          items: entrees,
          hint: Text(placeholder, style: Typo.corps.copyWith(color: Couleurs.muet)),
          style: Typo.corps,
          icon: const Icon(Icons.expand_more, color: Couleurs.muet),
          dropdownColor: Couleurs.papier,
          borderRadius: BorderRadius.circular(12),
          decoration: InputDecoration(
            helperText: aide,
            helperMaxLines: 3,
            helperStyle: Typo.petit,
            errorText: erreur,
          ),
        ),
      ],
    );
  }
}
