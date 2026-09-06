package utils

import (
	"math"
	"strconv"

	"github.com/gofiber/fiber/v3"
)

const (
	// TaillePageDefaut : 10 éléments par page sur toutes les listes paginées (charte API).
	TaillePageDefaut = 10
	TaillePageMax    = 100
)

// Page est l'enveloppe commune des listes paginées : `GET …?page=1&taille=10` →
// `{ "elements": [...], "total": 42, "page": 1, "taille": 10, "pages": 5 }`.
type Page[T any] struct {
	Elements []T   `json:"elements"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	Taille   int   `json:"taille"`
	Pages    int   `json:"pages"`
}

// Pagination lit `?page` (≥ 1, défaut 1) et `?taille` (1..100, défaut 10) et renvoie l'offset SQL.
func Pagination(c fiber.Ctx) (page, taille, offset int) {
	page, _ = strconv.Atoi(c.Query("page", "1"))
	if page < 1 {
		page = 1
	}
	taille, _ = strconv.Atoi(c.Query("taille", strconv.Itoa(TaillePageDefaut)))
	if taille < 1 {
		taille = TaillePageDefaut
	}
	if taille > TaillePageMax {
		taille = TaillePageMax
	}
	return page, taille, (page - 1) * taille
}

// NouvellePage construit l'enveloppe ; `Elements` n'est jamais nul (`[]` en JSON, jamais `null`).
func NouvellePage[T any](elements []T, total int64, page, taille int) Page[T] {
	if elements == nil {
		elements = []T{}
	}
	pages := 0
	if total > 0 {
		pages = int(math.Ceil(float64(total) / float64(taille)))
	}
	return Page[T]{Elements: elements, Total: total, Page: page, Taille: taille, Pages: pages}
}
