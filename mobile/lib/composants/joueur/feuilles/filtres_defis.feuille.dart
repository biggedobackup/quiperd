import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../etats/catalogue.etat.dart';
import '../../../modeles/defi.modele.dart';
import '../../../noyau/catalogue.dart';
import '../../../theme/couleurs.dart';
import '../../../theme/typographie.dart';
import '../../communs/bouton.dart';
import '../../communs/champ_texte.dart';
import '../../communs/liste_deroulante.dart';

/// Filtres de l'arène, dans une feuille inférieure.
///
/// Ils étaient dépliés en permanence au-dessus de la liste : quatre champs, plus de la moitié
/// d'un écran de téléphone avant le premier défi. Ils vivent maintenant derrière un bouton
/// « Filtrer », qui porte le nombre de critères posés pour qu'on n'oublie jamais qu'une liste
/// est filtrée.
///
/// La feuille travaille sur une COPIE : tant que « Voir les défis » n'est pas pressé, la liste
/// derrière ne bouge pas et ne relance aucune requête à chaque frappe. Retourne `null` si la
/// feuille est refermée sans valider — l'appelant garde alors ses filtres.
Future<FiltresDefis?> ouvrirFiltresDefis(BuildContext context, FiltresDefis filtres) {
  // Ni `shape` ni poignée ici : le thème pose déjà `showDragHandle` et le rayon de 28 pour
  // toutes les feuilles de l'application. En redéfinir une donnait deux poignées empilées.
  return showModalBottomSheet<FiltresDefis>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Couleurs.papier,
    builder: (context) => _FeuilleFiltres(initiaux: filtres),
  );
}

class _FeuilleFiltres extends StatefulWidget {
  const _FeuilleFiltres({required this.initiaux});

  final FiltresDefis initiaux;

  @override
  State<_FeuilleFiltres> createState() => _FeuilleFiltresState();
}

class _FeuilleFiltresState extends State<_FeuilleFiltres> {
  late FiltresDefis _filtres = widget.initiaux;

  // Le champ garde son propre contrôleur : reconstruire un `TextField` à chaque frappe lui
  // ferait perdre le focus et le curseur au premier chiffre tapé.
  late final TextEditingController _miseMax = TextEditingController(
    text: widget.initiaux.miseMax == null ? '' : widget.initiaux.miseMax!.toStringAsFixed(0),
  );

  @override
  void dispose() {
    _miseMax.dispose();
    super.dispose();
  }

  void _modifier(FiltresDefis f) => setState(() => _filtres = f);

  @override
  Widget build(BuildContext context) {
    final catalogue = context.watch<CatalogueEtat>();
    final jeux = catalogue.jeuxDeCategorie(_filtres.categorie);

    return Padding(
      // `viewInsets` : la feuille remonte au-dessus du clavier quand on saisit la mise max.
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Filtrer les défis', style: Typo.h3),
              const SizedBox(height: 4),
              Text(
                'Affinez l’arène par jeu, plateforme ou mise maximale.',
                style: Typo.legende.copyWith(color: Couleurs.muet),
              ),
              const SizedBox(height: 20),
              ListeDeroulante(
                label: 'Catégorie',
                valeur: _filtres.categorie,
                placeholder: 'Toutes les catégories',
                options: categoriesJeu.map((c) => OptionListe(c.valeur, c.libelle)).toList(),
                // Changer de catégorie remet le jeu à zéro : garder un jeu d'une autre
                // catégorie donnerait une liste vide sans explication.
                onChanged: (v) => _modifier(_filtres.copieAvec(categorie: v, jeu: null)),
              ),
              const SizedBox(height: 14),
              ListeDeroulante(
                label: 'Jeu',
                valeur: _filtres.jeu,
                placeholder: 'Tous les jeux',
                options: jeux.map((j) => OptionListe(j.id, j.nom)).toList(),
                onChanged: (v) => _modifier(_filtres.copieAvec(jeu: v)),
              ),
              const SizedBox(height: 14),
              ListeDeroulante(
                label: 'Plateforme',
                valeur: _filtres.plateforme,
                placeholder: 'Toutes les plateformes',
                groupes: catalogue.plateformesGroupees.entries
                    .map((e) => GroupeOptions(
                          e.key.libelle,
                          e.value.map((p) => OptionListe(p.id, p.nom)).toList(),
                        ))
                    .toList(),
                onChanged: (v) => _modifier(_filtres.copieAvec(plateforme: v)),
              ),
              const SizedBox(height: 14),
              ChampTexte(
                controleur: _miseMax,
                label: 'Mise max',
                suffixe: 'FCFA',
                chiffres: true,
                clavier: const TextInputType.numberWithOptions(decimal: false),
                formateurs: [FilteringTextInputFormatter.digitsOnly],
                placeholder: 'Toutes les mises',
                onChanged: (valeur) {
                  final n = double.tryParse(valeur.trim());
                  _modifier(_filtres.copieAvec(miseMax: (n == null || n <= 0) ? null : n));
                },
              ),
              const SizedBox(height: 22),
              Bouton(
                libelle: 'Voir les défis',
                bloc: true,
                taille: TailleBouton.lg,
                variante: VarianteBouton.volt,
                iconeFin: Icons.arrow_forward,
                onPressed: () => Navigator.of(context).pop(_filtres),
              ),
              if (_filtres.actifs) ...[
                const SizedBox(height: 8),
                Bouton(
                  libelle: 'Tout effacer',
                  bloc: true,
                  variante: VarianteBouton.secondaire,
                  icone: Icons.filter_alt_off_outlined,
                  onPressed: () => Navigator.of(context).pop(FiltresDefis.aucun),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
