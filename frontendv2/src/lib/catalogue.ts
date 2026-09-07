/**
 * Catalogue : catégories de jeu et familles de plateforme (valeurs backend) avec libellés,
 * icônes et regroupements prêts pour les listes déroulantes. Une seule source pour le site
 * public, l'espace joueur et l'admin — le client ne nomme jamais un jeu en dur.
 */
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { icone } from './icones'
import type { CategorieJeu, Jeu } from '@/models/jeu'
import type { FamillePlateforme, Plateforme } from '@/models/plateforme'
import type { GroupeOptions, OptionSelect } from '@/components/partages/select/select'

export interface DescriptionCategorie {
  valeur: CategorieJeu
  libelle: string
  description: string
  icone: IconDefinition
}

/** Ordre éditorial des catégories (identique sur toutes les pages). */
export const CATEGORIES_JEU: readonly DescriptionCategorie[] = [
  { valeur: 'sport', libelle: 'Sport', description: 'Football, basket, football américain, hockey, baseball, glisse.', icone: icone.sport },
  { valeur: 'combat', libelle: 'Combat', description: 'Jeux de baston, arts martiaux et catch.', icone: icone.combat },
  { valeur: 'course', libelle: 'Course', description: 'Simulation auto, moto et course arcade.', icone: icone.course },
  { valeur: 'tir', libelle: 'Tir', description: 'FPS, tir tactique et battle royale.', icone: icone.tir },
  { valeur: 'strategie', libelle: 'Stratégie', description: 'MOBA, stratégie en temps réel et duels mobiles.', icone: icone.strategie },
  { valeur: 'cartes', libelle: 'Cartes', description: 'Jeux de cartes à collectionner.', icone: icone.cartes },
  { valeur: 'arcade', libelle: 'Arcade', description: 'Parties courtes, fun et compétitives.', icone: icone.arcade },
]

export interface DescriptionFamille {
  valeur: FamillePlateforme
  libelle: string
  icone: IconDefinition
}

export const FAMILLES_PLATEFORME: readonly DescriptionFamille[] = [
  { valeur: 'pc', libelle: 'PC', icone: icone.pc },
  { valeur: 'console', libelle: 'Consoles', icone: icone.console },
  { valeur: 'mobile', libelle: 'Mobile', icone: icone.mobile },
]

export function estCategorie(valeur: unknown): valeur is CategorieJeu {
  return typeof valeur === 'string' && CATEGORIES_JEU.some((c) => c.valeur === valeur)
}

export function estFamille(valeur: unknown): valeur is FamillePlateforme {
  return typeof valeur === 'string' && FAMILLES_PLATEFORME.some((f) => f.valeur === valeur)
}

export function decrireCategorie(valeur: string): DescriptionCategorie {
  return CATEGORIES_JEU.find((c) => c.valeur === valeur) ?? { valeur: 'arcade', libelle: valeur || 'Autre', description: '', icone: icone.jeu }
}

export function libelleCategorie(valeur: string): string {
  return decrireCategorie(valeur).libelle
}

export function decrireFamille(valeur: string): DescriptionFamille {
  return FAMILLES_PLATEFORME.find((f) => f.valeur === valeur) ?? { valeur: 'console', libelle: valeur || 'Autre', icone: icone.ecran }
}

export function libelleFamille(valeur: string): string {
  return decrireFamille(valeur).libelle
}

/** Jeux regroupés par catégorie, dans l'ordre éditorial ; les catégories vides sont omises. */
export function grouperJeux(jeux: readonly Jeu[]): Array<{ categorie: DescriptionCategorie; jeux: Jeu[] }> {
  return CATEGORIES_JEU.map((c) => ({ categorie: c, jeux: jeux.filter((j) => j.categorie === c.valeur) })).filter((g) => g.jeux.length > 0)
}

/** Plateformes regroupées par famille (PC, consoles, mobile). */
export function grouperPlateformes(plateformes: readonly Plateforme[]): Array<{ famille: DescriptionFamille; plateformes: Plateforme[] }> {
  return FAMILLES_PLATEFORME.map((f) => ({ famille: f, plateformes: plateformes.filter((p) => p.famille === f.valeur) })).filter(
    (g) => g.plateformes.length > 0,
  )
}

/** Groupes `<optgroup>` pour une liste déroulante de jeux. */
export function optionsJeuxGroupees(jeux: readonly Jeu[]): GroupeOptions[] {
  return grouperJeux(jeux).map((g) => ({ libelle: g.categorie.libelle, options: g.jeux.map((j) => ({ valeur: j.id, libelle: j.nom })) }))
}

/** Groupes `<optgroup>` pour une liste déroulante de plateformes. */
export function optionsPlateformesGroupees(plateformes: readonly Plateforme[]): GroupeOptions[] {
  return grouperPlateformes(plateformes).map((g) => ({ libelle: g.famille.libelle, options: g.plateformes.map((p) => ({ valeur: p.id, libelle: p.nom })) }))
}

export const optionsCategories: OptionSelect[] = CATEGORIES_JEU.map((c) => ({ valeur: c.valeur, libelle: c.libelle }))
export const optionsFamilles: OptionSelect[] = FAMILLES_PLATEFORME.map((f) => ({ valeur: f.valeur, libelle: f.libelle }))
