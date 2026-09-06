package tempsreel

import (
	"encoding/json"
	"sync"
	"testing"

	"github.com/google/uuid"
)

// Tests unitaires du hub : ni Redis ni PostgreSQL requis. Ils gardent les
// invariants qui font tenir le socle — pas de fuite de salon, un client lent
// fermé au lieu de bloquer les autres, une autorisation refaite à chaque
// abonnement, aucun doublon quand plusieurs salons visent la même connexion.
func TestRegistreConcurrent(t *testing.T) {
	const nbConnexions = 50
	conns := make([]*Connexion, nbConnexions)
	var wg sync.WaitGroup
	for i := 0; i < nbConnexions; i++ {
		c := nouvelleConnexion(uuid.New(), RoleJoueur, "127.0.0.1")
		conns[i] = c
		hub.enregistrer(c)
		wg.Add(1)
		go func(c *Connexion) {
			defer wg.Done()
			for j := 0; j < 200; j++ {
				hub.abonner(c, SalonDefisPublics)
				hub.abonner(c, SalonUtilisateur(c.UtilisateurID))
				hub.desabonner(c, SalonDefisPublics)
			}
			hub.abonner(c, SalonDefisPublics)
		}(c)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for j := 0; j < 300; j++ {
			hub.diffuserLocal(Enveloppe{Evenement: EvtDefiCree, Horodatage: horodatage()},
				[]string{SalonDefisPublics}, "")
		}
	}()
	wg.Wait()

	if got := hub.nombreConnexions(); got != nbConnexions {
		t.Fatalf("connexions = %d, attendu %d", got, nbConnexions)
	}
	for _, c := range conns {
		hub.retirer(c)
	}
	if got := hub.nombreConnexions(); got != 0 {
		t.Fatalf("connexions après retrait = %d, attendu 0", got)
	}
	hub.mu.RLock()
	restants := len(hub.salons)
	hub.mu.RUnlock()
	if restants != 0 {
		t.Fatalf("salons résiduels = %d, attendu 0", restants)
	}
}

func TestClientLentFerme(t *testing.T) {
	c := nouvelleConnexion(uuid.New(), RoleJoueur, "127.0.0.1")
	hub.enregistrer(c)
	hub.abonner(c, SalonDefisPublics)
	defer hub.retirer(c)

	for i := 0; i < tailleTamponEnvoi+10; i++ {
		hub.diffuserLocal(Enveloppe{Evenement: EvtDefiCree, Horodatage: horodatage()},
			[]string{SalonDefisPublics}, "")
	}
	select {
	case <-c.ferme:
	default:
		t.Fatal("le client lent aurait dû être fermé")
	}
}

func TestAutorisationSalons(t *testing.T) {
	moi := uuid.New()
	autre := uuid.New()
	cas := []struct {
		salon  string
		role   string
		id     uuid.UUID
		attend bool
	}{
		{SalonDefisPublics, RoleVisiteur, uuid.Nil, true},
		{SalonAdmin, RoleVisiteur, uuid.Nil, false},
		{SalonAdmin, RoleJoueur, moi, false},
		{SalonAdmin, RoleAdmin, moi, true},
		{SalonUtilisateur(moi), RoleJoueur, moi, true},
		{SalonUtilisateur(autre), RoleJoueur, moi, false},
		{SalonUtilisateur(autre), RoleAdmin, moi, false},
		{SalonUtilisateur(moi), RoleVisiteur, uuid.Nil, false},
		{"salon:invente", RoleAdmin, moi, false},
		{SalonMatch(uuid.New()), RoleAdmin, moi, true},
		{SalonMatch(uuid.New()), RoleJoueur, moi, false}, // config.DB nil → refus
		{"match:pas-un-uuid", RoleAdmin, moi, false},
	}
	for _, k := range cas {
		if got := autoriserSalon(k.id, k.role, k.salon); got != k.attend {
			t.Fatalf("autoriserSalon(%s, %s) = %v, attendu %v", k.salon, k.role, got, k.attend)
		}
	}
}

func TestEnveloppeEstampilleeParSalon(t *testing.T) {
	moi := uuid.New()
	c := nouvelleConnexion(moi, RoleJoueur, "127.0.0.1")
	hub.enregistrer(c)
	defer hub.retirer(c)
	hub.abonner(c, SalonDefisPublics)
	hub.abonner(c, SalonUtilisateur(moi))

	// Deux salons visés, un seul message reçu (pas de doublon).
	hub.diffuserLocal(Enveloppe{Evenement: EvtDefiCree, Horodatage: horodatage()},
		[]string{SalonDefisPublics, SalonUtilisateur(moi)}, "")

	select {
	case brut := <-c.envoi:
		var env Enveloppe
		if err := json.Unmarshal(brut, &env); err != nil {
			t.Fatal(err)
		}
		if env.Salon == "" {
			t.Fatal("le salon doit être estampillé sur l'enveloppe")
		}
	default:
		t.Fatal("aucun message reçu")
	}
	select {
	case <-c.envoi:
		t.Fatal("doublon : la connexion a reçu l'événement deux fois")
	default:
	}
}

func TestTamponNeDiffuseQuUneFois(t *testing.T) {
	tampon := NouveauTampon()
	tampon.Ajouter(EvtDefiCree, map[string]any{"a": 1}, SalonDefisPublics)
	tampon.Ajouter(EvtDefiAnnule, map[string]any{"a": 2}, SalonDefisPublics)
	tampon.Diffuser()
	tampon.Diffuser() // second appel : ne doit rien rediffuser

	tampon.mu.Lock()
	restants := len(tampon.messages)
	tampon.mu.Unlock()
	if restants != 0 {
		t.Fatalf("tampon non vidé : %d messages restants", restants)
	}

	// Abandonner après ajout : rien ne part.
	autre := NouveauTampon()
	autre.Ajouter(EvtDefiCree, nil, SalonDefisPublics)
	autre.Abandonner()
	autre.Diffuser()

	// Tampon nul et publication sans salon : ne doivent ni paniquer ni diffuser.
	var nul *Tampon
	nul.Ajouter(EvtDefiCree, nil, SalonDefisPublics)
	nul.Diffuser()
	nul.Abandonner()
	Publier(EvtDefiCree, nil)
	Publier("", nil, SalonDefisPublics)
}
