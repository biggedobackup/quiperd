import 'package:flutter/material.dart';

import '../../composants/communs/logo.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';

/// Écran de démarrage : logo centré sur fond blanc, indicateur discret.
///
/// Il ne route rien lui-même — c'est `SessionEtat.demarrer()` qui lit le jeton
/// et le **valide** auprès du serveur, puis l'aiguillage racine bascule.
class SplashEcran extends StatelessWidget {
  const SplashEcran({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Couleurs.craie,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Logo(taille: 56),
            SizedBox(height: 28),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2, color: Couleurs.vert),
            ),
            SizedBox(height: 18),
            Text('Ouverture de l’arène…', style: Typo.petit),
          ],
        ),
      ),
    );
  }
}
