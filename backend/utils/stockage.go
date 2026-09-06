package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
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
