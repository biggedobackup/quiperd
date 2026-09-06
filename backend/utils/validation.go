package utils

import (
	"fmt"
	"strings"

	"github.com/go-playground/validator/v10"
)

var valider = validator.New()

// Valider applique les tags `validate` d'une struct et renvoie une map
// champ -> message d'erreur lisible, ou nil si tout est valide.
func Valider(s any) map[string]string {
	err := valider.Struct(s)
	if err == nil {
		return nil
	}
	details := make(map[string]string)
	var verrs validator.ValidationErrors
	if ok := asValidationErrors(err, &verrs); ok {
		for _, fe := range verrs {
			champ := strings.ToLower(fe.Field()[:1]) + fe.Field()[1:]
			details[champ] = messagePour(fe)
		}
	} else {
		details["_"] = err.Error()
	}
	return details
}

func asValidationErrors(err error, cible *validator.ValidationErrors) bool {
	if verrs, ok := err.(validator.ValidationErrors); ok {
		*cible = verrs
		return true
	}
	return false
}

func messagePour(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "champ obligatoire"
	case "email":
		return "email invalide"
	case "min":
		return fmt.Sprintf("valeur minimale %s", fe.Param())
	case "max":
		return fmt.Sprintf("valeur maximale %s", fe.Param())
	case "gt":
		return fmt.Sprintf("doit être supérieur à %s", fe.Param())
	case "gte":
		return fmt.Sprintf("doit être supérieur ou égal à %s", fe.Param())
	case "oneof":
		return fmt.Sprintf("valeur attendue parmi : %s", fe.Param())
	case "uuid":
		return "identifiant invalide"
	default:
		return "valeur invalide"
	}
}
