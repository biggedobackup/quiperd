// Package migrations gère l'AutoMigrate GORM et le seed initial.
package migrations

import (
	"fmt"

	"go.uber.org/zap"
	"quiperd/backend/administration"
	"quiperd/backend/auth"
	"quiperd/backend/comptes_gamers"
	"quiperd/backend/config"
	"quiperd/backend/contact"
	"quiperd/backend/defis"
	"quiperd/backend/jeux"
	"quiperd/backend/litiges"
	"quiperd/backend/matchs"
	"quiperd/backend/notifications"
	"quiperd/backend/paiements"
	"quiperd/backend/plateformes"
	"quiperd/backend/portefeuilles"
	"quiperd/backend/preuves"
	"quiperd/backend/utils"
)

// Migrer applique l'AutoMigrate sur toutes les tables du modèle de données (§7 de la charte).
// Les préparations manuelles (renommages, index à recréer) tournent AVANT : GORM n'altère
// jamais un index existant dont la définition a changé, il faut le supprimer soi-même.
func Migrer() error {
	if err := renommerColonnesMatchs(); err != nil {
		return err
	}
	if err := preparerManches(); err != nil {
		return err
	}
	if err := config.DB.AutoMigrate(
		&auth.Utilisateur{},
		&auth.Administrateur{},
		&auth.SessionUtilisateur{},
		&jeux.Jeu{},
		&plateformes.Plateforme{},
		&comptes_gamers.CompteGamer{},
		&defis.Defi{},
		&matchs.MatchDefi{},
		&matchs.ResultatDeclare{},
		&matchs.ChoixNul{},
		&portefeuilles.Mise{},
		&portefeuilles.Portefeuille{},
		&portefeuilles.TransactionPortefeuille{},
		&preuves.PreuveMatch{},
		&litiges.Litige{},
		&paiements.Paiement{},
		&paiements.PaiementEvenement{},
		&notifications.Notification{},
		&administration.ConfigurationFinanciere{},
		&administration.JournalAudit{},
		&contact.MessageContact{},
	); err != nil {
		return err
	}
	return finaliserManches()
}

// renommerColonnesMatchs aligne une base créée avant le correctif de nommage
// (joueur1_id, score_joueur1) sur le modèle de données (joueur_1_id, score_joueur_1).
// Idempotent : ne fait rien si les colonnes portent déjà le bon nom.
func renommerColonnesMatchs() error {
	m := config.DB.Migrator()
	if !m.HasTable(&matchs.MatchDefi{}) {
		return nil
	}
	renommages := [][2]string{
		{"joueur1_id", "joueur_1_id"},
		{"joueur2_id", "joueur_2_id"},
		{"score_joueur1", "score_joueur_1"},
		{"score_joueur2", "score_joueur_2"},
	}
	for _, r := range renommages {
		if m.HasColumn(&matchs.MatchDefi{}, r[0]) && !m.HasColumn(&matchs.MatchDefi{}, r[1]) {
			if err := m.RenameColumn(&matchs.MatchDefi{}, r[0], r[1]); err != nil {
				return err
			}
		}
	}
	// Anciens index (le Migrator.DropIndex du driver postgres génère un SQL invalide
	// avec CURRENT_SCHEMA() ; les noms sont des constantes, DROP INDEX brut suffit).
	for _, idx := range []string{"idx_matchs_joueur1_id", "idx_matchs_joueur2_id"} {
		if err := config.DB.Exec(fmt.Sprintf("DROP INDEX IF EXISTS %q", idx)).Error; err != nil {
			return err
		}
	}
	return nil
}

// preparerManches rend possible le rejeu d'une manche sur un match nul.
//
// Point de rupture traité ici : `idx_decl_match_user` était UNIQUE sur (match_id,
// utilisateur_id) — un joueur ne pouvait donc jamais redéclarer après un « rejouer ». La
// nouvelle clé porte la manche. GORM ne redéfinit pas un index existant : on le supprime
// avant l'AutoMigrate, qui le recrée avec les trois colonnes. Les colonnes `manche` sont
// ajoutées à la main AVANT la suppression pour qu'aucune fenêtre ne laisse la table sans
// protection contre la double déclaration.
func preparerManches() error {
	m := config.DB.Migrator()
	if m.HasTable(&matchs.MatchDefi{}) && !m.HasColumn(&matchs.MatchDefi{}, "manche") {
		if err := config.DB.Exec(
			`ALTER TABLE matchs ADD COLUMN IF NOT EXISTS manche bigint NOT NULL DEFAULT 1`).Error; err != nil {
			return err
		}
	}
	if !m.HasTable(&matchs.ResultatDeclare{}) {
		return nil
	}
	if !m.HasColumn(&matchs.ResultatDeclare{}, "manche") {
		if err := config.DB.Exec(
			`ALTER TABLE resultats_declares ADD COLUMN IF NOT EXISTS manche bigint NOT NULL DEFAULT 1`).Error; err != nil {
			return err
		}
	}
	// Toute ligne antérieure appartient à la manche 1 : la nouvelle clé unique
	// (match_id, utilisateur_id, manche) ne peut donc pas être violée à la création.
	if err := config.DB.Exec(`UPDATE resultats_declares SET manche = 1 WHERE manche IS NULL OR manche = 0`).Error; err != nil {
		return err
	}
	if err := config.DB.Exec(`UPDATE matchs SET manche = 1 WHERE manche IS NULL OR manche = 0`).Error; err != nil {
		return err
	}
	// Ancienne clé unique à deux colonnes : supprimée pour que l'AutoMigrate recrée la
	// version à trois colonnes.
	return config.DB.Exec(`DROP INDEX IF EXISTS "idx_decl_match_user"`).Error
}

// finaliserManches vérifie l'état de la base après l'AutoMigrate et signale les matchs
// hérités du statut `verification`, qui ne fait plus partie du parcours joueur : ils
// restent réglables par POST /api/matchs/:id/validation (administration). Aucun mouvement
// d'argent n'est déclenché au démarrage — un règlement automatique dans une migration
// serait beaucoup trop risqué.
func finaliserManches() error {
	var n int64
	if err := config.DB.Table("matchs").Where("statut = ?", matchs.StatutVerification).Count(&n).Error; err != nil {
		return err
	}
	if n > 0 && utils.Log != nil {
		utils.Log.Warn("matchs hérités en statut verification : à régler depuis l'administration (POST /api/matchs/:id/validation)",
			zap.Int64("matchs", n))
	}
	return nil
}
