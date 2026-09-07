import 'package:flutter/material.dart';

import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../communs/bouton.dart';

/// Bandeau discret, affiché sur tout l'espace joueur tant que l'adresse n'est
/// pas confirmée.
class BandeauEmailNonConfirme extends StatelessWidget {
  const BandeauEmailNonConfirme({super.key, required this.email, required this.onConfirmer});

  final String email;
  final VoidCallback onConfirmer;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Couleurs.alerteFond,
      child: InkWell(
        onTap: onConfirmer,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Couleurs.alerte)),
          ),
          child: Row(
            children: [
              const Icon(Icons.mark_email_unread_outlined, size: 18, color: Couleurs.alerte),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Confirmez $email pour créer un défi, en rejoindre un ou retirer.',
                  style: Typo.petit.copyWith(color: Couleurs.alerte),
                ),
              ),
              const Icon(Icons.chevron_right, size: 18, color: Couleurs.alerte),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bloc plein écran qui REMPLACE une action bloquée par le serveur.
///
/// On ne propose pas un bouton dont l'envoi serait refusé en 403 : on mène
/// directement à ce qui débloque l'action.
class BlocEmailNonConfirme extends StatelessWidget {
  const BlocEmailNonConfirme({
    super.key,
    required this.action,
    required this.onConfirmer,
    this.note,
  });

  /// « créer un défi », « rejoindre ce défi », « demander un retrait ».
  final String action;
  final VoidCallback onConfirmer;
  final String? note;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Couleurs.alerteFond,
        border: Border.all(color: Couleurs.alerte),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.shield_outlined, color: Couleurs.alerte, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text('Adresse à confirmer', style: Typo.h3.copyWith(color: Couleurs.alerte)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'De l’argent réel transite par votre compte : nous vérifions une seule fois '
            'que cette adresse est bien la vôtre avant de vous laisser $action.',
            style: Typo.legende.copyWith(color: Couleurs.encre),
          ),
          if (note != null) ...[
            const SizedBox(height: 8),
            Text(note!, style: Typo.petit),
          ],
          const SizedBox(height: 18),
          Bouton(
            libelle: 'Confirmer mon adresse',
            bloc: true,
            taille: TailleBouton.lg,
            variante: VarianteBouton.volt,
            icone: Icons.mail_outline,
            onPressed: onConfirmer,
          ),
        ],
      ),
    );
  }
}
