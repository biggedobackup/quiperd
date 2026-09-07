# Skill — Audit, Optimisation et Sécurisation de l'Application

## Objectif

Analyser l'ensemble de l'application afin d'identifier les problèmes de **sécurité, performance, configuration et architecture**, puis corriger les problèmes détectés.

L'audit doit couvrir le **Frontend, Backend, Base de données et Serveur Web**.

Ne pas se limiter à détecter les problèmes : **corriger les vulnérabilités lorsque cela est possible**, puis effectuer des tests de validation pour vérifier que les corrections fonctionnent et n'introduisent pas de régression.

---

# 1. Frontend

Vérifier et corriger :

* XSS
* Injection de contenu
* Mauvaise gestion des données utilisateur
* Exposition de secrets ou clés API
* Tokens ou informations sensibles exposés côté client
* Mauvaise gestion des sessions
* Stockage non sécurisé des tokens
* Configuration CORS côté frontend
* CSP : CSP restreinte à default-src 'self'. Aucune exception unsafe-inline ni unsafe-eval : scripts et styles autorisés uniquement via un nonce généré à chaque requête.
frame-ancestors, base-uri et form-action restreints à 'self'. Mécanisme de rapport CSP (`report-uri`/`report-to`) recommandé.

* Protection contre le clickjacking
* Cookies (session, CSRF) : attributs `HttpOnly`, `Secure`, `SameSite` obligatoires
* Dépendances JavaScript vulnérables
* Packages inutilisés ou obsolètes
* Code JavaScript inutile
* Bundle trop volumineux
* Code splitting
* Lazy loading
* Lazy loading des images
* Optimisation des images WebP/AVIF
* Minification JS/CSS
* Tree shaking
* Compression des assets
* Cache navigateur
* Réduction des requêtes HTTP
* Optimisation du frontend et du mobile
* Éviter les calculs et rendus inutiles
* Vérifier les erreurs console
* Vérifier les erreurs réseau
* Vérifier les Core Web Vitals

---

# 2. Backend / API

Vérifier et corriger :

* Authentification
* Autorisation
* RBAC / permissions
* IDOR / accès à des ressources d'un autre utilisateur
* SQL Injection
* XSS côté serveur
* CSRF
* SSRF
* Injection de commandes
* Path Traversal
* Brute Force
* Rate Limiting
* Gestion sécurisée des sessions
* JWT
* Refresh Tokens
* Expiration et révocation des tokens
* Hashage sécurisé des mots de passe avec Argon2id/bcrypt
* Validation stricte des entrées
* Sanitization
* Validation des paramètres API
* Validation des fichiers uploadés
* Limitation de taille des requêtes
* Gestion sécurisée des erreurs
* Ne jamais exposer les stack traces en production
* Ne jamais exposer les secrets
* Variables d'environnement
* CORS strict
* Headers de sécurité
* Gestion des permissions côté serveur
* Protection des endpoints sensibles
* Protection des endpoints d'administration
* Protection contre les abus d'API
* Vérification des dépendances vulnérables
* Gestion correcte des timeouts
* Gestion des tâches longues avec workers/queues

### Performance Backend

* Redis / cache applicatif
* Cache des requêtes fréquentes
* Cache des données peu changeantes
* Invalidation correcte du cache
* Compression Gzip/Brotli
* Réduction de la taille des réponses JSON
* Pagination
* Filtrage côté serveur
* Éviter les requêtes N+1
* Optimiser les requêtes SQL
* Connection Pooling
* Background Workers
* Queues pour les traitements lourds
* Monitoring des temps de réponse API

### Montée en charge (WebSocket et défis simultanés)

Outillage du dépôt : `backend/tests/charge.ps1` (pilote) + `backend/tests/outils/charge` (moteur Go,
client pur). Deux cibles : `-Cible local` démarre une instance dédiée et mesure ce que le code
encaisse ; `-Cible production` n'ouvre que des sockets « visiteur » et n'écrit rien.

À vérifier à chaque campagne :

* **Ne jamais laisser une goroutine écrire sur un socket après le retour du gestionnaire
  d'upgrade.** fasthttp recycle la connexion détournée dès que le gestionnaire rend la main : il
  remet le `hijackConn` au pool et met à nil le `net.Conn` enveloppé. Une écriture retardataire
  (trame de fermeture, ping) déréférence alors un pointeur nul, et **une panique dans une goroutine
  n'est rattrapée par aucun `recover` de Fiber : tout le processus tombe, API comprise**. Le
  gestionnaire doit donc ATTENDRE la fin de la pompe d'écriture avant de rendre la main (cf.
  `tempsreel.servir` et le test `TestFermetureBrutaleMassive`). La course est invisible à quelques
  sockets et quasi certaine quand des milliers de joueurs se déconnectent ensemble.
* Mesurer la **diffusion**, pas seulement le nombre de connexions : à N sockets abonnés, quel
  pourcentage reçoit l'événement et en combien de temps (p50/p95/p99). Un socket ouvert qui ne reçoit
  rien ne vaut rien.
