// Package migrations gère l'AutoMigrate GORM et le seed initial.
package migrations

import (
	"fmt"

	"defisenligne/backend/administration"
	"defisenligne/backend/auth"
	"defisenligne/backend/comptes_gamers"
	"defisenligne/backend/config"
	"defisenligne/backend/contact"
	"defisenligne/backend/defis"
	"defisenligne/backend/jeux"
	"defisenligne/backend/litiges"
	"defisenligne/backend/matchs"
	"defisenligne/backend/notifications"
	"defisenligne/backend/paiements"
	"defisenligne/backend/plateformes"
	"defisenligne/backend/portefeuilles"
	"defisenligne/backend/preuves"
	"defisenligne/backend/utils"
	"go.uber.org/zap"
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
	if err := preparerVerificationEmail(); err != nil {
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
	if err := indexComposites(); err != nil {
		return err
	}
	if err := retirerAvecScore(); err != nil {
		return err
	}
	return finaliserManches()
}

// retirerAvecScore supprime la colonne `jeux.avec_score`, restée sur les bases de
// développement qui ont fait tourner la version à deux modes de déclaration.
//
// Un match ne se déclare plus qu'en désignant le vainqueur, quel que soit le jeu : la
// colonne ne pilote plus rien et AutoMigrate ne sait pas retirer un champ disparu du
// modèle. On la retire donc explicitement, une fois, et l'appel devient sans effet ensuite.
func retirerAvecScore() error {
	m := config.DB.Migrator()
	if !m.HasColumn(&jeux.Jeu{}, "avec_score") {
		return nil
	}
	return m.DropColumn(&jeux.Jeu{}, "avec_score")
}

// indexComposites ajoute les index que les modèles ne savent pas exprimer : ceux
// qui portent sur plusieurs colonnes ET sur un ordre.
//
// Les index à une colonne posés par les balises GORM suffisent à filtrer ; ils ne
// suffisent pas à ÉVITER LE TRI. Les quatre listes les plus consultées de la
// plateforme filtrent puis trient par date décroissante : sans index composite,
// PostgreSQL lit toutes les lignes correspondantes et les trie à chaque appel, ce
// qui se voit dès quelques milliers de mouvements de portefeuille.
//
// `CREATE INDEX IF NOT EXISTS` : idempotent, exécuté à chaque démarrage sans coût
// quand l'index est là.
func indexComposites() error {
	instructions := []string{
		// Historique du portefeuille : filtré par portefeuille, trié du plus récent.
		`CREATE INDEX IF NOT EXISTS idx_tx_portefeuille_date
		   ON transactions_portefeuilles (portefeuille_id, date_creation DESC)`,
		// Liste publique des défis ouverts, et « mes défis ».
		`CREATE INDEX IF NOT EXISTS idx_defis_statut_date
		   ON defis (statut, date_creation DESC)`,
		// Notifications d'un joueur, non lues d'abord dans le compteur.
		`CREATE INDEX IF NOT EXISTS idx_notifications_utilisateur_date
		   ON notifications (utilisateur_id, date_creation DESC)`,
		// Suivi des paiements côté administration (filtres type + statut, page 1 en tête).
		`CREATE INDEX IF NOT EXISTS idx_paiements_type_statut_date
		   ON paiements (type, statut, date_creation DESC)`,
		// Classement : les deux agrégats balaient les matchs terminés et les gains
		// validés sur une période. Sans ces index, chaque recalcul lit les tables
		// entières — invisible aujourd'hui, décisif à cent mille matchs.
		`CREATE INDEX IF NOT EXISTS idx_matchs_termines_date_fin
		   ON matchs (statut, date_fin) WHERE date_fin IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_tx_gains_date
		   ON transactions_portefeuilles (type, statut, date_creation)`,
	}
	for _, sql := range instructions {
		if err := config.DB.Exec(sql).Error; err != nil {
			return err
		}
	}
	return nil
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

// preparerVerificationEmail ajoute `utilisateurs.email_verifie`.
//
// Point délicat : les comptes DÉJÀ inscrits ne doivent pas se retrouver bloqués du jour
// au lendemain (ils ne peuvent pas confirmer une adresse pour laquelle aucun code n'a
// jamais été envoyé). La colonne est donc créée avec DEFAULT true — ce qui remplit les
// lignes existantes à true — puis le DEFAULT est ramené à false pour les futurs comptes.
//
// L'opération ne se fait QU'UNE fois : si la colonne existe déjà, on ne touche à rien.
// Un `UPDATE utilisateurs SET email_verifie = true` rejoué à chaque démarrage
// confirmerait tout le monde à chaque redémarrage et viderait la fonctionnalité de son
// sens.
func preparerVerificationEmail() error {
	m := config.DB.Migrator()
	if !m.HasTable(&auth.Utilisateur{}) {
		return nil // base neuve : l'AutoMigrate posera la colonne à false
	}
	if m.HasColumn(&auth.Utilisateur{}, "email_verifie") {
		return nil // déjà migré
	}
	if err := config.DB.Exec(
		`ALTER TABLE utilisateurs ADD COLUMN email_verifie boolean NOT NULL DEFAULT true`).Error; err != nil {
		return err
	}
	return config.DB.Exec(
		`ALTER TABLE utilisateurs ALTER COLUMN email_verifie SET DEFAULT false`).Error
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
