import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';

/// Squelette de chargement : hauteur identique au contenu final, pour qu'aucun
/// bloc ne saute quand les données arrivent.
class Squelette extends StatefulWidget {
  const Squelette({super.key, this.hauteur = 16, this.largeur, this.rayon = 8});

  final double hauteur;
  final double? largeur;
  final double rayon;

  @override
  State<Squelette> createState() => _SqueletteState();
}

class _SqueletteState extends State<Squelette> with SingleTickerProviderStateMixin {
  late final AnimationController _controleur = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controleur.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(_controleur),
      child: Container(
        height: widget.hauteur,
        width: widget.largeur,
        decoration: BoxDecoration(
          color: Couleurs.gris,
          borderRadius: BorderRadius.circular(widget.rayon),
        ),
      ),
    );
  }
}

/// Quelques lignes de texte en attente.
class SqueletteTexte extends StatelessWidget {
  const SqueletteTexte({super.key, this.lignes = 3});

  final int lignes;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(lignes, (i) {
        return Padding(
          padding: EdgeInsets.only(bottom: i == lignes - 1 ? 0 : 10),
          child: Squelette(
            hauteur: 12,
            largeur: i.isEven ? double.infinity : 180,
          ),
        );
      }),
    );
  }
}

/// Cartes en attente (listes de défis, de matchs, de litiges).
class SqueletteCartes extends StatelessWidget {
  const SqueletteCartes({super.key, this.nombre = 3, this.hauteur = 132});

  final int nombre;
  final double hauteur;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        nombre,
        (i) => Padding(
          padding: EdgeInsets.only(bottom: i == nombre - 1 ? 0 : 12),
          child: Squelette(hauteur: hauteur, rayon: 20),
        ),
      ),
    );
  }
}
