package administration

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"defisenligne/backend/config"
	"defisenligne/backend/tempsreel"
)

// CleCacheStats est la clé Redis du cache des statistiques du tableau de bord, partagée entre
// le contrôleur (qui la lit) et le rafraîchissement temps réel (qui la remplace).
const CleCacheStats = "cache:stats:admin"

// evenementsKpi liste les événements du flux temps réel qui déplacent réellement un compteur du
// tableau de bord. Tout le reste (score proposé, présence, chrono, compteur de joueurs en ligne…)
// est ignoré : inutile de relancer dix agrégats SQL parce qu'un joueur a ouvert un onglet.
var evenementsKpi = map[string]bool{
	tempsreel.EvtDefiCree:          true, // défis ouverts +1
	tempsreel.EvtDefiRejoint:       true, // défis ouverts −1, matchs en cours +1
	tempsreel.EvtDefiAnnule:        true,
	tempsreel.EvtDefiExpire:        true,
	tempsreel.EvtMatchTermine:      true, // matchs terminés, volume, commissions
	tempsreel.EvtMatchDesaccord:    true,
	tempsreel.EvtMatchNul:          true,
	tempsreel.EvtMatchLitigeOuvert: true, // litiges ouverts +1
	tempsreel.EvtMatchLitigeResolu: true, // litiges ouverts −1
	tempsreel.EvtPaiementStatut:    true, // dépôts et retraits réussis
}

const (
	// Intervalle minimal entre deux recalculs : le tableau de bord agrège dix requêtes, il ne
	// doit pas les rejouer à chaque défi créé lors d'un pic d'activité.
	intervalleKpi = 3 * time.Second
	// Au-delà de cette durée, le recalcul est abandonné : mieux vaut un tableau de bord en
	// retard qu'une connexion à la base retenue par un compteur d'affichage.
	delaiMaxKpi = 10 * time.Second
)

var (
	kpiMu        sync.Mutex
	kpiPlanifie  bool
	kpiDernier   time.Time
	kpiPrecedent string
)

// KpiSiConcerne est branché sur tempsreel.SurEvenement au démarrage : il déclenche un
// rafraîchissement seulement pour les événements qui font bouger un compteur.
func KpiSiConcerne(evenement string) {
	if evenementsKpi[evenement] {
		RafraichirKpi()
	}
}

// RafraichirKpi recalcule les compteurs du tableau de bord, remplace le cache Redis et pousse
// `admin.kpi` aux administrateurs connectés. Non bloquante et débattue : les appels rapprochés
// sont fusionnés en un seul recalcul, exécuté au plus une fois toutes les `intervalleKpi`.
// Le dernier appel d'une rafale est toujours honoré (débat « traînant »), donc le tableau de
// bord finit toujours par refléter l'état réel.
func RafraichirKpi() {
	kpiMu.Lock()
	defer kpiMu.Unlock()
	if kpiPlanifie {
		return // un recalcul est déjà programmé, il prendra en compte ce changement
	}
	attente := intervalleKpi - time.Since(kpiDernier)
	if attente < 0 {
		attente = 0
	}
	kpiPlanifie = true
	time.AfterFunc(attente, func() {
		kpiMu.Lock()
		kpiPlanifie = false
		kpiDernier = time.Now()
		kpiMu.Unlock()
		publierKpi()
	})
}

// publierKpi fait le travail réel. Les compteurs sont envoyés en VALEURS ABSOLUES : le client
// les fusionne champ par champ, ce qui corrige au passage toute dérive d'un compteur qu'il
// aurait incrémenté localement.
func publierKpi() {
	if config.DB == nil {
		return
	}
	ctx, annuler := context.WithTimeout(context.Background(), delaiMaxKpi)
	defer annuler()

	stats := calculerStatistiques(config.DB.WithContext(ctx))
	data, err := json.Marshal(stats)
	if err != nil {
		return
	}
	// Le cache est remplacé, pas invalidé : un administrateur qui arrive juste après lit
	// immédiatement les valeurs fraîches au lieu de payer le recalcul.
	if config.Redis != nil {
		config.Redis.Set(ctx, CleCacheStats, data, 60*time.Second)
	}
	// Aucun message si rien n'a bougé : deux défis créés puis annulés dans la même fenêtre de
	// débat ramènent les compteurs à l'identique. La comparaison est faite sous verrou — deux
	// recalculs peuvent se chevaucher si une rafale reprogramme aussitôt après le déblocage.
	kpiMu.Lock()
	identique := string(data) == kpiPrecedent
	if !identique {
		kpiPrecedent = string(data)
	}
	kpiMu.Unlock()
	if identique {
		return
	}
	tempsreel.Publier(tempsreel.EvtAdminKpi, stats, tempsreel.SalonAdmin)
}
