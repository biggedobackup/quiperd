// Package migrations gère l'AutoMigrate GORM et le seed initial.
package migrations

import (
	"fmt"

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
)

// Migrer applique l'AutoMigrate sur toutes les tables du modèle de données (§7 de la charte).
func Migrer() error {
	if err := renommerColonnesMatchs(); err != nil {
		return err
	}
	return config.DB.AutoMigrate(
		&auth.Utilisateur{},
		&auth.Administrateur{},
		&auth.SessionUtilisateur{},
		&jeux.Jeu{},
		&plateformes.Plateforme{},
		&comptes_gamers.CompteGamer{},
		&defis.Defi{},
		&matchs.MatchDefi{},
		&matchs.ResultatDeclare{},
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
	)
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
