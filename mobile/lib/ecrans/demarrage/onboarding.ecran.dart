import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../composants/communs/bouton.dart';
import '../../composants/communs/logo.dart';
import '../../etats/session.etat.dart';
import '../../theme/couleurs.dart';
import '../../theme/typographie.dart';
import '../authentification/connexion.ecran.dart';
import '../authentification/inscription.ecran.dart';

/// Découverte en trois écrans, vue une seule fois.
///
/// Les trois messages sont ceux du site : créer un défi et miser, un adversaire
/// rejoint et les deux mises passent en séquestre, le gagnant remporte tout.
/// **Aucun jeu n'est nommé** : la plateforme les couvre tous.
class OnboardingEcran extends StatefulWidget {
  const OnboardingEcran({super.key});

  @override
  State<OnboardingEcran> createState() => _OnboardingEcranState();
}

class _OnboardingEcranState extends State<OnboardingEcran> {
  final PageController _pages = PageController();
  int _index = 0;

  static const List<({String titre, String texte, IconData icone})> _etapes = [
    (
      titre: 'Créez un défi',
      texte: 'Choisissez votre jeu, votre plateforme et votre mise. '
          'Elle est bloquée en séquestre dès la création.',
      icone: Icons.add_circle_outline,
    ),
    (
      titre: 'Un adversaire rejoint',
      texte: 'Sa mise rejoint la vôtre en séquestre. '
          'Vous vous affrontez en réel, sur le jeu et la plateforme du défi.',
      icone: Icons.handshake_outlined,
    ),
    (
      titre: 'Le gagnant remporte tout',
      texte: 'Vous déclarez le score chacun de votre côté. '
          'Deux déclarations identiques règlent le match immédiatement.',
      icone: Icons.emoji_events_outlined,
    ),
  ];

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _aller(Widget ecran) async {
    await context.read<SessionEtat>().marquerOnboardingVu();
    if (!mounted) return;
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ecran));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Couleurs.craie,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Logo(),
                  TextButton(
                    onPressed: () => _aller(const ConnexionEcran()),
                    child: Text('PASSER',
                        style: Typo.etiquette.copyWith(color: Couleurs.muet, fontSize: 11)),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pages,
                itemCount: _etapes.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (context, i) => _Diapositive(etape: _etapes[i], numero: i + 1),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                _etapes.length,
                (i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: i == _index ? 22 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: i == _index ? Couleurs.vert : Couleurs.trait,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
              child: Column(
                children: [
                  Bouton(
                    libelle: 'Créer un compte',
                    bloc: true,
                    taille: TailleBouton.lg,
                    variante: VarianteBouton.volt,
                    iconeFin: Icons.arrow_forward,
                    onPressed: () => _aller(const InscriptionEcran()),
                  ),
                  const SizedBox(height: 10),
                  Bouton(
                    libelle: 'Se connecter',
                    bloc: true,
                    variante: VarianteBouton.secondaire,
                    onPressed: () => _aller(const ConnexionEcran()),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Diapositive extends StatelessWidget {
  const _Diapositive({required this.etape, required this.numero});

  final ({String titre, String texte, IconData icone}) etape;
  final int numero;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: AspectRatio(
              aspectRatio: 16 / 10,
              child: Image.asset(
                'assets/images/hero-gaming.jpg',
                fit: BoxFit.cover,
                errorBuilder: (context, _, _) => Container(
                  color: Couleurs.encre,
                  alignment: Alignment.center,
                  child: Icon(etape.icone, size: 48, color: Couleurs.volt),
                ),
              ),
            ),
          ),
          const SizedBox(height: 28),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Couleurs.vertPale,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text('0$numero',
                style: Typo.chiffres(taille: 11, poids: 700, couleur: Couleurs.vert)),
          ),
          const SizedBox(height: 14),
          Text(etape.titre, style: Typo.h1),
          const SizedBox(height: 12),
          Text(etape.texte, style: Typo.corps.copyWith(color: Couleurs.muet)),
        ],
      ),
    );
  }
}
