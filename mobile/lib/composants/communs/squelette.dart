import 'dart:async';

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

/// Seuil commun à tous les états d'attente de l'application : en dessous, on ne montre rien.
/// Une liste qui arrive en 40 ms n'a pas
/// besoin d'être annoncée, et un squelette qui apparaît puis disparaît aussitôt se lit
/// comme un clignotement — c'est précisément ce qu'on veut éviter.
const Duration seuilAttente = Duration(milliseconds: 150);

/// Enrobe un squelette pour qu'il n'apparaisse **qu'au bout de [seuilAttente]**.
///
/// ```dart
/// if (etat.chargement)
///   const SqueletteDiffere(child: SqueletteCartes(nombre: 3))
/// ```
///
/// Règle du projet : **tout squelette passe par ici**. Affiché sans délai, il apparaît
/// puis disparaît aussitôt dès que la donnée arrive vite — et c'est ce clignotement que
/// les joueurs remarquent, pas l'attente elle-même. Le widget n'étant monté que pendant
/// le chargement, il suffit de retarder son apparition : quand la réponse arrive avant le
/// seuil, rien ne s'est jamais affiché.
class SqueletteDiffere extends StatefulWidget {
  const SqueletteDiffere({super.key, required this.child});

  final Widget child;

  @override
  State<SqueletteDiffere> createState() => _SqueletteDiffereState();
}

class _SqueletteDiffereState extends State<SqueletteDiffere> {
  bool _visible = false;
  Timer? _minuterie;

  @override
  void initState() {
    super.initState();
    _minuterie = Timer(seuilAttente, () {
      if (mounted) setState(() => _visible = true);
    });
  }

  @override
  void dispose() {
    _minuterie?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _visible ? widget.child : const SizedBox.shrink();
}
