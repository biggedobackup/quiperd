package migrations

import (
	"time"

	"github.com/shopspring/decimal"
	"go.uber.org/zap"
	"quiperd/backend/administration"
	"quiperd/backend/auth"
	"quiperd/backend/config"
	"quiperd/backend/jeux"
	"quiperd/backend/plateformes"
)

// jeuSeed décrit une entrée du catalogue initial : les 50 jeux compétitifs les plus joués,
// classés par catégorie. La plateforme est ouverte à tous les jeux : l'administrateur peut
// en ajouter, en désactiver ou en supprimer depuis le tableau admin.
type jeuSeed struct {
	Nom       string
	Categorie string
}

var jeuxInitiaux = []jeuSeed{
	// Sport
	{"EA SPORTS FC 27", jeux.CategorieSport},
	{"eFootball", jeux.CategorieSport},
	{"EA SPORTS FC Mobile", jeux.CategorieSport},
	{"Dream League Soccer 2026", jeux.CategorieSport},
	{"NBA 2K27", jeux.CategorieSport},
	{"Madden NFL 27", jeux.CategorieSport},
	{"NHL 26", jeux.CategorieSport},
	{"MLB The Show 26", jeux.CategorieSport},
	{"Rocket League", jeux.CategorieSport},
	{"Tony Hawk's Pro Skater 3+4", jeux.CategorieSport},
	// Combat
	{"Street Fighter 6", jeux.CategorieCombat},
	{"Tekken 8", jeux.CategorieCombat},
	{"Mortal Kombat 1", jeux.CategorieCombat},
	{"Guilty Gear -Strive-", jeux.CategorieCombat},
	{"Dragon Ball: Sparking! ZERO", jeux.CategorieCombat},
	{"Super Smash Bros. Ultimate", jeux.CategorieCombat},
	{"The King of Fighters XV", jeux.CategorieCombat},
	{"Fatal Fury: City of the Wolves", jeux.CategorieCombat},
	{"EA SPORTS UFC 5", jeux.CategorieCombat},
	{"WWE 2K26", jeux.CategorieCombat},
	// Course
	{"Gran Turismo 7", jeux.CategorieCourse},
	{"Forza Motorsport", jeux.CategorieCourse},
	{"Forza Horizon 5", jeux.CategorieCourse},
	{"F1 26", jeux.CategorieCourse},
	{"Mario Kart World", jeux.CategorieCourse},
	{"Need for Speed Unbound", jeux.CategorieCourse},
	{"Assetto Corsa Competizione", jeux.CategorieCourse},
	{"MotoGP 25", jeux.CategorieCourse},
	// Tir
	{"Call of Duty: Black Ops 7", jeux.CategorieTir},
	{"Call of Duty: Warzone", jeux.CategorieTir},
	{"Counter-Strike 2", jeux.CategorieTir},
	{"Valorant", jeux.CategorieTir},
	{"Apex Legends", jeux.CategorieTir},
	{"Fortnite", jeux.CategorieTir},
	{"Overwatch 2", jeux.CategorieTir},
	{"Rainbow Six Siege X", jeux.CategorieTir},
	{"Battlefield 6", jeux.CategorieTir},
	{"Call of Duty: Mobile", jeux.CategorieTir},
	{"PUBG Mobile", jeux.CategorieTir},
	// Stratégie & MOBA
	{"League of Legends", jeux.CategorieStrategie},
	{"Dota 2", jeux.CategorieStrategie},
	{"Age of Empires IV", jeux.CategorieStrategie},
	{"Mobile Legends: Bang Bang", jeux.CategorieStrategie},
	{"Clash Royale", jeux.CategorieStrategie},
	{"Brawl Stars", jeux.CategorieStrategie},
	// Cartes
	{"Hearthstone", jeux.CategorieCartes},
	{"Magic: The Gathering Arena", jeux.CategorieCartes},
	{"Marvel Snap", jeux.CategorieCartes},
	// Arcade
	{"Fall Guys", jeux.CategorieArcade},
	{"Stumble Guys", jeux.CategorieArcade},
}

type plateformeSeed struct {
	Nom     string
	Famille string
}

