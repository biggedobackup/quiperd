import 'package:flutter/material.dart';

/// Catalogue : les 7 catégories de jeu et les 3 familles de plateforme.
/// Miroir de `frontend/src/lib/catalogue.ts` — c'est la seule source des
/// libellés, icônes et de l'ORDRE d'affichage.
///
/// Les jeux et les plateformes eux-mêmes viennent toujours de l'API
/// (`GET /api/jeux`, `GET /api/plateformes`) : aucun titre n'est écrit en dur.

class CategorieJeu {
  const CategorieJeu(this.valeur, this.libelle, this.description, this.icone);
  final String valeur;
  final String libelle;
  final String description;
  final IconData icone;
}

const List<CategorieJeu> categoriesJeu = [
  CategorieJeu('sport', 'Sport', 'Football, basket, football américain, hockey, baseball, glisse.',
      Icons.sports_soccer),
  CategorieJeu('combat', 'Combat', 'Jeux de baston, arts martiaux et catch.', Icons.sports_mma),
  CategorieJeu('course', 'Course', 'Simulation auto, moto et course arcade.', Icons.sports_motorsports),
  CategorieJeu('tir', 'Tir', 'FPS, tir tactique et battle royale.', Icons.gps_fixed),
  CategorieJeu('strategie', 'Stratégie', 'MOBA, stratégie en temps réel et duels mobiles.',
      Icons.account_tree_outlined),
  CategorieJeu('cartes', 'Cartes', 'Jeux de cartes à collectionner.', Icons.style_outlined),
  CategorieJeu('arcade', 'Arcade', 'Parties courtes, fun et compétitives.', Icons.videogame_asset_outlined),
];

class FamillePlateforme {
  const FamillePlateforme(this.valeur, this.libelle, this.icone);
  final String valeur;
  final String libelle;
  final IconData icone;
}

const List<FamillePlateforme> famillesPlateforme = [
  FamillePlateforme('pc', 'PC', Icons.computer),
  FamillePlateforme('console', 'Consoles', Icons.sports_esports),
  FamillePlateforme('mobile', 'Mobile', Icons.smartphone),
];

CategorieJeu decrireCategorie(String? valeur) => categoriesJeu.firstWhere(
      (c) => c.valeur == valeur,
      orElse: () => CategorieJeu(
        valeur ?? 'arcade',
        (valeur == null || valeur.isEmpty) ? 'Autre' : valeur,
        '',
        Icons.videogame_asset_outlined,
      ),
    );

FamillePlateforme decrireFamille(String? valeur) => famillesPlateforme.firstWhere(
      (f) => f.valeur == valeur,
      orElse: () => FamillePlateforme(
        valeur ?? 'console',
        (valeur == null || valeur.isEmpty) ? 'Autre' : valeur,
        Icons.tv_outlined,
      ),
    );

bool estCategorie(String? valeur) => categoriesJeu.any((c) => c.valeur == valeur);

bool estFamille(String? valeur) => famillesPlateforme.any((f) => f.valeur == valeur);
