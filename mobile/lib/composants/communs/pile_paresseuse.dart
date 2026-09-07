import 'package:flutter/material.dart';

/// Pile d'écrans construits **à la demande**, puis gardés vivants.
///
/// `IndexedStack` construit tous ses enfants dès le premier rendu : les cinq
/// onglets de l'espace joueur lançaient donc leurs appels réseau au démarrage,
/// même ceux que le joueur n'ouvrait jamais. Ici, un enfant n'est construit qu'à
/// sa première sélection ; une fois monté il le reste, ce qui préserve la raison
/// d'être de l'`IndexedStack` (défilement, filtres et état conservés d'un onglet
/// à l'autre).
///
/// Le registre des onglets déjà vus est tenu **ici**, à partir de l'index reçu :
/// aucun appelant ne peut afficher un onglet sans qu'il soit construit. C'est
/// délibéré — la première version confiait ce registre à l'écran parent, et une
/// navigation qui contournait sa méthode a suffi à afficher un onglet vide.
class PileParesseuse extends StatefulWidget {
  const PileParesseuse({super.key, required this.index, required this.enfants});

  /// Enfant affiché. Les autres restent montés s'ils l'ont déjà été.
  final int index;

  /// Les écrans, dans l'ordre des onglets.
  final List<Widget> enfants;

  @override
  State<PileParesseuse> createState() => _PileParesseuseState();
}

class _PileParesseuseState extends State<PileParesseuse> {
  final Set<int> _vus = {};

  @override
  void initState() {
    super.initState();
    _vus.add(widget.index);
  }

  @override
  void didUpdateWidget(covariant PileParesseuse ancien) {
    super.didUpdateWidget(ancien);
    _vus.add(widget.index);
  }

  @override
  Widget build(BuildContext context) {
    return IndexedStack(
      index: widget.index,
      children: List.generate(
        widget.enfants.length,
        (i) => _vus.contains(i) ? widget.enfants[i] : const SizedBox.shrink(),
      ),
    );
  }
}
