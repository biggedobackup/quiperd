import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Présence de l'adversaire sur l'écran du match, poussée par `match.presence`.
///
/// Tant que le direct n'est pas établi, on n'affirme rien : dire « hors ligne »
/// alors que c'est notre propre socket qui est coupé serait un mensonge.
class PresenceAdversaire extends StatelessWidget {
  const PresenceAdversaire({super.key, required this.enLigne, required this.direct});

  final bool? enLigne;
  final bool direct;

  @override
  Widget build(BuildContext context) {
    if (!direct || enLigne == null) {
      return Text('Présence inconnue', style: Typo.petit);
    }
    final present = enLigne!;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: present ? Couleurs.volt : Couleurs.muet,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          present ? 'Adversaire en ligne' : 'Adversaire absent',
          style: Typo.petit.copyWith(color: present ? Couleurs.gain : Couleurs.muet),
        ),
      ],
    );
  }
}
