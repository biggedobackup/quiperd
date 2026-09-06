package contact

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"quiperd/backend/administration"
	"quiperd/backend/config"
	"quiperd/backend/utils"
)

const (
	// MaxMessagesParHeure : plafond anti-spam par adresse IP (au-delà → 429).
	MaxMessagesParHeure = 5
	// FenetreAntiSpam : durée de vie du compteur Redis d'une adresse IP.
	FenetreAntiSpam = time.Hour
	prefixeCleIP    = "contact:ip:"
	tableCible      = "messages_contact"
)

// CleAntiSpam renvoie la clé Redis du compteur d'envois d'une adresse IP (`contact:ip:<ip>`).
func CleAntiSpam(ip string) string { return prefixeCleIP + ip }

// AutoriserEnvoi incrémente le compteur de l'adresse IP (TTL d'une heure posé à la première
// occurrence) et renvoie faux au-delà de MaxMessagesParHeure. Le compteur n'est incrémenté
// qu'après validation du corps : un formulaire mal rempli ne consomme pas le quota.
// Redis indisponible → l'envoi est accepté (le formulaire de contact ne doit pas tomber avec
// le cache) et l'incident est journalisé côté serveur.
func AutoriserEnvoi(ip string) bool {
	if ip == "" {
		ip = "inconnue"
	}
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	cle := CleAntiSpam(ip)
	n, err := config.Redis.Incr(ctx, cle).Result()
	if err != nil {
		if utils.Log != nil {
			utils.Log.Warn("anti-spam contact : Redis indisponible, envoi accepté — " + err.Error())
		}
		return true
	}
	if n == 1 {
		config.Redis.Expire(ctx, cle, FenetreAntiSpam)
	} else if n > MaxMessagesParHeure {
		// Filet de sécurité : une clé restée sans TTL (EXPIRE perdu après l'INCR initial)
		// bloquerait l'adresse définitivement — on lui redonne une fenêtre d'une heure.
		if ttl, err := config.Redis.TTL(ctx, cle).Result(); err == nil && ttl < 0 {
			config.Redis.Expire(ctx, cle, FenetreAntiSpam)
		}
	}
	return n <= MaxMessagesParHeure
}

// creer enregistre un nouveau message (statut `nouveau`).
func creer(m *MessageContact) error {
	return config.DB.Create(m).Error
}

// charger lit un message par identifiant (gorm.ErrRecordNotFound s'il n'existe pas).
func charger(id uuid.UUID) (*MessageContact, error) {
	var m MessageContact
	if err := config.DB.First(&m, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// lister renvoie une page de messages, plus récents d'abord, filtrée par statut si fourni.
// La liste renvoyée n'est jamais nulle (`[]` en JSON).
func lister(statut string, taille, offset int) ([]MessageContact, int64, error) {
	base := config.DB.Model(&MessageContact{})
	if statut != "" {
		base = base.Where("statut = ?", statut)
	}
	// Session : le même filtre sert au comptage puis à la lecture, sans se contaminer.
	base = base.Session(&gorm.Session{})

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	liste := []MessageContact{}
	if err := base.Order("date_creation DESC, id DESC").Limit(taille).Offset(offset).Find(&liste).Error; err != nil {
		return nil, 0, err
	}
	return liste, total, nil
}

// traiter applique le nouveau statut et/ou la note admin, puis journalise
// `contact:statut_<statut>` dans `journaux_audit` si le statut a changé.
func traiter(m *MessageContact, statut string, note *string, adminID uuid.UUID, ip string) error {
	ancien := m.Statut
	if note != nil {
		m.NoteAdmin = strings.TrimSpace(*note)
	}
	if statut != "" {
		m.Statut = statut
	}
	return config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(m).Error; err != nil {
			return err
		}
		if m.Statut != ancien {
			administration.Journaliser(tx, administration.ParamsAudit{
				AdministrateurID: &adminID,
				Action:           "contact:statut_" + m.Statut,
				TableCible:       tableCible,
				IdentifiantCible: &m.ID,
				Ancienne:         map[string]any{"statut": ancien},
				Nouvelle:         map[string]any{"statut": m.Statut},
				AdresseIP:        ip,
			})
		}
		return nil
	})
}

// supprimer efface le message et journalise `contact:suppression` (ancienne valeur =
// instantané du message). gorm.ErrRecordNotFound si la ligne a disparu entre-temps.
func supprimer(m *MessageContact, adminID uuid.UUID, ip string) error {
	return config.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Delete(&MessageContact{}, "id = ?", m.ID)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		administration.Journaliser(tx, administration.ParamsAudit{
			AdministrateurID: &adminID,
			Action:           "contact:suppression",
			TableCible:       tableCible,
			IdentifiantCible: &m.ID,
			Ancienne:         m,
			AdresseIP:        ip,
		})
		return nil
	})
}
