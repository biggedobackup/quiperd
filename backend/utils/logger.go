package utils

import (
	"go.uber.org/zap"
)

// Log est le logger structuré global.
var Log *zap.Logger

// InitLogger initialise le logger (production ou développement).
func InitLogger(production bool) {
	var err error
	if production {
		Log, err = zap.NewProduction()
	} else {
		Log, err = zap.NewDevelopment()
	}
	if err != nil {
		panic("init logger: " + err.Error())
	}
}

// Sync vide les buffers du logger (à différer dans main).
func Sync() {
	if Log != nil {
		_ = Log.Sync()
	}
}