* Vérifier que les connexions **survivent au repos** : le ping serveur de 30 s doit garder vivante
  une connexion inactive derrière le proxy (Cloudflare coupe à 100 s sans trafic).
* Sur les écritures concurrentes, tester la **ruée** : N joueurs sur le MÊME défi doivent produire
  exactement un 201 et N−1 refus 409. Contrôler ensuite en base qu'aucun solde n'est négatif,
  qu'aucune mise n'est enregistrée deux fois et que `solde_bloque` égale la somme des mises bloquées.
* Toute mesure d'écriture doit respecter les **bornes de `configurations_financieres`** : une mise
  sous `mise_minimale` fait répondre 400 à toutes les créations et la campagne ne mesure plus que le
  rejet de validation. Lire la valeur en base, ne pas la coder en dur.
* Un palier où **100 % des opérations échouent doit être signalé comme anomalie**, jamais rapporté
  comme « aucune anomalie » parce qu'aucune assertion métier n'a été violée.

---

# 3. Base de données

Vérifier et corriger :

* SQL Injection
* Permissions des utilisateurs DB
* Utilisation d'un compte DB dédié
* Exposition de la base de données sur Internet
* Mots de passe et credentials
* Connexions sécurisées
* Requêtes SQL lentes
* Index manquants
* Index inutiles
* Index composites nécessaires
* Requêtes N+1
* `SELECT *` inutile
* JOIN coûteux
* Pagination
* Transactions
* Connection Pooling
* Contraintes d'intégrité
* Foreign Keys
* Unicité des données
* Données sensibles stockées inutilement
* Chiffrement des données sensibles si nécessaire
* Logs et audit des accès
* Backups automatiques
* Backups sécurisés
* Tests de restauration
* Politique de rétention des backups

---

# 4. Serveur Web / Nginx / Apache / Caddy  

Vérifier et corriger :

### HTTPS / TLS

* HTTPS obligatoire
* TLS 1.2 / TLS 1.3
* Désactivation TLS 1.0 / TLS 1.1
* Suites cryptographiques modernes
* Certificats valides
* HSTS
* Redirection HTTP → HTTPS

### Headers de sécurité

* `Strict-Transport-Security`
* `Content-Security-Policy`
* `X-Frame-Options`
* `X-Content-Type-Options`
* `Referrer-Policy`
* `Permissions-Policy`
* `Cache-Control`
* Suppression de `Server`
* Suppression de `X-Powered-By`

### Configuration

* Protection contre Host Header Injection
* `default_server` sécurisé
* Rejet des Host inconnus
* Protection des fichiers `.env`
* Protection du dossier `.git`
* Désactivation du directory listing
* Protection des fichiers de configuration
* Limitation des uploads
* Rate Limiting
* Timeouts
* Keep-Alive
* Reverse Proxy sécurisé
* Proxy Headers correctement configurés
* Logs
* Rotation des logs

### Performance

* Gzip
* Brotli
* HTTP/2
* HTTP/3 si disponible
* Cache des fichiers statiques
* `Cache-Control`
* `ETag`
* Compression des assets
* Sendfile
* Optimisation des workers
* Optimisation des connexions
* Proxy buffering
* CDN lorsque pertinent

---

# 5. Méthode d'audit obligatoire

L'agent doit suivre cette procédure :

### Étape 1 — Analyse

* Analyser l'architecture du projet
* Identifier le frontend
* Identifier le backend
* Identifier la base de données
* Identifier le serveur web
* Identifier les services utilisés
* Examiner les configurations
* Examiner les dépendances
* Examiner les permissions

### Étape 2 — Audit

Pour chaque problème trouvé :

* Identifier le problème
* Déterminer son niveau : Critique / Élevé / Moyen / Faible
* Identifier la cause
* Identifier le fichier concerné
* Identifier la correction nécessaire

### Étape 3 — Correction

* Corriger les failles critiques en priorité
* Corriger ensuite les failles élevées
* Corriger les problèmes moyens
* Corriger les optimisations de performance
* Ne jamais désactiver une protection simplement pour faire disparaître une erreur
* Préserver les fonctionnalités existantes

### Étape 4 — Validation

Après chaque correction :

* Vérifier la syntaxe
* Vérifier la configuration
* Vérifier les logs
* Tester les endpoints concernés
* Tester l'authentification
* Tester les permissions
* Tester les fonctionnalités principales
* Tester le frontend
* Tester les uploads
* Tester les performances
* Vérifier les erreurs HTTP
* Vérifier les erreurs JavaScript
* Effectuer les tests de sécurité nécessaires

### Étape 5 — Rapport final

Produire un rapport contenant :

* Problèmes détectés
* Niveau de criticité
* Fichiers concernés
* Corrections effectuées
* Tests réalisés
* Problèmes restant à traiter
* Recommandations supplémentaires

Le résultat final doit être un système **plus sécurisé, plus performant et stable en production**, sans régression fonctionnelle.
