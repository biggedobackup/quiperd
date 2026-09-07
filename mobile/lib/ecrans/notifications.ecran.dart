import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../composants/communs/bouton.dart';
import '../composants/communs/en_tete_page.dart';
import '../composants/communs/etat_vide.dart';
import '../composants/communs/indicateur_direct.dart';
import '../composants/communs/squelette.dart';
import '../etats/notifications.etat.dart';
import '../modeles/notification_joueur.modele.dart';
import '../noyau/format.dart';
import '../noyau/statuts.dart';
import '../theme/couleurs.dart';
import '../theme/typographie.dart';

/// Notifications du joueur — poussées par le salon privé, jamais réinterrogées
/// en boucle. Aucun message flottant ici : le joueur regarde déjà l'écran, la
/// ligne qui apparaît suffit.
class NotificationsEcran extends StatelessWidget {
  const NotificationsEcran({super.key});

  @override
  Widget build(BuildContext context) {
    final etat = context.watch<NotificationsEtat>();

    return Scaffold(
      backgroundColor: Couleurs.craie,
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: const [
          Padding(padding: EdgeInsets.only(right: 16), child: Center(child: IndicateurDirect())),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => etat.charger(force: true),
          color: Couleurs.vert,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              EnTetePage(
                surtitre: 'Activité',
                titre: 'Notifications',
                description: etat.nonLues > 0 ? '${etat.nonLues} non lue(s).' : 'Tout est lu.',
              ),
              if (etat.nonLues > 0) ...[
                const SizedBox(height: 16),
                Bouton(
                  libelle: 'Tout marquer comme lu',
                  variante: VarianteBouton.secondaire,
                  icone: Icons.done_all,
                  onPressed: etat.toutMarquerLu,
                ),
              ],
              const SizedBox(height: 18),
              if (etat.chargement && etat.liste.isEmpty)
                const SqueletteDiffere(child: SqueletteCartes(nombre: 4, hauteur: 76))
              else if (etat.liste.isEmpty)
                const EtatVide(
                  icone: Icons.notifications_none,
                  titre: 'Aucune notification',
                  description: 'Vous serez prévenu dès qu’un adversaire rejoint votre défi ou '
                      'qu’un match évolue.',
                )
              else
                ...etat.liste.map(
                  (n) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _Ligne(
                      notification: n,
                      recente: etat.recentes.contains(n.id),
                      onTap: () => etat.marquerLue(n.id),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne({required this.notification, required this.recente, required this.onTap});

  final NotificationJoueur notification;
  final bool recente;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final icone = iconesNotification[notification.type] ?? Icons.notifications_none;
    final libelleType = typesNotification[notification.type];

    return Material(
      color: notification.lu ? Couleurs.papier : Couleurs.vertPale,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            border: Border.all(color: recente ? Couleurs.vert : Couleurs.trait),
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: notification.lu ? Couleurs.gris : Couleurs.craie,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icone, size: 18, color: Couleurs.vert),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      notification.titre,
                      style: notification.lu ? Typo.legende : Typo.legendeForte,
                    ),
                    const SizedBox(height: 2),
                    Text(notification.message, style: Typo.petit),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        if (libelleType != null) ...[
                          Text(libelleType.toUpperCase(),
                              style: Typo.etiquette.copyWith(
                                  color: Couleurs.muet, fontSize: 9)),
                          const SizedBox(width: 8),
                        ],
                        Text(formatDateRelative(notification.dateCreation), style: Typo.petit),
                      ],
                    ),
                  ],
                ),
              ),
              if (!notification.lu)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(color: Couleurs.vert, shape: BoxShape.circle),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
