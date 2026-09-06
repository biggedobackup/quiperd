package auth

import (
	"time"

	"github.com/google/uuid"
	"quiperd/backend/utils"
)

// Statuts de compte. `supprime` = suppression logique par un administrateur
// (DELETE /utilisateurs/:id) : la ligne reste en base, anonymisée, et la connexion
// est refusée (403) comme pour un compte suspendu.
const (
	StatutActif     = "actif"
	StatutSuspendu  = "suspendu"
	StatutEnAttente = "en_attente"
	StatutSupprime  = "supprime"
)

// Utilisateur — joueur de la plateforme (table 1).
type Utilisateur struct {
	utils.ModeleBase
	NomUtilisateur string `gorm:"type:varchar(50);uniqueIndex" json:"nomUtilisateur"`
	Email          string `gorm:"type:varchar(255);uniqueIndex" json:"email"`
	Telephone      string `gorm:"type:varchar(30)" json:"telephone"`
	MotDePasse     string `gorm:"type:text" json:"-"`
	PhotoProfil    string `gorm:"type:text" json:"photoProfil"`
	Pays           string `gorm:"type:varchar(100)" json:"pays"`
	Statut         string `gorm:"type:varchar(20);default:'actif';index" json:"statut"`
	// EmailVerifie : l'adresse a été confirmée par le code à 6 chiffres envoyé à
	// l'inscription (POST /auth/verification-email). Tant qu'il vaut false, le joueur
	// peut déposer de l'argent mais ne peut ni créer/rejoindre un défi ni demander un
	// retrait. Les comptes antérieurs à la migration sont passés à true (voir
	// migrations.preparerVerificationEmail) : personne n'est bloqué rétroactivement.
	EmailVerifie     bool      `gorm:"column:email_verifie;not null;default:false" json:"emailVerifie"`
	DateModification time.Time `gorm:"autoUpdateTime" json:"dateModification"`
}

func (Utilisateur) TableName() string { return "utilisateurs" }

// Administrateur — arbitre/gestionnaire (table 15), table distincte des joueurs.
type Administrateur struct {
	utils.ModeleBase
	Nom        string `gorm:"type:varchar(150)" json:"nom"`
	Email      string `gorm:"type:varchar(255);uniqueIndex" json:"email"`
	MotDePasse string `gorm:"type:text" json:"-"`
	Role       string `gorm:"type:varchar(50);default:'admin'" json:"role"`
	Statut     string `gorm:"type:varchar(20);default:'actif'" json:"statut"`
}

func (Administrateur) TableName() string { return "administrateurs" }

// SessionUtilisateur — appareils et jeton FCM des joueurs (table 18).
// Le contrôle de validité du JWT se fait via Redis (liste blanche des jti) ;
// cette table sert au suivi appareil et au push FCM.
type SessionUtilisateur struct {
	utils.ModeleBase
	UtilisateurID       uuid.UUID `gorm:"type:uuid;index" json:"utilisateurId"`
	JetonHash           string    `gorm:"type:text" json:"-"`
	JetonFCM            string    `gorm:"type:text" json:"jetonFcm"`
	Appareil            string    `gorm:"type:varchar(255)" json:"appareil"`
	AdresseIP           *string   `gorm:"type:inet" json:"adresseIp,omitempty"`
	DateExpiration      time.Time `json:"dateExpiration"`
	DerniereUtilisation time.Time `gorm:"autoUpdateTime" json:"derniereUtilisation"`
}

func (SessionUtilisateur) TableName() string { return "sessions_utilisateurs" }
