package utilisateurs

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"quiperd/backend/administration"
	"quiperd/backend/auth"
	"quiperd/backend/config"
	"quiperd/backend/utils"
)

// PhotoMaxOctets : 3 Mo. Une photo de profil est affichée dans un rond de quelques
// dizaines de pixels ; au-delà, on ne stocke que du poids inutile — et sur une
// connexion mobile ivoirienne, un téléversement de 20 Mo échoue plus souvent qu'il
// n'aboutit.
const PhotoMaxOctets int64 = 3 * 1024 * 1024

// TeleverserPhoto godoc
// @Summary Envoyer sa photo de profil (fichier image)
// @Description Le joueur téléverse un fichier ; aucune adresse externe n'est acceptée. L'ancienne photo est remplacée.
// @Tags utilisateurs
// @Security BearerAuth
// @Accept multipart/form-data
// @Param fichier formData file true "Image (jpg, jpeg, png, webp, heic), 3 Mo maximum"
// @Success 200 {object} auth.Utilisateur
// @Failure 400 {object} map[string]any
// @Router /utilisateurs/moi/photo [post]
func TeleverserPhoto(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)

	fichier, err := c.FormFile("fichier")
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "fichier manquant")
	}
	if fichier.Size > PhotoMaxOctets {
		return utils.Erreur(c, fiber.StatusRequestEntityTooLarge, "image trop lourde (3 Mo maximum)")
	}
	ext := strings.ToLower(filepath.Ext(fichier.Filename))
	if !utils.ExtensionsImages[ext] {
		return utils.Erreur(c, fiber.StatusBadRequest, "format d'image non autorisé (jpg, png, webp ou heic)")
	}
	// L'extension ne prouve rien : on regarde le contenu réel avant d'écrire sur le disque.
	if err := utils.ContenuAutorise(fichier, "capture_ecran"); err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "ce fichier n'est pas une image")
	}

	u, err := auth.TrouverUtilisateur(userID)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "compte introuvable")
	}
	ancienne := u.PhotoProfil

	// Le dossier porte l'identifiant du joueur, le fichier un UUID : aucun nom fourni
	// par le client ne touche le disque.
	chemin, _, err := utils.SauvegarderPreuve(config.Cfg.StockagePhotosDir, userID.String(), "", fichier)
	if err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "enregistrement de l'image impossible")
	}

	if err := config.DB.Model(&auth.Utilisateur{}).Where("id = ?", userID).
		Update("photo_profil", chemin).Error; err != nil {
		_ = os.Remove(filepath.Join(config.Cfg.StockagePhotosDir, filepath.FromSlash(chemin)))
		return utils.Erreur(c, fiber.StatusInternalServerError, "enregistrement impossible")
	}
	supprimerFichierPhoto(ancienne)

	administration.Journaliser(config.DB, administration.ParamsAudit{
		UtilisateurID: &userID, Action: "utilisateur:photo", TableCible: "utilisateurs",
		IdentifiantCible: &userID,
	})

	u.PhotoProfil = chemin
	return utils.OK(c, u)
}

// SupprimerPhoto godoc
// @Summary Retirer sa photo de profil
// @Tags utilisateurs
// @Security BearerAuth
// @Success 200 {object} auth.Utilisateur
// @Router /utilisateurs/moi/photo [delete]
func SupprimerPhoto(c fiber.Ctx) error {
	userID := auth.UtilisateurIDDe(c)
	u, err := auth.TrouverUtilisateur(userID)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "compte introuvable")
	}
	ancienne := u.PhotoProfil
	if err := config.DB.Model(&auth.Utilisateur{}).Where("id = ?", userID).
		Update("photo_profil", "").Error; err != nil {
		return utils.Erreur(c, fiber.StatusInternalServerError, "suppression impossible")
	}
	supprimerFichierPhoto(ancienne)
	u.PhotoProfil = ""
	return utils.OK(c, u)
}

// Photo godoc
// @Summary Photo de profil d'un joueur
// @Description Route protégée : les photos ne sont jamais servies depuis un dossier statique ouvert.
// @Tags utilisateurs
// @Security BearerAuth
// @Success 200 {file} binary
// @Failure 404 {object} map[string]any
// @Router /utilisateurs/{id}/photo [get]
func Photo(c fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return utils.Erreur(c, fiber.StatusBadRequest, "identifiant invalide")
	}
	u, err := auth.TrouverUtilisateur(id)
	if err != nil || u.PhotoProfil == "" {
		return utils.Erreur(c, fiber.StatusNotFound, "aucune photo")
	}
	chemin, err := utils.CheminPreuveSous(config.Cfg.StockagePhotosDir, u.PhotoProfil)
	if err != nil {
		return utils.Erreur(c, fiber.StatusNotFound, "aucune photo")
	}
	// Même précaution que pour les preuves : le contenu vient d'un téléversement, il ne
	// doit jamais être interprété comme autre chose qu'une image.
	c.Set("Content-Disposition", "inline; filename=\""+id.String()+filepath.Ext(u.PhotoProfil)+"\"")
	return c.SendFile(chemin)
}

// supprimerFichierPhoto efface l'ancien fichier après un remplacement ou un retrait.
// Une erreur ici n'a pas à faire échouer la requête : la base fait foi, le fichier
// orphelin ne gêne personne.
func supprimerFichierPhoto(cheminRelatif string) {
	if cheminRelatif == "" {
		return
	}
	if chemin, err := utils.CheminPreuveSous(config.Cfg.StockagePhotosDir, cheminRelatif); err == nil {
		_ = os.Remove(chemin)
	}
}
