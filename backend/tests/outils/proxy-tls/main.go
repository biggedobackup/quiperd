// Outil de recette : passerelle HTTPS à certificat AUTO-SIGNÉ placée devant l'API.
//
// Elle sert à prouver une chose qu'aucun appel en HTTP en clair ne peut prouver : que
// l'application mobile joint bien un serveur interne dont le certificat n'est signé par
// aucune autorité connue de l'appareil. C'est la situation de tous les serveurs internes
// de QUI PERD (poste de développement, machine de recette, API derrière un reverse proxy
// maison), et sans le mode permissif de `mobile/lib/noyau/reseau.dart`, Dart coupe la
// poignée de main (`CERTIFICATE_VERIFY_FAILED`) et l'application paraît hors ligne.
//
// Le certificat est fabriqué à CHAQUE démarrage, en mémoire, et n'est écrit nulle part :
// il ne peut donc pas finir par erreur dans une configuration de production. Ses noms
// couvrent l'émulateur (10.0.2.2), la machine locale et, si elle est trouvée, l'adresse
// de la machine sur le réseau local — pour un vrai téléphone.
//
// La passerelle relaie aussi bien le REST que le socket temps réel : `httputil.ReverseProxy`
// suit les montées en gamme `Upgrade: websocket`, donc `wss://` traverse jusqu'à l'API.
//
// Usage, depuis le dossier backend (l'API doit tourner en parallèle) :
//
//	go run ./tests/outils/proxy-tls -port 8443 -cible http://127.0.0.1:8080
//
//	# puis, côté application mobile :
//	flutter build apk --release --dart-define=API_BASE_URL=https://10.0.2.2:8443/api
//
// Réservé aux recettes : il n'est référencé par aucun binaire de production.
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"
)

func main() {
	port := flag.Int("port", 8443, "port d'écoute HTTPS")
	cible := flag.String("cible", "http://127.0.0.1:8080", "API à relayer, en HTTP en clair")
	flag.Parse()

	amont, err := url.Parse(*cible)
	if err != nil {
		log.Fatalf("cible illisible : %v", err)
	}

	certificat, empreinte, noms, err := fabriquerCertificat()
	if err != nil {
		log.Fatalf("certificat : %v", err)
	}

	relais := httputil.NewSingleHostReverseProxy(amont)
	directeurInitial := relais.Director
	relais.Director = func(r *http.Request) {
		directeurInitial(r)
		// L'API doit savoir que le client, lui, a parlé en TLS : c'est ce qui
		// distingue un cookie « secure » posé à bon escient d'un cookie perdu.
		r.Header.Set("X-Forwarded-Proto", "https")
	}
	relais.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		log.Printf("relais en échec : %v", err)
		http.Error(w, "API injoignable", http.StatusBadGateway)
	}

	serveur := &http.Server{
		Addr:      fmt.Sprintf(":%d", *port),
		Handler:   relais,
		TLSConfig: &tls.Config{Certificates: []tls.Certificate{certificat}, MinVersion: tls.VersionTLS12},
	}

	log.Printf("passerelle HTTPS auto-signée sur :%d → %s", *port, amont)
	log.Printf("noms du certificat : %v", noms)
	log.Printf("empreinte SHA-256 : %s", empreinte)
	log.Printf("aucune autorité ne le signe : un client strict DOIT le refuser")
	if err := serveur.ListenAndServeTLS("", ""); err != nil {
		log.Fatalf("écoute : %v", err)
	}
}

// fabriquerCertificat produit un certificat auto-signé valable une journée, couvrant
// l'alias de l'hôte vu depuis l'émulateur Android, la machine locale et l'adresse de
// la machine sur le réseau local.
func fabriquerCertificat() (tls.Certificate, string, []string, error) {
	cle, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, "", nil, err
	}

	adresses := []net.IP{net.IPv4(10, 0, 2, 2), net.IPv4(127, 0, 0, 1), net.IPv6loopback}
	if locale := adresseLocale(); locale != nil {
		adresses = append(adresses, locale)
	}

	serie, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, "", nil, err
	}

	modele := x509.Certificate{
		SerialNumber:          serie,
		Subject:               pkix.Name{CommonName: "quiperd-recette", Organization: []string{"QUI PERD (recette)"}},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
		DNSNames:              []string{"localhost", "quiperd-recette"},
		IPAddresses:           adresses,
	}

	brut, err := x509.CreateCertificate(rand.Reader, &modele, &modele, &cle.PublicKey, cle)
	if err != nil {
		return tls.Certificate{}, "", nil, err
	}

	somme := sha256.Sum256(brut)
	noms := append([]string{}, modele.DNSNames...)
	for _, ip := range adresses {
		noms = append(noms, ip.String())
	}

	return tls.Certificate{Certificate: [][]byte{brut}, PrivateKey: cle},
		hex.EncodeToString(somme[:]), noms, nil
}

// adresseLocale renvoie la première adresse IPv4 de la machine sur le réseau local,
// pour qu'un vrai téléphone (et pas seulement l'émulateur) puisse joindre la passerelle.
func adresseLocale() net.IP {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	for _, i := range interfaces {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 {
			continue
		}
		adresses, err := i.Addrs()
		if err != nil {
			continue
		}
		for _, a := range adresses {
			reseau, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			if v4 := reseau.IP.To4(); v4 != nil {
				return v4
			}
		}
	}
	return nil
}
