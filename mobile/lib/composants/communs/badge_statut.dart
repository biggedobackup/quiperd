import 'package:flutter/material.dart';

import '../../noyau/statuts.dart';
import '../../theme/typographie.dart';

/// Badge de statut : pastille + libellé en petites capitales. Les statuts
/// « vivants » (en cours, preuve exigée, litige…) pulsent lentement ; les états
/// finaux sont statiques.
class BadgeStatut extends StatefulWidget {
  const BadgeStatut({super.key, required this.famille, required this.valeur, this.compact = false});

  final FamilleStatut famille;
  final String valeur;
  final bool compact;

  @override
  State<BadgeStatut> createState() => _BadgeStatutState();
}

class _BadgeStatutState extends State<BadgeStatut> with SingleTickerProviderStateMixin {
  AnimationController? _pulsation;

  @override
  void initState() {
    super.initState();
    _preparerPulsation();
  }

  @override
  void didUpdateWidget(covariant BadgeStatut ancien) {
    super.didUpdateWidget(ancien);
    if (ancien.valeur != widget.valeur || ancien.famille != widget.famille) {
      _pulsation?.dispose();
      _pulsation = null;
      _preparerPulsation();
    }
  }

  void _preparerPulsation() {
    if (!decrireStatut(widget.famille, widget.valeur).actif) return;
    _pulsation = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulsation?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final description = decrireStatut(widget.famille, widget.valeur);

    Widget pastille = Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(color: description.texte, shape: BoxShape.circle),
    );
    final controleur = _pulsation;
    if (controleur != null) {
      pastille = FadeTransition(
        opacity: Tween<double>(begin: 1, end: 0.35).animate(controleur),
        child: pastille,
      );
    }

    return Container(
      padding: EdgeInsets.symmetric(horizontal: widget.compact ? 8 : 10, vertical: 6),
      decoration: BoxDecoration(
        color: description.fond,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          pastille,
          const SizedBox(width: 6),
          Text(
            description.libelle.toUpperCase(),
            style: Typo.etiquette.copyWith(color: description.texte, fontSize: 10),
          ),
        ],
      ),
    );
  }
}
