package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// ExtensionsImages et ExtensionsVideos limitent les formats de preuve acceptés.
var ExtensionsImages = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".heic": true}
var ExtensionsVideos = map[string]bool{".mp4": true, ".mov": true, ".webm": true, ".mkv": true}

// TypeAutorise vérifie que l'extension correspond au type de preuve annoncé.
func TypeAutorise(typePreuve, ext string) bool {
	ext = strings.ToLower(ext)
	switch typePreuve {
	case "capture_ecran":
		return ExtensionsImages[ext]
	case "video":
		return ExtensionsVideos[ext]
	default:
		return false
	}
}

// ContenuAutorise lit les premiers octets du fichier téléversé et vérifie que son
// contenu RÉEL correspond au type annoncé.
//
// L'extension ne prouve rien : n'importe quel fichier peut être nommé `.png`. Un
// document HTML stocké sous ce nom puis servi par la route des preuves serait, sur
// un navigateur qui devine le type, une faille de script inter-site sur notre
// propre domaine. `X-Content-Type-Options: nosniff` ferme déjà cette porte, mais
// une preuve qui n'est pas une image n'a de toute façon rien à faire là.
//
// `http.DetectContentType` reconnaît les signatures usuelles (PNG, JPEG, WEBP,
// GIF, MP4, WEBM…). Deux formats fréquents sur téléphone lui échappent — HEIC
// d'iPhone et QuickTime .mov — et sont reconnus par leur boîte ISO-BMFF `ftyp`.
func ContenuAutorise(fichier *multipart.FileHeader, typePreuve string) error {
	src, err := fichier.Open()
	if err != nil {
		return fmt.Errorf("ouverture upload: %w", err)
	}
	defer src.Close()

	entete := make([]byte, 512)
	n, err := io.ReadFull(src, entete)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return fmt.Errorf("lecture upload: %w", err)
	}
	entete = entete[:n]

	detecte := http.DetectContentType(entete)
	switch typePreuve {
	case "capture_ecran":
		if strings.HasPrefix(detecte, "image/") || estISOBMFF(entete) {
			return nil
		}
	case "video":
		if strings.HasPrefix(detecte, "video/") || estISOBMFF(entete) {
			return nil
		}
	}
	return fmt.Errorf("contenu du fichier incompatible avec le type annoncé (%s)", detecte)
}

// estISOBMFF reconnaît un conteneur ISO base media (MP4, MOV, HEIC, AVIF) à sa
// boîte `ftyp`, que `http.DetectContentType` ne couvre que partiellement.
func estISOBMFF(entete []byte) bool {
	return len(entete) >= 12 && string(entete[4:8]) == "ftyp"
}

// CheminPreuveSous résout le chemin absolu d'une preuve et REFUSE tout chemin qui
// sortirait du dossier de stockage.
//
// Le chemin vient de la base et n'est aujourd'hui écrit que par nous, mais une
// ligne trafiquée ou une future importation ne doit jamais permettre de servir
// `/etc/passwd` : la garde coûte deux lignes et vaut pour toujours.
func CheminPreuveSous(baseDir, cheminRelatif string) (string, error) {
	base, err := filepath.Abs(baseDir)
	if err != nil {
		return "", err
	}
	cible, err := filepath.Abs(filepath.Join(base, filepath.FromSlash(cheminRelatif)))
	if err != nil {
		return "", err
	}
	if cible != base && !strings.HasPrefix(cible, base+string(os.PathSeparator)) {
		return "", fmt.Errorf("chemin hors du dossier de stockage")
	}
	return cible, nil
}

// SauvegarderPreuve écrit un fichier de preuve sur le disque local dans
// <baseDir>/<matchID>/<utilisateurID>/<uuid>.<ext>, en calculant son empreinte SHA-256.
// Renvoie le chemin relatif (stocké en base) et l'empreinte hex.
func SauvegarderPreuve(baseDir, matchID, utilisateurID string, fichier *multipart.FileHeader) (cheminRelatif, empreinte string, err error) {
	ext := strings.ToLower(filepath.Ext(fichier.Filename))
	if ext == "" {
		return "", "", fmt.Errorf("fichier sans extension")
	}

	dossier := filepath.Join(baseDir, matchID, utilisateurID)
	if err := os.MkdirAll(dossier, 0o750); err != nil {
		return "", "", fmt.Errorf("création dossier: %w", err)
	}

	nom := uuid.NewString() + ext
	chemin := filepath.Join(dossier, nom)

	src, err := fichier.Open()
	if err != nil {
		return "", "", fmt.Errorf("ouverture upload: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(chemin)
	if err != nil {
		return "", "", fmt.Errorf("création fichier: %w", err)
	}
	defer dst.Close()

	hasher := sha256.New()
	if _, err := io.Copy(io.MultiWriter(dst, hasher), src); err != nil {
		return "", "", fmt.Errorf("écriture fichier: %w", err)
	}

	// Chemin relatif normalisé (séparateur /) pour la portabilité et l'URL.
	rel, err := filepath.Rel(baseDir, chemin)
	if err != nil {
		rel = filepath.Join(matchID, utilisateurID, nom)
	}
	return filepath.ToSlash(rel), hex.EncodeToString(hasher.Sum(nil)), nil
}

// CheminAbsoluPreuve reconstruit le chemin disque à partir du chemin relatif stocké.
func CheminAbsoluPreuve(baseDir, cheminRelatif string) string {
	return filepath.Join(baseDir, filepath.FromSlash(cheminRelatif))
}