var plateformesInitiales = []plateformeSeed{
	{"PC", plateformes.FamillePC},
	{"PlayStation 5", plateformes.FamilleConsole},
	{"PlayStation 4", plateformes.FamilleConsole},
	{"Xbox Series X|S", plateformes.FamilleConsole},
	{"Xbox One", plateformes.FamilleConsole},
	{"Nintendo Switch 2", plateformes.FamilleConsole},
	{"Nintendo Switch", plateformes.FamilleConsole},
	{"Mobile Android", plateformes.FamilleMobile},
	{"Mobile iOS", plateformes.FamilleMobile},
}

// Semer insère les données de base si elles sont absentes (idempotent) et complète les
// entrées existantes créées avant l'ajout des catégories/familles.
func Semer(log *zap.Logger) error {
	// Jeux : insertion si absent, catégorie renseignée si vide.
	for _, s := range jeuxInitiaux {
		var j jeux.Jeu
		err := config.DB.Where("nom = ?", s.Nom).First(&j).Error
		if err != nil {
			config.DB.Create(&jeux.Jeu{
				Nom: s.Nom, Categorie: s.Categorie,
				Statut: "actif",
			})
			continue
		}
		if j.Categorie == "" {
			config.DB.Model(&j).Update("categorie", s.Categorie)
		}
	}

	// Plateformes : idem, avec migration des anciens libellés (PlayStation → PlayStation 5, Xbox → Xbox Series X|S).
	renommages := map[string]string{"PlayStation": "PlayStation 5", "Xbox": "Xbox Series X|S"}
	for ancien, nouveau := range renommages {
		var nDeja int64
		config.DB.Model(&plateformes.Plateforme{}).Where("nom = ?", nouveau).Count(&nDeja)
		if nDeja == 0 {
			config.DB.Model(&plateformes.Plateforme{}).Where("nom = ?", ancien).Update("nom", nouveau)
		}
	}
	for _, s := range plateformesInitiales {
		var p plateformes.Plateforme
		err := config.DB.Where("nom = ?", s.Nom).First(&p).Error
		if err != nil {
			config.DB.Create(&plateformes.Plateforme{Nom: s.Nom, Famille: s.Famille, Statut: "actif"})
			continue
		}
		if p.Famille == "" || p.Famille != s.Famille {
			config.DB.Model(&p).Update("famille", s.Famille)
		}
	}

	// Configurations financières (commission 10 %, mise 500–100 000, frais retrait 1 %)
	configs := []struct {
		Type   string
		Valeur string
	}{
		{administration.TypeCommissionDefi, "0.10"},
		{administration.TypeMiseMinimale, "500"},
		{administration.TypeMiseMaximale, "100000"},
		{administration.TypeFraisRetrait, "0.01"},
		// Délais de la machine à états du match, en minutes (réglables depuis
		// l'administration — aucune constante en dur dans le code métier).
		{administration.TypeDelaiConfirmation, "30"},
		{administration.TypeDelaiPreuve, "120"},
		{administration.TypeDelaiChoixNul, "30"},
	}
	for _, cfg := range configs {
		var n int64
		config.DB.Model(&administration.ConfigurationFinanciere{}).
			Where("type = ? AND statut = ?", cfg.Type, "actif").Count(&n)
		if n == 0 {
			val, _ := decimal.NewFromString(cfg.Valeur)
			config.DB.Create(&administration.ConfigurationFinanciere{
				Type: cfg.Type, Valeur: val, Devise: "XOF",
				Statut: "actif", DateDebut: time.Now().UTC(),
			})
		}
	}

	// Administrateur de test
	var n int64
	config.DB.Model(&auth.Administrateur{}).Where("email = ?", config.Cfg.SeedAdminEmail).Count(&n)
	if n == 0 {
		hash, err := auth.HacherMotDePasse(config.Cfg.SeedAdminMotDePasse)
		if err != nil {
			return err
		}
		config.DB.Create(&auth.Administrateur{
			Nom: config.Cfg.SeedAdminNom, Email: config.Cfg.SeedAdminEmail,
			MotDePasse: hash, Role: "admin", Statut: "actif",
		})
		if log != nil {
			log.Info("compte administrateur de test créé", zap.String("email", config.Cfg.SeedAdminEmail))
		}
	}
	return nil
}
