package matchs

import "gorm.io/gorm"

// ListerTous renvoie, pour l'administration (GET /matchs?tous=1), une page de tous les
// matchs — plus récents d'abord, filtre `statut` facultatif — et le total après filtre.
// Vit hors de services.go pour laisser ce fichier à la seule logique d'escrow.
func ListerTous(db *gorm.DB, statut string, taille, offset int) ([]MatchEnrichi, int64, error) {
	compte := db.Model(&MatchDefi{})
	if statut != "" {
		compte = compte.Where("statut = ?", statut)
	}
	var total int64
	if err := compte.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := requeteEnrichie(db)
	if statut != "" {
		q = q.Where("m.statut = ?", statut)
	}
	liste := []MatchEnrichi{}
	err := q.Order("m.date_creation DESC").Limit(taille).Offset(offset).Scan(&liste).Error
	return liste, total, err
}
