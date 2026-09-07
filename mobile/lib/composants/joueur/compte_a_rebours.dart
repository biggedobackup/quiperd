import 'package:flutter/material.dart';

import '../../noyau/format.dart';
import '../../noyau/horloge.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Compte à rebours d'une échéance posée par le SERVEUR (`match.echeance`,
/// `defi.dateExpiration`).
///
/// La minuterie ne sert qu'à repeindre le texte : **aucun appel réseau**. Quand
/// elle atteint zéro, [surFin] est appelé UNE fois — c'est à l'écran de
/// demander alors l'état réel, plutôt que de deviner l'issue.
class CompteARebours extends StatefulWidget {
  const CompteARebours({
    super.key,
    required this.echeance,
    this.libelle,
    this.surFin,
    this.style,
    this.couleurUrgente = Couleurs.perte,
    this.seuilUrgence = const Duration(minutes: 5),
  });

  final String echeance;
  final String? libelle;
  final VoidCallback? surFin;
  final TextStyle? style;
  final Color couleurUrgente;
  final Duration seuilUrgence;

  @override
  State<CompteARebours> createState() => _CompteAReboursState();
}

class _CompteAReboursState extends State<CompteARebours> {
  Duration _restant = Duration.zero;
  bool _finSignalee = false;

  @override
  void initState() {
    super.initState();
    _recalculer();
    // Abonnement à l'horloge commune plutôt qu'une minuterie par carte.
    Horloge.instance.addListener(_recalculer);
  }

  @override
  void didUpdateWidget(covariant CompteARebours ancien) {
    super.didUpdateWidget(ancien);
    // Le serveur a repoussé l'échéance (nouvelle manche, nouveau chrono) : on
    // repart, y compris si la fin avait déjà été signalée.
    if (ancien.echeance != widget.echeance) {
      _finSignalee = false;
      _recalculer();
    }
  }

  void _recalculer() {
    final cible = DateTime.tryParse(widget.echeance)?.toUtc();
    if (cible == null) return;
    final restant = cible.difference(DateTime.now().toUtc());
    if (!mounted) return;
    setState(() => _restant = restant);

    if (restant.inSeconds <= 0 && !_finSignalee) {
      _finSignalee = true;
      // Hors de la phase de construction : `surFin` déclenche souvent un appel API.
      WidgetsBinding.instance.addPostFrameCallback((_) => widget.surFin?.call());
    }
  }

  @override
  void dispose() {
    Horloge.instance.removeListener(_recalculer);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final urgent = _restant.inSeconds > 0 && _restant <= widget.seuilUrgence;
    final base = widget.style ?? Typo.chiffres(taille: 13, poids: 700);
    final texte = formatDuree(_restant);

    return Text(
      widget.libelle == null ? texte : '${widget.libelle} $texte',
      style: base.copyWith(color: urgent ? widget.couleurUrgente : base.color),
    );
  }
}

/// Compte à rebours mis en avant dans un panneau d'action : gros chiffres et
/// libellé explicite de ce qui se passe à l'échéance.
class BlocCompteARebours extends StatelessWidget {
  const BlocCompteARebours({
    super.key,
    required this.echeance,
    required this.consequence,
    this.surFin,
    this.clair = false,
  });

  final String echeance;

  /// Ce qu'il advient si le délai passe — le joueur doit pouvoir décider en
  /// connaissance de cause.
  final String consequence;
  final VoidCallback? surFin;
  final bool clair;

  @override
  Widget build(BuildContext context) {
    final couleur = clair ? Couleurs.craie : Couleurs.encre;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.timer_outlined, size: 18, color: clair ? Couleurs.volt : Couleurs.alerte),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CompteARebours(
                echeance: echeance,
                surFin: surFin,
                style: Typo.chiffres(taille: 20, poids: 700, couleur: couleur),
                couleurUrgente: clair ? Couleurs.volt : Couleurs.perte,
              ),
              const SizedBox(height: 2),
              Text(
                consequence,
                style: Typo.petit.copyWith(
                  color: clair ? Couleurs.craie.withValues(alpha: 0.7) : Couleurs.muet,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
