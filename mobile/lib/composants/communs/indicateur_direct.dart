import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../temps_reel/client_temps_reel.dart';
import '../../temps_reel/evenements.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Indicateur de l'état du direct.
///
/// Il parle de la CONNEXION (« En direct », « Reconnexion… ») et jamais d'un
/// cycle de rafraîchissement : il n'y en a pas. Le serveur pousse.
class IndicateurDirect extends StatelessWidget {
  const IndicateurDirect({super.key, this.compact = false, this.clair = false});

  final bool compact;

  /// Posé sur un fond encre (carte de solde, en-tête sombre).
  final bool clair;

  @override
  Widget build(BuildContext context) {
    final etat = context.watch<ClientTempsReel>().etat;

    final couleur = switch (etat) {
      EtatDirect.connecte => Couleurs.volt,
      EtatDirect.reconnexion || EtatDirect.connexion => Couleurs.alerte,
      EtatDirect.horsLigne => Couleurs.muet,
    };

    final pastille = _Pastille(couleur: couleur, anime: etat != EtatDirect.horsLigne);
    if (compact) return pastille;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        pastille,
        const SizedBox(width: 6),
        Text(
          etat.libelle.toUpperCase(),
          style: Typo.etiquette.copyWith(
            fontSize: 10,
            color: clair ? Couleurs.craie.withValues(alpha: 0.75) : Couleurs.muet,
          ),
        ),
      ],
    );
  }
}

class _Pastille extends StatefulWidget {
  const _Pastille({required this.couleur, required this.anime});

  final Color couleur;
  final bool anime;

  @override
  State<_Pastille> createState() => _PastilleState();
}

class _PastilleState extends State<_Pastille> with SingleTickerProviderStateMixin {
  late final AnimationController _controleur = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 2),
  );

  @override
  void initState() {
    super.initState();
    if (widget.anime) _controleur.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant _Pastille ancien) {
    super.didUpdateWidget(ancien);
    if (widget.anime && !_controleur.isAnimating) {
      _controleur.repeat(reverse: true);
    } else if (!widget.anime && _controleur.isAnimating) {
      _controleur.stop();
      _controleur.value = 1;
    }
  }

  @override
  void dispose() {
    _controleur.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 1, end: 0.3).animate(_controleur),
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: widget.couleur, shape: BoxShape.circle),
      ),
    );
  }
}
