import 'package:flutter/material.dart';

import '../../noyau/format.dart';
import '../../services/utilisateurs.service.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Pastille d'un joueur : sa photo de profil s'il en a une, son monogramme sinon.
///
/// Sert partout où l'on nomme un adversaire — carte de match, écran de match — pour qu'on voie
/// **à qui** on joue et pas seulement un pseudo. La pastille garde exactement la même taille
/// dans les deux cas : la mise en page ne saute pas quand l'image arrive, et une photo qui ne
/// charge pas (session expirée, fichier retiré) retombe sur le monogramme au lieu d'un carré
/// cassé.
///
/// [photo] est le chemin renvoyé par l'API (`joueur1Photo` / `joueur2Photo`). Il ne sert pas
/// d'adresse — le fichier vient d'une route protégée — mais de deux indices : vide = pas de
/// photo, et sa valeur sert de clé pour que Flutter recharge l'image quand elle change.
class AvatarJoueur extends StatelessWidget {
  const AvatarJoueur({
    super.key,
    required this.utilisateurId,
    required this.pseudo,
    this.photo = '',
    this.taille = 36,
    this.bordure,
  });

  final String utilisateurId;
  final String pseudo;
  final String photo;
  final double taille;

  /// Liseré facultatif, utile sur un fond sombre où la pastille se confondrait.
  final Color? bordure;

  @override
  Widget build(BuildContext context) {
    final pastille = ClipOval(
      child: SizedBox(
        width: taille,
        height: taille,
        child: photo.isEmpty
            ? _Monogramme(pseudo: pseudo, taille: taille)
            : Image.network(
                UtilisateursService.urlPhoto(utilisateurId),
                key: ValueKey(photo),
                headers: UtilisateursService.entetesPhoto,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => _Monogramme(pseudo: pseudo, taille: taille),
              ),
      ),
    );

    if (bordure == null) return pastille;
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: bordure!, width: 1),
      ),
      child: pastille,
    );
  }
}

class _Monogramme extends StatelessWidget {
  const _Monogramme({required this.pseudo, required this.taille});

  final String pseudo;
  final double taille;

  @override
  Widget build(BuildContext context) => Container(
        color: Couleurs.vert,
        alignment: Alignment.center,
        child: Text(
          monogramme(pseudo),
          style: Typo.chiffres(taille: taille * 0.36, poids: 700, couleur: Couleurs.craie),
        ),
      );
}
