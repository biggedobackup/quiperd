# Création du backend de la plateforme QUI PERD

Je souhaite que vous créiez le backend complet de **QUI PERD** en utilisant la compétence
définie dans ce fichier.

**QUI PERD** connecte des gamers du monde entier : un joueur crée un **défi** de match (jeu,
plateforme, mise en argent), un autre joueur le **rejoint**, les deux s'affrontent en réel sur
le jeu choisi dans le **catalogue** (ouvert à tous les jeux compétitifs : le seed installe les
**50 jeux les plus joués**, chacun rangé dans une **catégorie** — sport, combat, course, tir,
stratégie, cartes, arcade — et **9 plateformes** réparties en trois **familles** : PC, console
(PlayStation 5/4, Xbox Series X|S/One, Nintendo Switch 2/Switch), mobile (Android, iOS)),
déclarent le résultat, fournissent une preuve (capture + vidéo), et **celui qui perd le match
perd sa mise** — le gagnant récupère les deux mises moins la commission de la plateforme. Aucun
client (web, mobile) ne cite un jeu en dur : le catalogue vient de `GET /api/jeux`, les
catégories et familles sont des valeurs de la charte API (§7, tables 2 et 3).

> Ce fichier est la **source de vérité** du modèle de données et de la charte API. Les
> compétences `demarrage-mobile.md` (app Flutter) et `demarrage-web.md` (site public, accès
> joueur web et tableau admin, sous TanStack Start) s'appuient sur ce document et ne
> redéfinissent jamais eux-mêmes un champ, une route ou une table — ils y renvoient.

## Équipe d'agents

Vous mettrez en place une équipe d'agents composée de :

- **Un chef d'équipe** : chargé de déléguer les tâches aux sous-agents
- **Des agents de développement** : dédiés au codage des modules Go
- **Des agents de vérification** : chargés de la validation du code (compilation, `go vet`)
- **Des agents de test** : responsables des tests fonctionnels des routes (requêtes HTTP
  réelles)

## Processus de développement

- Chaque module et chaque route devront être **testés et approuvés** via des requêtes HTTP
  réelles.
- Le **moteur de mise/escrow** (voir §5) fait l'objet d'une attention particulière : tout
  changement dans `mises/`, `portefeuilles/` ou `matchs/` est testé avec des scénarios
  concurrents (deux requêtes simultanées) avant d'être considéré comme validé.
- **Vérification = tout le module** : `go build ./...` **et** `go vet ./...` doivent passer
  (paquet `docs/` inclus). Un `go build .` qui réussit ne prouve rien : le paquet `docs/`
  généré par `swag` ne compile pas si `swaggo/swag` n'est pas dans `go.mod`.
- **Recettes obligatoires** — les deux passent à **100 %** avant de déclarer le backend terminé :
  - `backend/tests/parcours-api.ps1` (parcours HTTP complet, ~520 vérifications en 20 sections :
    auth, CRUD de chaque module, escrow, **machine à états du match** — accord immédiat,
    confirmation, désaccord → `preuve_requise` → litige, nul avec rejeu/partage et manches, les
    trois échéances tranchées par le worker —, preuves, litiges, retraits, webhooks,
    administration, contact, scénarios concurrents et invariants comptables en base) ;
  - `backend/tests/parcours-temps-reel.ps1` (recette WebSocket : ticket à usage unique, salons
    et cloisonnement, événements reçus dans l'ordre, reconnexion, compteur en ligne, diffusion
    depuis le worker via Redis Pub/Sub).

  Toute nouvelle route y ajoute ses cas (succès + 400/401/403/404/409/422) ; tout nouvel
  événement temps réel ajoute les siens dans la recette WebSocket. Leçon retenue : un backend
  « testé route par route » a livré un moteur de match inutilisable (2ᵉ déclaration toujours en
  erreur SQL, `GET /litiges` en 500) parce que personne n'avait déroulé le parcours complet
  défi → match → règlement.
- **Ne jamais affaiblir un test pour le faire passer.** Un `Check` qui accepte « statut A *ou*
  statut B » pour éviter de trancher ne teste plus rien. Si le code paraît faux, on corrige le
  code (ou on remonte l'écart), jamais l'assertion. Deux pièges d'outillage vérifiés sur cette
  recette : `psql -At` rend un booléen `('...')::text` en `true`/`false` (jamais `t`/`f`), et
  un champ Go marqué `omitempty` est **absent** du JSON, donc testé avec `-not $x` ou
  `$null -eq $x`, pas avec une comparaison à `''`.
- Client de test sous Windows : cibler `http://127.0.0.1:8080`, pas `localhost` (résolution
  `::1` tentée d'abord, ~2 s de délai par requête alors que le serveur répond en < 2 ms).
- En cas d'**erreur**, l'agent principal en sera informé.
- L'agent principal **redéléguera** la tâche concernée à l'agent approprié.
- Ce processus sera **répété en boucle** jusqu'à ce que l'intégralité du travail soit
  entièrement terminée et validée.
- Les intégrations de paiement (dépôt/retrait) suivent les compétences dédiées :
  [`../skill de paiement/api_paiement_skill_ligdicash.md`](../skill%20de%20paiement/api_paiement_skill_ligdicash.md)
  et
  [`../skill de paiement/api_paiement_skill_FusionMoney.md`](../skill%20de%20paiement/api_paiement_skill_FusionMoney.md).
- La compétence
  [`../skill de securité/securité et perfomance.md`](../skill%20de%20securité/securité%20et%20perfomance.md)
  s'applique à l'ensemble du backend, de la base de données et du serveur web avant mise en
  production.

# Guide de Développement & Architecture — QUI PERD (Backend)

Document de référence pour le développement du backend de **QUI PERD** avec **Go (Fiber +
GORM + PostgreSQL + Redis + Asynq)**.

> **Règle absolue : la stack ci-dessous est intégralement respectée et intégrée.**
> Aucun composant n'est remplacé par un fallback allégé. Si un composant manque sur le
> poste de développement, il est installé.

---

## 1. Stack Technique & Charte API

### Stack Technique (complète, prête pour la production)

| Catégorie                | Package / Technologie                     | Intégration                                            |
|---------------------------|--------------------------------------------|--------------------------------------------------------|
| Langage                     | Go 1.27.0                                  | ✅                                                       |
| Framework                   | Fiber v3.5.0                               | serveur HTTP, middlewares CORS/recover/logger           |
| Base de données             | PostgreSQL 18                              | base `qui_perd`                                        |
| ORM                         | GORM + driver postgres                     | modèles, AutoMigrate, transactions (essentiel pour l'escrow) |
| Cache / Sessions            | Redis (`redis/go-redis/v9`)                | sessions JWT (liste blanche `jti`), cache classements/statistiques admin |
| Jobs asynchrones            | Asynq (`hibiken/asynq`)                    | worker + planificateur : expiration des défis, **échéances de match** (`match:echeance` : confirmation, preuve, choix après un nul), relance vérification paiement, purge, notifications push |
| Temps réel                  | `fasthttp/websocket` + Redis Pub/Sub       | socket unique `GET /api/temps-reel` multiplexé par salons, ticket Redis à usage unique, diffusion inter-instances sur le canal `qp:temps-reel` (§5 bis) — **aucune autre dépendance WebSocket** |
| Stockage fichiers           | Disque local du serveur                    | dossier `public/preuves/`, stockage des preuves de match (captures + vidéos) via `utils/stockage.go` |
| Authentification            | `golang-jwt/jwt/v5` + bcrypt               | Bearer JWT HS256, `jti` validé dans Redis               |
| Documentation API           | `swaggo/swag`                              | annotations `godoc` sur **chaque** handler (y compris jeux, plateformes, comptes-gamers, notifications), `swag init -g main.go -o docs` relancé à chaque route ajoutée, paquet `docs/` importé par `routes/` et JSON servi via `swag.ReadDoc()` (jamais lu depuis un fichier relatif au répertoire courant), UI sur `/api/docs` |
| Validation                  | `go-playground/validator/v10`              | validation des DTOs d'entrée                            |
| Configuration               | `joho/godotenv`                            | `.env` / `.env.example`                                 |
| Migrations                  | GORM AutoMigrate + seed                    | `migrations/migrate.go`, `migrations/seed.go`           |
| Logger                      | `go.uber.org/zap`                          | logger structuré production                             |
| UUID                        | `google/uuid`                              | identifiants des entités créées                         |
| Notifications push          | Firebase Cloud Messaging (FCM)             | enfilée via Asynq, jeton FCM stocké sur `sessions_utilisateurs` |
| Paiements Mobile Money      | LigdiCash + MoneyFusion                    | voir les compétences dédiées ci-dessus — dépôt/retrait dans le portefeuille |
| Reverse Proxy               | Caddy                                      | `deploy/Caddyfile` (TLS automatique en production)      |
| Conteneurisation            | Docker + Docker Compose                    | `Dockerfile` multi-étages + `docker-compose.yml` (backend, postgres, redis, caddy) — le dossier `public/preuves/` est monté sur un volume persistant |

### Charte API (contrat avec le mobile et le frontend web TanStack Start)

- **Base URL :** `http://localhost:8080/api`
- **Format :** JSON, champs en **camelCase français**, identiques aux modèles des clients
  (mobile Flutter, back-office web) : `nomUtilisateur`, `montantMise`, `soldeDisponible`,
  `soldeBloque`, `dateCreation`… Les énumérations gardent leurs valeurs françaises en
  `snake_case` (`en_attente`, `bloquee`, `verification`, `orange_money`…).
- **Sérialisation :** toute réponse est produite depuis une struct Go portant des tags `json`
  camelCase — **jamais** depuis un `[]map[string]any` ni un scan brut (les clés seraient alors
  les colonnes SQL en snake_case : `montant_mise`, `createur_id`…). Pour une liste enrichie par
  jointure (ex. `GET /api/defis`), déclarer une struct qui embarque le modèle et ajoute les
  champs joints (`createurNom`, `jeuNom`, `plateformeNom`). Une liste vide renvoie `[]`, jamais
  `null`.
- **Identifiants :** UUID.
- **Dates :** ISO 8601 / RFC 3339 en UTC (`2026-09-05T10:00:00Z`) — DSN PostgreSQL en
  `TimeZone=UTC`.
- **Devise :** FCFA (XOF) par défaut ; le champ `devise` reste explicite sur chaque montant
  pour permettre l'extension à d'autres devises plus tard.
- **Authentification :** `Authorization: Bearer <jwt>` ; le `jti` du jeton doit exister dans
  Redis (`session:<jti>`), la déconnexion le supprime. Le rôle (`joueur` / `admin`) est porté
  par le jeton. `utilisateurs` et `administrateurs` sont deux tables distinctes (voir §7,
  tables 1 et 15) : un joueur se connecte via `POST /api/auth/connexion`, un administrateur via
  `POST /api/auth/admin/connexion` — même mécanisme de session Redis, tables sources différentes.
- **Succès :** l'objet ou le tableau directement (`200`/`201`), `204` pour les suppressions.
- **Pagination (listes d'administration) :** `GET …?page=1&taille=10` → enveloppe
  `{ "elements": [...], "total": 42, "page": 1, "taille": 10, "pages": 5 }`. **10 par page**
  par défaut ; `utils.Pagination(c)` lit `page` (≥ 1) et `taille` (1..100), `utils.NouvellePage`
  construit l'enveloppe (`elements` vaut `[]`, jamais `null` ; `total` = nombre total **après
  filtres** ; `pages` = ⌈total / taille⌉ ; une page au-delà renvoie `elements: []` avec le même
  `total`). Tri `date_creation DESC`. Listes concernées : `GET /api/utilisateurs`,
  `GET /api/paiements`, `GET /api/matchs?tous=1`, `GET /api/litiges?tous=1`,
  `GET /api/administration/journaux-audit`, `GET /api/contact`. Les listes **joueur**
  (`/api/matchs` et `/api/litiges` sans `tous`, `/api/defis`, `/api/defis/ouverts`,
  notifications, transactions du portefeuille) restent des tableaux : une même route renvoie un
  tableau au joueur et une page à l'administrateur avec `?tous=1`. Godoc :
  `@Success 200 {object} utils.Page[auth.Utilisateur]` (swag 1.16 gère les génériques). Piège
  GORM : pour enchaîner `Count` puis `Find` sur la même requête filtrée, passer par
  `q = q.Session(&gorm.Session{})` — une chaîne `*gorm.DB` réutilisée sans session accumule
  ses clauses.
- **Erreur :** `{ "erreur": "message lisible en français" }` avec le statut HTTP adapté
  (400 validation, 401 non connecté, 403 interdit, 404 introuvable, 409 conflit, 422 solde
  insuffisant). Précisions : un montant ≤ 0 ou un identifiant mal formé → 400 (jamais 500 ni
  502) ; une ressource absente (`gorm.ErrRecordNotFound`) → 404 (jamais 409) ; une transition
  d'état impossible (déjà rejoint, déjà réglé, déjà en litige, déjà déclaré) → 409. Jamais de
  message d'erreur SQL brut renvoyé au client.
- **CORS :** ouvert au seul domaine du frontend web TanStack Start (site public + accès joueur
  + admin, une seule origine) ; l'app mobile n'est pas soumise à CORS.
- **Uploads (preuves de match) :** `multipart/form-data`, champs `fichier` (+ `type` :
  `capture_ecran` ou `video`) → fichier stocké sur le disque du serveur dans
  `public/preuves/<matchId>/<utilisateurId>/<idFichier>.<ext>`, servi via une route protégée
  (jamais un chemin statique public).
- **Documentation :** Swagger UI sur `http://localhost:8080/api/docs`.

---

## 2. Modules Métier

Chaque module backend est **autonome** : `models.go`, `services.go`, `controllers.go`,
`permissions.go`, `routes.go`. Le modèle `Utilisateur` vit dans `auth/` et est réutilisé.

1. **auth/** — inscription, connexion joueur (table `utilisateurs`) et connexion administrateur
   (table `administrateurs`, route dédiée), session (`/moi`), mot de passe oublié /
   réinitialisation / changement, middleware JWT + session Redis, garde admin. Table
   `sessions_utilisateurs` : **chaque** inscription/connexion d'un joueur y écrit une ligne
   (`jeton_hash` = SHA-256 du `jti`, jamais le jeton en clair ; `appareil` = User-Agent ;
   `adresse_ip` ; `date_expiration`), supprimée à la déconnexion, à la suspension et à la
   réinitialisation du mot de passe (avec la liste blanche Redis). Le jeton FCM
   (`POST /api/notifications/jeton-fcm`) est posé sur la session la plus récente.
2. **utilisateurs/** — gestion administrateur des comptes : liste paginée (`?recherche=`,
   `?statut=`), création (`POST` — même service `auth.CreerUtilisateur` que l'inscription
   publique : validation identique, hash bcrypt, e-mail en minuscules — **plus le
   portefeuille**, sans jeton ni session), détail avec `portefeuille`, modification (l'admin
   peut aussi changer `email`, `statut`, `motDePasse` ; un joueur qui envoie l'un de ces champs
   sur son propre profil reçoit 403), statut, **suppression logique** et mise à jour du
   profil par son propriétaire. Suppression logique (`DELETE /api/utilisateurs/:id`) : refusée
   en 409 (message explicite) si `solde_bloque > 0`, s'il reste un défi `ouvert` ou un match dans un
   statut actif (`matchs.StatutsActifs()` : `en_cours`, `preuve_requise`, `nul_en_attente`,
   `verification`, `litige`) ; sinon 204 — `statut = supprime`, e-mail
   `supprime-<id>@quiperd.invalid`, pseudo `supprime_<8 premiers caractères de l'id>`,
   téléphone et photo vidés, sessions révoquées, audit `utilisateur:suppression` (ancien
   pseudo/e-mail en `ancienne_valeur`). La ligne reste en base (historique des matchs, grand
   livre, audit) : `GET /api/utilisateurs/:id` répond **200 avec `statut = supprime`** (pas
   404), la liste admin filtre `?statut=supprime`, la connexion est refusée en 403 comme pour
   un compte suspendu, toute modification ou changement de statut répond 409, et l'ancien
   pseudo/e-mail redeviennent disponibles. Suspension (`PATCH …/statut` ou `PATCH …` avec
   `statut = suspendu`) et changement de mot de passe par l'admin révoquent toutes les
   sessions du joueur (liste blanche Redis + `sessions_utilisateurs`). Le hash n'apparaît
   jamais dans une réponse ni dans le journal d'audit (`"motDePasse": "modifié"`).
3. **comptes_gamers/** — liaison entre le compte QUI PERD et l'identifiant du joueur dans
   chaque jeu/plateforme (un joueur peut avoir un pseudo différent sur EA SPORTS FC).
4. **jeux/** — catalogue des jeux, chacun avec une `categorie` obligatoire (`sport`, `combat`,
   `course`, `tir`, `strategie`, `cartes`, `arcade` — constantes `jeux.Categories`), lecture
   publique (`?categorie=` pour filtrer, tri catégorie puis nom), gestion admin.
5. **plateformes/** — catalogue des plateformes, chacune avec une `famille` obligatoire (`pc`,
   `console`, `mobile` — constantes `plateformes.Familles`), lecture publique (`?famille=`),
   gestion admin.
6. **defis/** — création, liste connectée (filtres jeu/plateforme/catégorie/famille/mise),
   **liste publique des défis ouverts** (`GET /api/defis/ouverts`, sans jeton, pour la page
   « Défis » du site vitrine), annulation d'un défi ouvert (mise rendue moins la commission).
7. **matchs/** — créé quand un deuxième joueur rejoint un défi ; porte **toute la machine à
   états** (§5.3) : déclaration (`resultats_declares`, une par joueur **et par manche**),
   confirmation du score par l'adversaire, désaccord, nul (choix `rejouer` / `partager`,
   table `choix_nuls`, manches), échéances (`echeances.go` : `PoserEcheance`,
   `AnnoncerChrono`, `TraiterEcheance` appelé par le worker) et validation administrative.
8. **preuves/** — upload des preuves (`preuves_matchs`) sur le disque du serveur,
   vérification/rejet. Sur un match en `preuve_requise`, le dépôt qui complète la paire
   (une preuve par joueur) déclenche `matchs.PasserEnLitige` dans la même transaction.
9. **litiges/** — ouverture, instruction et décision arbitrale (`litiges`). Ouverture manuelle =
   transition atomique du match (`en_cours` / `preuve_requise` / `nul_en_attente` /
   `verification` → `litige`), 409 si le match est déjà en litige ou terminé (un seul litige
   `en_cours` par match) ; ouverture automatique **après** le passage en `litige` (deux preuves
   déposées ou échéance de preuve expirée) via le hook `matchs.OuvrirLitigeAuto` branché par
   `litiges.Brancher()` — un désaccord n'ouvre plus de litige immédiat. Dans les deux cas :
   notification `litige_ouvert` (à l'adversaire, ou aux deux joueurs si automatique) et tâche
   Asynq `litige:relance` enfilée (24 h, `TaskID litige-relance:<id>`).
10. **portefeuilles/** — solde disponible/bloqué par utilisateur, historique des mouvements
    (`transactions_portefeuilles`).
11. **paiements/** — dépôts et retraits via LigdiCash/MoneyFusion (voir compétences dédiées),
    callbacks, polling de secours Asynq. Les retraits appliquent `frais_retrait` (§5.7) : la
    configuration financière n'est pas décorative, chaque type de `configurations_financieres`
    a un point d'application dans le code (`commission_defi` → règlement, `mise_minimale` /
    `mise_maximale` → création de défi, `frais_retrait` → retrait).
12. **notifications/** — notifications utilisateur poussées en push via FCM. Types et
    événements déclencheurs (tous obligatoires) : `defi_rejoint` (créateur, au rejoindre),
    `defi_expire` (créateur, job `defi:expiration`), `match_score` (l'adversaire du déclarant,
    « score à confirmer »), `match_desaccord` (les deux, déclarations divergentes),
    `match_nul` (les deux, choix attendu), `match_rejoue` (les deux, nouvelle manche),
    `match_abandon` (les deux, échéance de confirmation dépassée), `match_termine` (les deux
    joueurs, au règlement — partage compris), `litige_ouvert` (adversaire ou les deux joueurs,
    à l'ouverture), `litige_resolu` (les deux joueurs, à la décision), `paiement_confirme`
    (dépôt crédité). Un type ne sert jamais pour un autre événement (pas de `match_termine`
    pour une expiration de défi). Toute notification créée dans une transaction est passée au
    `*tempsreel.Tampon` de l'appelant (§5 bis) : elle n'est diffusée qu'après le commit.
13. **administration/** — statistiques globales, gestion des litiges, `configurations_financieres`
    (commission, mise minimale/maximale, frais de retrait **et les trois délais de la machine à
    états**, lus par `DelaiConfirmation` / `DelaiPreuve` / `DelaiChoixNul` — repli sur la valeur
    par défaut si la clé est absente ou non strictement positive : un délai nul ferait expirer
    le chrono immédiatement et volerait un match à un joueur), `journaux_audit`.
14. **contact/** — messages du formulaire de contact du site public (`messages_contact`,
    table 19) : envoi public (`auth.Optionnel()` — le message est rattaché au joueur si un
    jeton joueur valide accompagne la requête) protégé par un anti-spam Redis (5 messages par
    heure et par adresse IP, clé `contact:ip:<ip>`, TTL 1 h → 429) ; liste paginée, détail,
    traitement (statut `nouveau` / `lu` / `traite` + `noteAdmin`) et suppression réservés à
    l'admin ; changement de statut et suppression journalisés (`contact:statut_<statut>`,
    `contact:suppression`). Aucune notification ni e-mail n'est envoyé par ce module.
15. **tempsreel/** — transport WebSocket de la plateforme (§5 bis) : hub, salons, ticket Redis à
    usage unique, diffusion Redis Pub/Sub, compteur de joueurs en ligne. **Aucune règle métier**,
    aucun import de module métier.

---

## 3. Arborescence des Dossiers et Fichiers

```text
backend/
├── main.go                  # démarre Fiber, config, migrations, seed, worker Asynq et routes
├── go.mod / go.sum
├── .env / .env.example
├── Dockerfile
├── docker-compose.yml       # backend + postgres + redis + caddy
├── public/
│   └── preuves/             # stockage local des preuves de match (captures + vidéos)
├── deploy/
│   └── Caddyfile
├── migrations/
│   ├── migrate.go           # GORM AutoMigrate de tous les modèles
│   └── seed.go              # jeux, plateformes, configurations financières, admin de test
├── config/
│   ├── config.go
│   ├── database.go
│   └── redis.go
├── utils/
│   ├── logger.go
│   ├── reponses.go
│   ├── validation.go
│   ├── notifications_push.go   # FCM
│   └── stockage.go             # écriture/lecture des preuves sur le disque local
├── jobs/
│   └── client.go            # client Asynq : noms des tâches, charges utiles, fonctions d'enfilage (aucun import métier)
├── worker/
│   └── worker.go            # serveur Asynq : handlers defi:expiration, paiement:reverification, notification:push, litige:relance, match:echeance
├── tempsreel/               # couche WebSocket (§5 bis) — n'importe que config et utils
│   ├── evenements.go        # CONTRAT GELÉ : noms d'événements, salons, charges utiles (miroir de frontend/src/temps-reel/evenements.ts)
│   ├── hub.go               # registre des connexions et des salons, boucle du compteur
│   ├── socket.go            # upgrade, battement de cœur (ping 30 s / pong 60 s), actions client
│   ├── ticket.go            # ticket Redis à usage unique (ws:ticket:<valeur>, GETDEL)
│   ├── autorisation.go      # qui a droit à quel salon
│   ├── diffusion.go         # Publier, Tampon (diffusion APRÈS commit), Redis Pub/Sub inter-instances
│   ├── compteur.go          # joueurs en ligne, agrégé entre instances
│   └── routes.go            # GET /api/temps-reel, POST /api/temps-reel/ticket
├── auth/                    # models.go, services.go, controllers.go, permissions.go, routes.go — sessions_utilisateurs inclus
├── utilisateurs/            # idem
├── comptes_gamers/          # idem
├── jeux/                    # idem
├── plateformes/             # idem
├── defis/                   # idem
├── matchs/                  # idem — resultats_declares géré ici
├── preuves/                 # idem — preuves_matchs
├── litiges/                 # idem
├── portefeuilles/           # idem — transactions_portefeuilles
├── paiements/               # idem
├── notifications/           # idem
├── administration/          # idem — configurations_financieres + journaux_audit
├── contact/                 # idem — messages_contact (formulaire de contact, anti-spam Redis)
├── routes/
│   └── routes.go
├── tests/
│   ├── parcours-api.ps1           # recette HTTP complète (voir « Processus de développement ») — tests/tmp/ ignoré par git
│   ├── parcours-temps-reel.ps1    # recette WebSocket (ticket, salons, événements, reconnexion)
│   └── outils/                    # client WebSocket PowerShell partagé par la recette temps réel
└── docs/                    # généré par `swag init` (docs.go, swagger.json, swagger.yaml) — ne jamais éditer à la main
```

### Règles d'architecture

- `main.go` démarre Fiber et enregistre les modules ;
- chaque module métier reste autonome ;
- `routes/routes.go` centralise l'enregistrement global ;
- les services portent la logique métier — **en particulier toute la logique d'escrow (§5)
  vit dans `portefeuilles/services.go` et `matchs/services.go`, jamais dans les
  controllers** ;
- les controllers restent minces et portent les annotations swagger ;
- le modèle `Utilisateur` vit dans `auth/` — les autres modules l'importent (aucun cycle
  d'import) ;
- `paiements/` importe `portefeuilles/`, jamais l'inverse (même principe que documenté dans
  la compétence LigdiCash) ;
- les modules métier n'importent que `jobs/` (enfilage) ; les handlers Asynq vivent dans
  `worker/`, qui importe les modules — c'est ce qui évite le cycle module ↔ handler. Les
  dépendances croisées entre modules (matchs → litiges, matchs → notifications) passent par
  des hooks branchés au démarrage (`litiges.Brancher()`, `matchs.NotifierFinMatch`,
  `matchs.NotifierJoueurs`, `matchs.OuvrirLitigeAuto`, `matchs.CloturerLitigeAuto`) ;
- **`tempsreel/` suit exactement la même discipline que `jobs/`** : il n'importe que `config`
  et `utils`, les modules métier importent `tempsreel` — jamais l'inverse. Il ne contient
  aucune règle métier, seulement le transport. Le contrat (`tempsreel/evenements.go` et son
  miroir `frontend/src/temps-reel/evenements.ts`) est **gelé** : on peut y ajouter un
  événement documenté des deux côtés, jamais renommer ni changer la forme d'un existant sans
  répercuter le changement dans les deux fichiers ;
- **les noms de colonnes de l'annexe §7 font foi** : GORM dérive `joueur1_id` de `Joueur1ID`
  et `score_joueur1` de `ScoreJoueur1`, alors que l'annexe impose `joueur_1_id` et
  `score_joueur_1`. Tout champ dont le nom généré diffère de l'annexe porte un tag
  `gorm:"column:<nom_annexe>"`, et toute requête SQL brute (`Where`, `Select`, `Updates` par
  map, sous-requêtes) utilise les noms de l'annexe. Leçon retenue : ce décalage a rendu la
  2ᵉ déclaration de score impossible (colonne `score_joueur_1` inexistante → transaction
  PostgreSQL annulée, SQLSTATE 25P02) et `GET /api/litiges` en erreur 500 ;
- toute action métier notable (création défi, validation match, décision litige, dépôt,
  retrait) écrit une entrée dans `journaux_audit` ;
- tout envoi de notification (push ou email) passe par une tâche Asynq (jamais bloquant dans
  une requête HTTP).

---

## 4. Table des Routes de l'API

| Méthode | Route | Accès | Description |
| :--- | :--- | :--- | :--- |
| GET | `/api/sante` | Public | Vérification de disponibilité (Postgres, Redis) |
| GET | `/api/docs/*` | Public | Swagger UI |
| POST | `/api/auth/inscription` | Public | Création de compte + jeton |
| POST | `/api/auth/connexion` | Public | Connexion joueur (table `utilisateurs`) → `{ utilisateur, jeton }` (session Redis) |
| POST | `/api/auth/admin/connexion` | Public | Connexion administrateur (table `administrateurs`, distincte) → `{ administrateur, jeton }` |
| POST | `/api/auth/deconnexion` | Connecté | Invalide la session Redis |
| GET | `/api/auth/moi` | Connecté | Utilisateur ou administrateur courant selon le rôle du jeton |
| POST | `/api/auth/mot-de-passe-oublie` · `/reinitialisation-mot-de-passe` | Public | Réinitialisation |
| POST | `/api/auth/changer-mot-de-passe` | Connecté | Changement avec mot de passe actuel |
| GET | `/api/utilisateurs` | Admin | Liste des comptes **paginée** (`?page=1&taille=10`, `?recherche=` pseudo/e-mail, `?statut=actif|suspendu|en_attente|supprime`) → `{ elements, total, page, taille, pages }`, tri `date_creation DESC` |
| POST | `/api/utilisateurs` | Admin | Création `{ nomUtilisateur, email, motDePasse, telephone?, pays?, statut? }` (mêmes règles que l'inscription, portefeuille créé, aucune session) → 201 l'utilisateur (jamais le hash) ; 409 pseudo ou e-mail déjà pris ; audit `utilisateur:creation` |
| GET | `/api/utilisateurs/:id` | Admin | Détail : l'utilisateur à plat + `portefeuille: { soldeDisponible, soldeBloque }` (zéros si le portefeuille n'existe pas encore) ; un compte supprimé répond 200 avec `statut = supprime` |
| PATCH | `/api/utilisateurs/:id` | Connecté† | `{ nomUtilisateur?, telephone?, photoProfil?, pays? }` pour le propriétaire ; l'admin peut aussi envoyer `email?`, `statut?` (`actif|suspendu|en_attente`, suspension = sessions révoquées), `motDePasse?` (nouveau hash bcrypt + sessions révoquées) → 200 l'utilisateur ; 409 unicité pseudo/e-mail ou compte `supprime` ; audit `utilisateur:modification` |
| DELETE | `/api/utilisateurs/:id` | Admin | Suppression **logique** → 204 (statut `supprime`, e-mail `supprime-<id>@quiperd.invalid`, pseudo `supprime_<8 car.>`, téléphone/photo vidés, sessions révoquées, audit `utilisateur:suppression`) ; 409 `{ erreur }` explicite si solde bloqué > 0, défi `ouvert` ou match dans un statut actif (`en_cours|preuve_requise|nul_en_attente|verification|litige`), ou déjà supprimé ; 404 introuvable |
| PATCH | `/api/utilisateurs/:id/statut` | Admin | Actif / suspendu (409 sur un compte `supprime`, 404 introuvable) |
| GET/POST | `/api/comptes-gamers` | Connecté | Mes identifiants de joueur par jeu/plateforme |
| PATCH/DELETE | `/api/comptes-gamers/:id` | Connecté | Modification / suppression |
| GET | `/api/jeux` | Public | Catalogue des jeux actifs (admin : tous), chaque jeu porte `categorie` ; `?categorie=` filtre, tri catégorie puis nom |
| POST/PATCH/DELETE | `/api/jeux/:id` | Admin | Gestion du catalogue — `categorie` obligatoire à la création (`sport|combat|course|tir|strategie|cartes|arcade`), modifiable avec `nom` et `statut` |
| GET | `/api/plateformes` | Public | Catalogue des plateformes actives (admin : toutes), chacune porte `famille` ; `?famille=` filtre |
| POST/PATCH/DELETE | `/api/plateformes/:id` | Admin | Gestion du catalogue — `famille` obligatoire à la création (`pc|console|mobile`) |
| GET | `/api/defis/ouverts` | Public | Défis ouverts non expirés (100 max, plus récents d'abord) pour la page « Défis » du site vitrine — mêmes filtres et mêmes champs enrichis que `GET /api/defis`, sans jeton. Déclarée **avant** le groupe `/defis` protégé, sinon `/:id` l'intercepte |
| GET | `/api/defis` | Connecté | Défis ouverts (`?jeu=`, `?plateforme=`, `?categorie=`, `?famille=`, `?miseMax=`), enrichis de `createurNom`, `jeuNom`, `jeuCategorie`, `plateformeNom`, `plateformeFamille` ; `?mes=1` = mes défis, tous statuts |
| POST | `/api/defis` | Connecté | Création — bloque la mise du créateur |
| GET | `/api/defis/:id` | Connecté | Détail enrichi (`createurNom`, `jeuNom`, `plateformeNom`) + `match` enrichi s'il existe |
| POST | `/api/defis/:id/rejoindre` | Connecté | Rejoindre — bloque la mise, crée le `match` |
| DELETE | `/api/defis/:id` | Connecté | Annulation (si encore ouvert) — rend la mise moins la commission |
| GET | `/api/matchs` | Connecté | Mes matchs en tableau (`?statut=en_cours|preuve_requise|nul_en_attente|litige|termine`, `verification` pour les lignes héritées) ; admin `?tous=1` → **page** `{ elements, total, page, taille, pages }` de tous les matchs (`?page&taille`, même filtre `statut`) — chaque match porte `joueur1Nom`, `joueur2Nom`, `jeuNom`, `plateformeNom` |
| GET | `/api/matchs/:id` | Connecté | Détail du match enrichi (mêmes libellés) + `declarations` (**toutes** les manches, chaque ligne portant sa `manche`) + `choixNuls` |
| POST | `/api/matchs/:id/declaration` | Connecté | Déclaration du score par un joueur (§5) — 409 si le match n'est pas `en_cours` ou si ce joueur a déjà déclaré cette manche |
| POST | `/api/matchs/:id/confirmation` | Connecté | **Sans corps.** Le second joueur confirme le score proposé : le serveur écrit lui-même la déclaration miroir (le client n'envoie aucun chiffre, il ne peut donc pas falsifier ce qu'il confirme) → règlement immédiat, ou `nul_en_attente` si le score proposé était une égalité. 409 si rien n'est en attente ou si c'est sa propre déclaration |
| POST | `/api/matchs/:id/choix-nul` | Connecté | `{ choix: "rejouer" \| "partager" }` après un nul déclaré des deux côtés. 400 valeur inconnue, 409 hors `nul_en_attente` ou choix déjà exprimé pour la manche |
| POST | `/api/matchs/:id/preuves` | Connecté | Upload preuve (multipart → disque local) ; en `preuve_requise`, le dépôt de la **seconde** preuve (une par joueur) ouvre le litige |
| POST | `/api/matchs/:id/validation` | Système/Admin | Filet de sécurité de l'arbitrage : règle une ligne héritée en `verification` ou un match en `litige` dont le gagnant est déjà désigné. 409 si le gagnant n'est pas déterminé ; idempotent (renvoie l'état actuel sans rejouer le paiement) |
| GET | `/api/temps-reel` | Public | **WebSocket** unique de la plateforme (`?ticket=`). Sans ticket : connexion acceptée en visiteur, salons publics seulement. Voir §5 bis |
| POST | `/api/temps-reel/ticket` | Connecté | Échange la session contre un ticket Redis à **usage unique** (TTL court) pour ouvrir le socket |
| POST | `/api/matchs/:id/litige` | Connecté | Ouverture d'un litige |
| GET | `/api/litiges` | Connecté* | Mes litiges en tableau ; admin `?tous=1` → **page** de tous les litiges (`?page&taille`, `?statut=en_cours|resolu`) |
| PATCH | `/api/litiges/:id` | Admin | Décision arbitrale → règlement au gagnant ou remboursement croisé (chaque mise moins la commission) |
| GET | `/api/portefeuille` | Connecté | Solde disponible / bloqué |
| GET | `/api/portefeuille/transactions` | Connecté | Historique des mouvements |
| POST | `/api/paiements/depot` | Connecté | Dépôt via LigdiCash/MoneyFusion |
| POST | `/api/paiements/retrait` | Connecté | Retrait vers Mobile Money |
| GET | `/api/paiements` | Admin | Suivi des dépôts/retraits **paginé** (`?page&taille`, `?type=depot|retrait`, `?statut=en_attente|reussi|echoue|rembourse`) → `{ elements, total, page, taille, pages }` |
| PATCH | `/api/paiements/:id/statut` | Admin | Validation / échec / remboursement manuel |
| POST | `/api/paiements/callback-ligdicash` · `/callback-fusion` | Public (webhook) | Notifications des prestataires — routes distinctes par prestataire (les deux étant actifs simultanément), à la différence de l'exemple à un seul prestataire de la compétence LigdiCash |
| GET | `/api/notifications` | Connecté | Mes notifications |
| POST | `/api/notifications/:id/lue` | Connecté | Marquage lu |
| GET | `/api/configurations-financieres` | Public | Règles actives — 7 lignes : `commission_defi`, `mise_minimale`, `mise_maximale`, `frais_retrait`, plus les **délais de la machine à états** en minutes `delai_confirmation_minutes` (30), `delai_preuve_minutes` (120), `delai_choix_nul_minutes` (30). Lues par le site public et la création de défi, jamais codées en dur côté client |
| GET | `/api/administration/statistiques` | Admin | KPIs (cache Redis 60 s) |
| GET/PATCH | `/api/administration/configurations-financieres` | Admin | Commission, mises min/max, frais **et les trois délais** (réglables à chaud, historisation de l'ancienne valeur) |
| GET | `/api/administration/journaux-audit` | Admin | Journal d'audit **paginé** (`?page&taille`, `?action=` filtre exact) → `{ elements, total, page, taille, pages }`, plus récents d'abord |
| POST | `/api/contact` | Public | Formulaire de contact `{ nom, email, sujet, message }` → 201 le message créé (`statut = nouveau`, `utilisateurId` renseigné si un jeton joueur valide accompagne la requête via `auth.Optionnel()`) ; 400 + `details` ; anti-spam 5 messages/heure/IP (Redis `contact:ip:<ip>`, TTL 1 h) → 429 `Trop de messages envoyés, réessayez dans une heure.` |
| GET | `/api/contact` | Admin | Messages paginés `?page=1&taille=10&statut=` (`nouveau` / `lu` / `traite`) → enveloppe `{ elements, total, page, taille, pages }` (`utils.Pagination` + `utils.NouvellePage`), tri `date_creation DESC` ; statut inconnu → 400 |
| GET | `/api/contact/:id` | Admin | Détail d'un message (404 si introuvable, 400 si l'identifiant est mal formé) |
| PATCH | `/api/contact/:id` | Admin | `{ statut?, noteAdmin? }` (`noteAdmin` ≤ 2000 caractères, `""` vide la note) → 200 le message mis à jour ; corps sans aucun des deux champs → 400 ; audit `contact:statut_<statut>` quand le statut change |
| DELETE | `/api/contact/:id` | Admin | 204 ; audit `contact:suppression` (instantané du message en `ancienne_valeur`) ; 404 si introuvable |

\* `/api/litiges` : un joueur ne voit que les litiges où il est impliqué.
† `/api/utilisateurs/:id` : un joueur ne modifie que son propre profil (pseudo, téléphone, photo,
pays) ; un administrateur peut modifier n'importe quel profil, y compris `email`, `statut` et
`motDePasse` — un joueur qui envoie l'un de ces trois champs reçoit 403.

---

## 5. Moteur de Mise / Escrow — règle critique

> **C'est le point le plus important de QUI PERD.** Un montant ne doit jamais pouvoir être
> simultanément *disponible*, *bloqué* et *payé*, et un même match ne doit jamais pouvoir
> déclencher deux paiements. Toute la logique ci-dessous vit dans une **transaction GORM
> unique** avec verrouillage de ligne (`SELECT ... FOR UPDATE`) sur les portefeuilles
> concernés — jamais deux requêtes SQL séparées pour lire puis écrire un solde.

1. **Création d'un défi** (`POST /api/defis`) : dans une transaction, vérifier
   `solde_disponible >= montant_mise`, puis `solde_disponible -= montant`,
   `solde_bloque += montant`, créer la ligne `mises` (`statut = bloquee`) et la
   `transaction_portefeuille` correspondante.
2. **Rejoindre un défi** (`POST /api/defis/:id/rejoindre`) : même opération pour le second
   joueur, dans une transaction qui crée aussi le `match` (`statut = en_cours`) et fait passer
   le `defi` à `statut = complet`. Un défi déjà rejoint ou expiré est refusé (`409`).
3. **Machine à états du match** — *règle produit validée, elle a changé : ne pas revenir à
   l'ancienne.* Les déclarations (`resultats_declares`) sont uniques par
   `match_id + utilisateur_id + **manche**`.

   ```text
   en_cours ──(1re déclaration)──► en_cours + échéance « confirmation »
      ├─ 2e déclaration concordante OU POST /confirmation ─► termine  (règlement IMMÉDIAT)
      ├─ déclarations divergentes ───────────────────────► preuve_requise + échéance « preuve »
      ├─ nul déclaré des DEUX côtés ─────────────────────► nul_en_attente + échéance « choix_nul »
      └─ échéance « confirmation » expirée ──────────────► termine (le score déclaré fait foi)
   preuve_requise ──(les 2 preuves déposées OU échéance expirée)──► litige ──(arbitrage)──► termine
   nul_en_attente ──(rejouer × 2)──► en_cours, manche + 1, AUCUN mouvement d'argent
   nul_en_attente ──(choix opposés OU échéance expirée)──► termine (partage)
   ```

   - **Deux déclarations concordantes = match terminé sur-le-champ**, escrow réglé, **sans
     preuve ni arbitre, quel que soit le montant**. `verification` ne fait plus partie du
     parcours joueur : le statut reste défini pour les lignes héritées et pour
     `POST /matchs/:id/validation` (qui accepte `verification` **ou** `litige`).
   - Un désaccord n'ouvre **plus** de litige immédiat : le match passe en `preuve_requise`, les
     deux joueurs déposent une preuve, et le litige n'est ouvert qu'au dépôt de la seconde
     preuve ou à l'expiration de l'échéance (`matchs.PasserEnLitige`, transition atomique : les
     deux chemins concurrents n'ouvrent qu'un seul litige).
   - **Rejouer = zéro écriture au grand livre** : l'escrow reste `bloquee`, scores et
     `gagnant_id` repassent à NULL, `manche += 1`, les déclarations des manches précédentes sont
     conservées (le client filtre sur `match.manche`).
   - **Partage** : chacun récupère `mise × (1 − taux)` (`portefeuilles.PartagerEscrow`), la
     plateforme garde `2 × mise × taux`. La commission est **toujours** prélevée.
   - **Échéances** : `matchs.PoserEcheance` écrit `echeance` + `echeance_type` et enfile la tâche
     Asynq `match:echeance` (identifiant `match-ech:<matchId>:<type>:<manche>` → enfilage
     idempotent). Les durées viennent **toujours** de `configurations_financieres`
     (`delai_confirmation_minutes`, `delai_preuve_minutes`, `delai_choix_nul_minutes`) via
     `administration.DelaiConfirmation/DelaiPreuve/DelaiChoixNul` — **aucune constante en dur**.
     Le handler `matchs.TraiterEcheance` reverrouille la ligne, revérifie statut + manche + type
     + date, et ne fait rien si le chrono a été remplacé : rejouer la tâche est sans effet.
   - **Ordre de verrous unique dans toute l'application : la ligne `matchs`
     (`ChargerVerrouille`, `SELECT … FOR UPDATE`) PUIS les portefeuilles** (`ORDER BY id`).
     Tout chemin qui fait avancer la machine (déclaration, confirmation, choix de nul,
     expiration d'un chrono, dépôt de preuve) verrouille le match **avant** de lire les
     déclarations : sans ce verrou, deux joueurs qui déclarent en même temps liraient chacun
     « une seule déclaration » et le match resterait bloqué.
   - Chaque transition d'argent passe par `matchs.transition(...)` (`UPDATE … WHERE statut IN ?
     AND manche = ?`, `RowsAffected == 1`) : seul l'appel qui a réellement changé l'état paie.
4. **Validation administrative** (`POST /api/matchs/:id/validation`) : transition atomique
   `UPDATE matchs SET statut = 'termine' WHERE id = ? AND statut IN ('verification','litige')` —
   si `RowsAffected == 0`, le match est déjà réglé (ou pas validable), on renvoie l'état actuel
   sans rejouer le paiement (même principe d'idempotence que documenté dans la compétence
   LigdiCash pour les callbacks). Si la transition réussit, dans la même transaction :
   - lire `configurations_financieres.commission_defi` ;
   - `total = 2 × montant_mise`, `commission = total × taux`, `gain = total − commission` ;
   - `mise` du gagnant → `statut = gagnee` ; `mise` du perdant → `statut = perdue` ;
   - `solde_bloque` du gagnant et du perdant décrémentés chacun de `montant_mise` ;
   - `solde_disponible` du gagnant crédité de `gain` ;
   - deux `transactions_portefeuilles` créées (gain, commission) ;
   - `journaux_audit` : ancien statut, nouveau statut, gagnant.
5. **Annulation d'un défi ouvert** (`DELETE /api/defis/:id`) ou **expiration** (job Asynq
   `defi:expiration`) : rend la mise **uniquement au créateur, moins la commission** (voir la
   règle « toute mise rendue » ci-dessous) : transition atomique du défi (`ouvert → annule` /
   `ouvert → expire`, `RowsAffected == 0` → 409 ou no-op), puis
   `portefeuilles.RembourserMise(tx, defiID, createurID, taux, motif)` avec
   `taux = administration.CommissionActuelle(tx)`.
6. **Litige** : les deux mises restent `bloquee` tant que la décision n'est pas prise.
   `PATCH /api/litiges/:id` applique soit le règlement normal (étape 4) au gagnant désigné par
   l'arbitre, soit un remboursement croisé des deux joueurs
   (`portefeuilles.RemboursementCroise(tx, defiID, matchID, joueur1, joueur2, taux)` :
   **chaque mise rendue moins la commission**, portefeuilles verrouillés par `ORDER BY id`,
   transactions liées à `match_id` et `mise_id`) — toujours dans une transaction unique,
   jamais un règlement partiel. Un match nul déclaré des deux côtés n'ouvre **pas** de litige :
   il passe en `nul_en_attente` et les joueurs choisissent rejouer ou partager (point 3).

> **Règle transversale — toute mise rendue = mise × (1 − commission).** Décision produit :
> la plateforme prélève `commission_defi` **chaque fois qu'elle rend une mise** (annulation
> par le créateur, expiration sans adversaire, litige tranché « remboursement »), et pas
> seulement sur les matchs joués. Pour chaque mise rendue : `commission = mise × taux`
> (arrondi `decimal` à 2 décimales), `rendu = mise − commission`, `solde_bloque -= mise`,
> `solde_disponible += rendu`, `mise.statut = remboursee` (transition atomique
> `WHERE statut = bloquee` : une mise n'est jamais rendue deux fois), une transaction
> `remboursement` de `rendu` libellée « (moins la commission) » et une transaction `commission`
> de `commission` en statut `valide` — même mécanique que la commission de match : ligne
> informative (le joueur n'a jamais détenu la part prélevée), comptée par le KPI admin
> `commissionCumulee`, portant `mise_id` (et `match_id` s'il existe) pour la distinguer des
> frais de retrait. Toute cette logique vit dans un seul point (`portefeuilles.rendreMise`,
> appelé par `RembourserMise` / `RemboursementCroise`) : **un nouveau chemin qui rend une
> mise passe par ces fonctions, jamais par un crédit direct de `solde_disponible`.**
> Leçon retenue : la première version remboursait intégralement et chacun des trois chemins
> (annulation, expiration, litige) avait son propre code de remboursement ; changer la règle a
> demandé de retoucher les trois et la recette — d'où la centralisation. Les textes
> (notifications, FAQ, CGU, écrans de confirmation) ne doivent jamais promettre un
> remboursement « intégral » ou « sans commission ».
7. **Dépôt/retrait** (`paiements/`) : ne touchent que `solde_disponible`, jamais `solde_bloque`
   directement. **Frais de retrait** : `frais = montant × frais_retrait` (configuration
   financière, arrondi à 2 décimales), prélevés **en plus** du montant demandé (le joueur reçoit
   exactement ce qu'il a demandé). À la demande : `solde_disponible -= montant + frais` (refusé
   en 422 si `solde_disponible < montant + frais`, même si `solde_bloque` couvrirait la
   différence), `paiements.frais` renseigné, deux `transactions_portefeuilles` en statut
   `en_attente` (`retrait` = montant, `commission` = frais, référence `<ref>-FRAIS`). Décision
   admin (`PATCH /api/paiements/:id/statut`) : `reussi` → les deux mouvements passent
   `valide` ; `echoue` → mouvements `annule` + une transaction `remboursement` de
   `montant + frais`. Les frais ne sont donc acquis à la plateforme que si le retrait a
   réellement eu lieu. Un dépôt crédité en double est impossible (transition atomique
   `en_attente → reussi`, `traite = true`).

Chaque scénario ci-dessus est testé avec **deux requêtes concurrentes** (ex. les deux joueurs
qui valident en même temps, un double clic sur "rejoindre") avant d'être considéré comme
terminé. La recette (`tests/parcours-api.ps1`, section 16) vérifie en plus les **invariants
comptables** en base à la fin du parcours : somme des portefeuilles = dépôts − retraits réussis
(frais inclus) − commissions de match − commissions sur les mises rendues ; grand livre =
soldes (crédits `depot`/`gain`/`remboursement` − débits `mise_bloquee`/`retrait`/frais de
retrait, les commissions portant `match_id` ou `mise_id` étant informatives) ; `solde_bloque`
= 0 et aucune `mise` encore `bloquee` quand tous les défis sont réglés/annulés/expirés ; au
plus une transaction `gain` par match ; chaque mise `remboursee` porte exactement une
transaction `commission` valide et une seule transaction `remboursement` ; références de
transactions uniques ; aucun solde négatif. Elle vérifie aussi les invariants de la machine à
états : tout match terminé est daté et **sans chrono résiduel** (`echeance IS NULL`,
`echeance_type = ''`), `manche >= 1`, un match a une transaction `gain` **si et seulement si**
il a un `gagnant_id` (un partage ou un remboursement croisé n'en a aucune), et aucun double
choix de nul pour un même joueur et une même manche.

---

## 5 bis. Couche Temps Réel (WebSocket) — architecture et pièges vérifiés

> **Le serveur pousse, le client n'interroge jamais.** Un état qui change en base et que
> l'utilisateur doit voir produit un événement ; il n'existe aucun `refetchInterval` ni aucune
> boucle de rafraîchissement côté client (règle miroir dans la compétence web).

**Architecture.** Un seul socket par client (`GET /api/temps-reel`), multiplexé par **salons** :
`public:defis` (visiteurs compris), `utilisateur:<id>` (données d'argent — jamais sur un salon
public), `match:<id>` (les deux joueurs + les administrateurs), `admin`. Le paquet `tempsreel`
expose exactement trois choses au métier :

```go
func Publier(evenement string, charge any, salons ...string) // diffusion immédiate, HORS transaction
func NouveauTampon() *Tampon                                 // accumulation pendant une transaction
func JoueursEnLigne() int
```

**Règle absolue : un événement ne part jamais avant le commit.** Publier depuis l'intérieur
d'une transaction ferait voir au client un état que la base peut encore annuler (et l'inverse :
un client qui recharge sur l'événement lit la valeur d'avant). Motif imposé partout :

```go
tampon := tempsreel.NouveauTampon()
err := config.DB.Transaction(func(tx *gorm.DB) error {
    …
    tampon.Ajouter(tempsreel.EvtMatchTermine, charge, tempsreel.SalonMatch(m.ID))
    return nil
})
if err != nil { return … }   // rien n'est diffusé
tampon.Diffuser()            // après le commit, et seulement après
```

Les hooks inter-modules (`matchs.NotifierJoueurs`, `matchs.OuvrirLitigeAuto`, …) reçoivent donc
le `*Tampon` de l'appelant : les notifications créées dans la transaction partent avec elle.

**Diffusion inter-process : Redis Pub/Sub obligatoire** (canal `qp:temps-reel`). Sans lui, un
événement produit par le **worker Asynq** (expiration d'un défi, échéance d'un match) n'atteint
jamais les sockets tenus par le process API. Chaque instance s'abonne au canal et redistribue à
ses connexions locales.

**Authentification par ticket.** Le JWT vit dans un cookie HttpOnly que le navigateur ne lit
jamais, et on ne peut pas poser d'en-tête `Authorization` sur une connexion WebSocket :
`POST /api/temps-reel/ticket` (Bearer) crée un aléa de 32 octets dans Redis
(`ws:ticket:<valeur>` → `{utilisateurId, role}`, TTL court) que le socket consomme avec
**`GETDEL`** — lecture et suppression atomiques, donc **usage unique** ; deux `GET` puis `DEL`
laisseraient une fenêtre de rejeu. Un ticket absent, expiré ou déjà consommé ne ferme pas la
connexion : `connexion.refusee` puis bascule en visiteur (salons publics seulement).

### Pièges vérifiés en séance (chacun a réellement coûté du temps)

- **go-redis : l'ordre `Subscribe` → `Receive(ctx)` → *puis* `Channel()` est obligatoire.**
  Ouvrir `Channel()` avant `Receive` fait consommer la confirmation d'abonnement par la
  goroutine interne du client : l'abonnement paraît établi et **plus aucun message n'arrive**,
  sans la moindre erreur.
- **Après un `Upgrade` WebSocket, le handler tourne dans une goroutine et le `fiber.Ctx` /
  `RequestCtx` est recyclé.** Tout ce dont la connexion a besoin (ticket, IP, en-têtes, rôle)
  est extrait et copié **avant** l'upgrade ; le lire après donne des valeurs d'une autre
  requête, ou vide.
- **Un compteur partagé entre instances est un plancher, pas une vérité** :
  `max(total lu dans Redis, total local)`. Se fier au seul total partagé fait afficher zéro
  entre deux rafraîchissements (la fenêtre où l'instance n'a pas encore réécrit son champ), et
  se fier au seul local sous-compte. Un champ d'instance plus vieux que le seuil de fraîcheur
  est ignoré puis supprimé, sinon un process mort gonfle le compteur pour toujours.
- **`CheckOrigin` permissif = faille CSWSH.** Un site tiers ouvrirait un socket authentifié
  avec les cookies de la victime (l'origine n'est pas soumise à la politique CORS sur un
  WebSocket). Liste blanche obligatoire (`WS_ORIGINES_AUTORISEES`), jamais `return true`.
- **Jamais deux versions du worker sur la même file Redis.** Un ancien binaire encore vivant
  consomme les tâches d'un type dont il n'a pas le handler : Asynq les met en échec avec un
  backoff silencieux et la tâche « ne part jamais ». Avant de tester une nouvelle tâche
  (`match:echeance`), vérifier qu'un seul processus tourne.
- **Battement de cœur** : ping serveur toutes les 30 s, fermeture après 60 s sans signe de vie.
  Le ping n'est pas un luxe : sans lui, l'infrastructure coupe les sockets inactifs (voir la
  compétence de déploiement, coupure Cloudflare à 100 s).

### Sécurité et recette

- Aucune donnée privée (solde, e-mail, transaction, identifiant de paiement) sur un salon
  public. L'autorisation d'un salon est **revérifiée côté serveur** à l'abonnement — un client
  peut demander n'importe quel salon, il ne reçoit que ceux auxquels sa session donne droit
  (`salons` acceptés et `refuses` renvoyés dans `abonnement.confirme`).
- `backend/tests/parcours-temps-reel.ps1` fait partie des recettes à passer à **100 %**, au
  même titre que `parcours-api.ps1`.

---

## 6. Stratégie de Données

1. **Migrations & seed :** au démarrage, `AutoMigrate` puis `Semer` (idempotent, par nom) :
   les **50 jeux** du catalogue initial avec leur catégorie (10 sport, 10 combat, 8 course,
   11 tir, 6 stratégie, 3 cartes, 2 arcade — liste `jeuxInitiaux` de `migrations/seed.go`),
   les **9 plateformes** avec leur famille (PC ; PlayStation 5, PlayStation 4, Xbox Series X|S,
   Xbox One, Nintendo Switch 2, Nintendo Switch ; Mobile Android, Mobile iOS), les
   `configurations_financieres` par défaut (commission 10 %, mise min 500 FCFA, mise max
   100 000 FCFA, frais de retrait 1 %, **délais de la machine à états : confirmation 30 min,
   preuve 120 min, choix après un nul 30 min**) et un compte administrateur de test. Le seed complète
   aussi les lignes existantes (catégorie/famille vides après migration, anciens libellés
   `PlayStation` → `PlayStation 5`, `Xbox` → `Xbox Series X|S`) : enrichir le seed ne
   réinitialise jamais la base, et la recette (`tests/parcours-api.ps1`) vérifie ≥ 50 jeux
   avec catégorie, ≥ 9 plateformes avec famille, les filtres et la liste publique.
2. **Sécurité :** bcrypt, JWT HS256 (`JWT_SECRET`) avec `jti` en session Redis (déconnexion
   réelle), comptes suspendus refusés, tentatives échouées consignées dans `journaux_audit`.
3. **Preuves de match :** upload multipart stocké sur le disque du serveur (`public/preuves/`),
   taille maximale imposée, formats acceptés limités (image/vidéo), `empreinte_fichier` (hash)
   calculée pour détecter les doublons/réutilisations entre matchs.
4. **Jobs Asynq :** `defi:expiration` (enfilée à la création du défi, `TaskID defi-exp:<id>`,
   rend la mise au créateur, moins la commission, si le défi est encore `ouvert`),
   `paiement:reverification` (polling de
   secours LigdiCash/MoneyFusion, enfilée à chaque dépôt initié), `notification:push` (FCM,
   enfilée par `notifications.Creer`), `litige:relance` (enfilée à **chaque** ouverture de
   litige, 24 h ; le handler journalise `litige:relance` dans `journaux_audit` si le litige
   est toujours `en_cours`). Chaque tâche définie a un point d'enfilage et un handler : une
   tâche déclarée mais jamais enfilée est un défaut. Test sans attendre le délai : avancer le
   score de la tâche dans le zset `asynq:{default}:scheduled` (`ZADD ... XX 1 <TaskID>`), le
   worker la traite dans les 5 s.
5. **Production :** `docker compose up` construit et lance backend + PostgreSQL + Redis + Caddy,
   avec le dossier `public/preuves/` sur un volume persistant. Variables d'environnement
   documentées dans `.env.example`. Le déploiement complet sur un serveur Debian (config, SSL,
   sauvegardes, tests) est détaillé dans
   [`../skill deploiement/demarrage-deploiement.md`](../skill%20deploiement/demarrage-deploiement.md).
6. **Clients de l'API :** le mobile Flutter (`demarrage-mobile.md`) et le frontend web
   TanStack Start (`demarrage-web.md` — site public, accès joueur web, tableau admin)
   consomment cette même API — aucun champ, route ou statut spécifique à un client n'est
   ajouté ici sans être répercuté dans la charte API (§1).
7. **Nommage des colonnes & migrations :** l'annexe §7 fait foi (voir la règle
   d'architecture correspondante en §3). La recette compare `information_schema.columns` de
   `matchs` aux noms de l'annexe. Si une base existante porte des colonnes mal nommées, une
   étape de migration idempotente (`Migrator().HasColumn` + `RenameColumn`) les renomme
   **avant** l'`AutoMigrate` — sinon GORM ajoute une colonne vide à côté de l'ancienne et les
   données semblent disparaître. Piège connu : `Migrator().DropIndex` du driver postgres
   génère `DROP INDEX CURRENT_SCHEMA()."..."` (SQL invalide, démarrage impossible) → utiliser
   `DROP INDEX IF EXISTS` en SQL brut. Les clés étrangères ne sont pas créées par GORM
   (`DisableForeignKeyConstraintWhenMigrating`) : chaque référence au catalogue (jeu,
   plateforme) est donc vérifiée en code (`existeActif`) avant insertion.
8. **Anti-spam du formulaire de contact :** compteur Redis `contact:ip:<ip>` (`INCR`, puis
   `EXPIRE 1 h` posé quand le compteur vaut 1), incrémenté **après** validation du corps (un
   formulaire mal rempli ne consomme pas le quota) ; au-delà de 5 messages dans l'heure,
   `POST /api/contact` répond 429. Redis indisponible → l'envoi est accepté et l'incident
   journalisé côté serveur (le formulaire ne tombe pas avec le cache). Piège connu : la
   recette (section « contact ») vide les clés `contact:ip:*` avant et après ses envois,
   sinon un second passage dans l'heure serait bloqué par ses propres messages ; toute
   nouvelle limitation par IP doit prévoir le même nettoyage dans ses tests.

---

## 7. Annexe — Modèle de données complet (19 tables)

### Vue globale

```text
UTILISATEURS
│
├── COMPTES_GAMERS
│
├── DEFIS
│     │
│     └── MATCHS
│           ├── MISES
│           ├── RESULTATS_DECLARES
│           ├── PREUVES_MATCHS
│           └── LITIGES
│
├── PORTEFEUILLES
│     └── TRANSACTIONS_PORTEFEUILLES
│
├── PAIEMENTS
├── NOTIFICATIONS
└── SESSIONS_UTILISATEURS

JEUX
└── PLATEFORMES

ADMINISTRATEURS
├── LITIGES
└── JOURNAUX_AUDIT

CONFIGURATIONS_FINANCIERES
└── Règles financières de QUI PERD

MESSAGES_CONTACT
└── Formulaire de contact du site public (utilisateur_id facultatif → UTILISATEURS)
```

### 1. `utilisateurs`

Contient tous les utilisateurs de l'application. Un utilisateur peut créer un défi, en
rejoindre un, jouer, déposer/retirer de l'argent, envoyer des preuves, ouvrir un litige.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant unique |
| `nom_utilisateur` | VARCHAR(50) | Pseudo QUI PERD |
| `email` | VARCHAR(255) | Adresse email |
| `telephone` | VARCHAR(30) | Numéro de téléphone |
| `mot_de_passe` | TEXT | Mot de passe haché (bcrypt) |
| `photo_profil` | TEXT | Photo de profil |
| `pays` | VARCHAR(100) | Pays |
| `statut` | VARCHAR(20) | actif / suspendu / en_attente / supprime (suppression logique par un administrateur : ligne conservée et anonymisée, connexion refusée) |
| `date_creation` | TIMESTAMP | Date de création |
| `date_modification` | TIMESTAMP | Dernière modification |

### 2. `jeux`

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `nom` | VARCHAR(100) | unique — ex. `EA SPORTS FC 27`, `Street Fighter 6`, `Gran Turismo 7` (50 jeux dans le seed) |
| `categorie` | VARCHAR(50) | **obligatoire**, indexée : `sport`, `combat`, `course`, `tir`, `strategie`, `cartes`, `arcade` (JSON `categorie`) — un client affiche ses propres libellés/icônes, jamais la valeur brute |
| `statut` | VARCHAR(20) | actif / inactif |
| `date_creation` | TIMESTAMP | Date |

### 3. `plateformes`

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `nom` | VARCHAR(50) | unique — seed : `PC`, `PlayStation 5`, `PlayStation 4`, `Xbox Series X\|S`, `Xbox One`, `Nintendo Switch 2`, `Nintendo Switch`, `Mobile Android`, `Mobile iOS` |
| `famille` | VARCHAR(20) | **obligatoire**, indexée : `pc`, `console`, `mobile` (JSON `famille`) |
| `statut` | VARCHAR(20) | actif / inactif |
| `date_creation` | TIMESTAMP | Date |

### 4. `comptes_gamers`

Relie le compte QUI PERD au compte utilisé par le joueur dans son jeu (le pseudo QUI PERD peut
différer de l'identifiant en jeu).

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `utilisateur_id` | UUID | Propriétaire |
| `jeu_id` | UUID | Jeu |
| `plateforme_id` | UUID | Plateforme |
| `identifiant_joueur` | VARCHAR(150) | ID du joueur sur le jeu |
| `nom_affichage` | VARCHAR(150) | Nom affiché dans le jeu |
| `date_creation` | TIMESTAMP | Date |
| `date_modification` | TIMESTAMP | Date |

### 5. `defis`

Créé par un joueur : jeu, plateforme, mise, règles, durée du défi.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `createur_id` | UUID | Créateur |
| `jeu_id` | UUID | Jeu |
| `plateforme_id` | UUID | Plateforme |
| `montant_mise` | DECIMAL(15,2) | Mise par joueur |
| `devise` | VARCHAR(10) | Devise (FCFA par défaut) |
| `regles` | TEXT | Règles du match |
| `statut` | VARCHAR(30) | ouvert / complet / annule / expire |
| `date_expiration` | TIMESTAMP | Expiration si personne ne rejoint |
| `date_creation` | TIMESTAMP | Création |
| `date_modification` | TIMESTAMP | Modification |

Exemple : défi `#QP-00125`, créateur `Kader225`, jeu `EA SPORTS FC 27`, plateforme
`PlayStation`, mise `2 000 FCFA`, statut `ouvert`.

### 6. `matchs`

Créé lorsqu'un deuxième joueur rejoint le défi — représente le match réel.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `defi_id` | UUID | Défi |
| `joueur_1_id` | UUID | Premier joueur |
| `joueur_2_id` | UUID | Deuxième joueur |
| `score_joueur_1` | INTEGER | Score |
| `score_joueur_2` | INTEGER | Score |
| `gagnant_id` | UUID | Gagnant |
| `perdant_id` | UUID | Perdant |
| `statut` | VARCHAR(30) | en_cours / preuve_requise / nul_en_attente / litige / termine (`verification` : lignes héritées et arbitrage admin) |
| `manche` | INTEGER | Manche courante, 1 par défaut. Incrémentée quand les deux joueurs choisissent « rejouer » après un nul — **sans aucun mouvement d'argent** |
| `echeance` | TIMESTAMP | Fin du chrono en cours (NULL si aucun). Le client l'égrène sans appel réseau |
| `echeance_type` | VARCHAR(20) | `confirmation` / `preuve` / `choix_nul` — vide quand il n'y a pas de chrono |
| `date_debut` | TIMESTAMP | Début |
| `date_fin` | TIMESTAMP | Fin |
| `date_creation` | TIMESTAMP | Création |
| `montant_mise` | DECIMAL(15,2) | Mise par joueur, dénormalisée depuis `defis` pour régler l'escrow sans importer `defis/` (évite le cycle defis ↔ matchs) |
| `devise` | VARCHAR(10) | Devise, dénormalisée de la même façon |

> Les colonnes `joueur_1_id`, `joueur_2_id`, `score_joueur_1`, `score_joueur_2` ne sont **pas**
> celles que GORM génère par défaut (`joueur1_id`, `score_joueur1`) : le modèle Go doit les
> imposer avec `gorm:"column:..."` (voir §3, règles d'architecture). JSON : `joueur1Id`,
> `joueur2Id`, `scoreJoueur1`, `scoreJoueur2`.

Exemple : match `#QP-MATCH-845`, `Kader225` 3 – 1 `Moussa10`, gagnant `Kader225`, statut
`termine` (les deux déclarations concordaient : règlement immédiat, sans preuve ni arbitre).

**Table annexe `choix_nuls`** — choix d'un joueur après un nul déclaré des deux côtés :
`id`, `match_id`, `utilisateur_id`, `manche`, `choix` (`rejouer` / `partager`), `date_choix`,
`date_creation`. Unicité `match_id + utilisateur_id + manche`.

### 7. `mises`

L'argent engagé par chaque joueur — cœur du système d'escrow.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `defi_id` | UUID | Défi |
| `utilisateur_id` | UUID | Joueur |
| `montant` | DECIMAL(15,2) | Montant |
| `devise` | VARCHAR(10) | Devise |
| `statut` | VARCHAR(20) | bloquee / gagnee / perdue / remboursee |
| `date_creation` | TIMESTAMP | Date |

Exemple : `Kader225` → 2 000 FCFA (bloquee), `Moussa10` → 2 000 FCFA (bloquee) → 4 000 FCFA
bloqués en escrow.

### 8. `resultats_declares`

Ce que chaque joueur déclare après le match (distinct du résultat final validé).

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `match_id` | UUID | Match |
| `utilisateur_id` | UUID | Joueur |
| `manche` | INTEGER | Manche déclarée (1 par défaut) |
| `score_pour` | INTEGER | Son score |
| `score_contre` | INTEGER | Score adverse |
| `gagnant_declare_id` | UUID | Gagnant déclaré (NULL = nul déclaré) |
| `commentaire` | TEXT | Commentaire |
| `date_declaration` | TIMESTAMP | Date |

> **La clé unique porte la manche** (`match_id + utilisateur_id + manche`) : après un « rejouer »,
> chaque joueur redéclare la nouvelle manche sans que l'historique de la précédente soit détruit.
> `GET /api/matchs/:id` renvoie **toutes** les manches ; le client filtre sur `match.manche`.

Exemple : `Kader225` déclare 3-1 (gagnant : Kader225) ; `Moussa10` déclare 1-3 (gagnant :
Kader225) → déclarations cohérentes, match réglé immédiatement.

### 9. `preuves_matchs`

Preuves envoyées après le match : capture d'écran + vidéo.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `match_id` | UUID | Match |
| `utilisateur_id` | UUID | Joueur |
| `type` | VARCHAR(20) | capture_ecran / video |
| `url_fichier` | TEXT | Chemin du fichier sur le disque local |
| `empreinte_fichier` | VARCHAR(128) | Hash |
| `statut` | VARCHAR(20) | en_attente / validee / rejetee |
| `motif_rejet` | TEXT | Pourquoi rejetée |
| `date_envoi` | TIMESTAMP | Date |
| `date_verification` | TIMESTAMP | Date |

### 10. `litiges`

Utilisée quand les joueurs ne sont pas d'accord ou qu'une preuve est contestée.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `match_id` | UUID | Match |
| `ouvert_par_id` | UUID | Joueur |
| `motif` | TEXT | Motif |
| `statut` | VARCHAR(20) | en_cours / resolu |
| `decision` | VARCHAR(30) | Décision |
| `arbitre_id` | UUID | Administrateur arbitre |
| `date_resolution` | TIMESTAMP | Date |
| `date_creation` | TIMESTAMP | Date |

Tant que le litige est `en_cours`, les 4 000 FCFA de l'escrow restent bloqués.

### 11. `portefeuilles`

Portefeuille financier du joueur.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `utilisateur_id` | UUID | Propriétaire |
| `devise` | VARCHAR(10) | Devise |
| `solde_disponible` | DECIMAL(15,2) | Disponible |
| `solde_bloque` | DECIMAL(15,2) | Bloqué (mises en cours) |
| `date_creation` | TIMESTAMP | Date |
| `date_modification` | TIMESTAMP | Modification |

### 12. `transactions_portefeuilles`

Historique de tous les mouvements d'argent.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `portefeuille_id` | UUID | Portefeuille |
| `mise_id` | UUID | Mise concernée |
| `match_id` | UUID | Match |
| `type` | VARCHAR(30) | depot / mise_bloquee / gain / commission / remboursement / retrait — `commission` avec `match_id` = commission de match (informative, portée par le gagnant qui n'a jamais détenu les deux mises) ; `commission` avec `mise_id` = commission sur une mise rendue (informative : le `remboursement` associé est déjà net) ; `commission` sans `match_id` ni `mise_id` = frais de retrait (vrai débit) |
| `montant` | DECIMAL(15,2) | Montant |
| `statut` | VARCHAR(20) | valide / en_attente (retrait non encore traité) / annule (retrait échoué, compensé par un `remboursement`) — les KPIs (`commissionCumulee`) ne somment que `valide` |
| `reference` | VARCHAR(100) | Référence unique |
| `description` | TEXT | Description |
| `date_creation` | TIMESTAMP | Date |

### 13. `paiements`

Gestion des dépôts et retraits via les prestataires de paiement (LigdiCash, MoneyFusion).

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `utilisateur_id` | UUID | Utilisateur |
| `type` | VARCHAR(20) | depot / retrait |
| `prestataire` | VARCHAR(50) | ligdicash / fusionmoney |
| `montant` | DECIMAL(15,2) | Montant demandé (déposé, ou envoyé au joueur pour un retrait) |
| `frais` | DECIMAL(15,2) | Frais de retrait prélevés en plus (`montant × frais_retrait`), 0 pour un dépôt |
| `devise` | VARCHAR(10) | Devise |
| `reference` | VARCHAR(100) | Référence interne |
| `reference_prestataire` | VARCHAR(1024) | Référence/token externe — un token de facture LigdiCash est un JWT long, jamais 150 caractères (leçon retenue de la compétence LigdiCash) |
| `operateur` | VARCHAR(50) | Opérateur Mobile Money renvoyé par le prestataire (ou `validation_manuelle`) |
| `statut` | VARCHAR(20) | en_attente / reussi / echoue / rembourse |
| `traite` | BOOLEAN | Verrou d'idempotence du crédit (un dépôt n'est crédité qu'une fois) |
| `date_creation` | TIMESTAMP | Date |
| `date_modification` | TIMESTAMP | Date |

Table technique associée : `paiements_evenements` (`paiement_id`, `prestataire`, `source`,
`corps` brut) journalise chaque callback/webhook reçu avant tout traitement (traçabilité des
litiges de paiement, leçon de la compétence LigdiCash).

### 14. `notifications`

| Champ | Type |
| :--- | :--- |
| `id` | UUID |
| `utilisateur_id` | UUID |
| `titre` | VARCHAR |
| `message` | TEXT |
| `type` | VARCHAR |
| `lu` | BOOLEAN |
| `date_creation` | TIMESTAMP |

Exemple : « Défi accepté — Moussa10 a rejoint votre défi de 2 000 FCFA. »

### 15. `administrateurs`

Gèrent les utilisateurs, jeux, litiges, preuves, opérations financières, suspensions.

| Champ | Type |
| :--- | :--- |
| `id` | UUID |
| `nom` | VARCHAR |
| `email` | VARCHAR |
| `mot_de_passe` | TEXT |
| `role` | VARCHAR |
| `statut` | VARCHAR |
| `date_creation` | TIMESTAMP |

### 16. `journaux_audit`

Historique des actions importantes réalisées sur la plateforme — essentiel pour une
application financière.

| Champ | Type |
| :--- | :--- |
| `id` | UUID |
| `utilisateur_id` | UUID |
| `administrateur_id` | UUID |
| `action` | VARCHAR |
| `table_cible` | VARCHAR |
| `identifiant_cible` | UUID |
| `ancienne_valeur` | JSONB |
| `nouvelle_valeur` | JSONB |
| `adresse_ip` | INET |
| `date_creation` | TIMESTAMP |

### 17. `configurations_financieres`

Centralise les règles financières de QUI PERD — jamais de valeur en dur dans le code.

| Champ | Type |
| :--- | :--- |
| `id` | UUID |
| `type` | VARCHAR |
| `valeur` | DECIMAL |
| `devise` | VARCHAR |
| `statut` | VARCHAR |
| `date_debut` | TIMESTAMP |
| `date_fin` | TIMESTAMP |

Exemples : `commission_defi` = 10 %, `mise_minimale` = 500 FCFA, `mise_maximale` = 100 000 FCFA,
`frais_retrait` = 1 %.

### 18. `sessions_utilisateurs`

Gère les connexions des utilisateurs et leurs appareils (y compris le jeton FCM pour le push).
Alimentée par `auth/` à chaque inscription/connexion d'un joueur (voir §2) — une table
déclarée mais jamais écrite est un défaut. `jeton_hash` contient le SHA-256 du `jti` du JWT,
jamais le jeton lui-même ; la validité de la session reste décidée par la liste blanche Redis.

| Champ | Type |
| :--- | :--- |
| `id` | UUID |
| `utilisateur_id` | UUID |
| `jeton_hash` | TEXT |
| `jeton_fcm` | TEXT |
| `appareil` | VARCHAR |
| `adresse_ip` | INET |
| `date_expiration` | TIMESTAMP |
| `date_creation` | TIMESTAMP |
| `derniere_utilisation` | TIMESTAMP |

### 19. `messages_contact`

Messages envoyés depuis le formulaire de contact du site public et traités par les
administrateurs (module `contact/`). JSON : `id`, `dateCreation`, `nom`, `email`, `sujet`,
`message`, `statut`, `utilisateurId` (omis si absent), `noteAdmin`, `dateModification`.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant |
| `nom` | VARCHAR(100) | requis, 2 caractères minimum |
| `email` | VARCHAR(255) | requis, adresse e-mail valide |
| `sujet` | VARCHAR(150) | requis, 3 caractères minimum |
| `message` | TEXT | requis, 10 à 2000 caractères |
| `statut` | VARCHAR(20) | `nouveau` (défaut) / `lu` / `traite`, indexé |
| `utilisateur_id` | UUID | nullable, indexé — renseigné si un jeton joueur valide accompagnait l'envoi (jamais un identifiant d'administrateur) |
| `note_admin` | TEXT | note interne de l'administrateur, vide par défaut |
| `date_creation` | TIMESTAMP | Date de réception |
| `date_modification` | TIMESTAMP | Dernière modification (traitement admin) |

---

### Parcours complet d'un défi

```text
1. Kader dépose 10 000 FCFA          → PAIEMENTS → PORTEFEUILLE → TRANSACTION
   Portefeuille : disponible 10 000 / bloqué 0

2. Kader crée un défi de 2 000 FCFA  → DEFIS (statut: ouvert)

3. Moussa rejoint                    → MATCH créé
   MISE Kader 2 000 + MISE Moussa 2 000 → 4 000 FCFA bloqués (escrow)

4. Ils jouent : Kader 3 - 1 Moussa

5. Kader déclare 3-1               → RESULTATS_DECLARES (manche 1)
   MATCH reste en_cours + échéance « confirmation » (delai_confirmation_minutes)
   Moussa reçoit en direct match.score_propose : « Confirmer 1-3 » ou « Proposer un autre score »

6. Moussa confirme (POST /confirmation, sans corps — le serveur écrit la déclaration miroir)
   → MATCH (gagnant: Kader, statut: termine)  ← RÈGLEMENT IMMÉDIAT, ni preuve ni arbitre

7. Règlement (commission 10 %) :
   Total mises 4 000 → commission 400 → gain Kader 3 600
   MISE Kader → gagnee · MISE Moussa → perdue
   Événements : match.score_confirme, match.termine, portefeuille.maj, transaction.creee

Variantes de la machine à états
   a. Moussa ne répond pas → à l'échéance, le score déclaré fait foi : victoire à Kader, payé.
   b. Moussa déclare un score différent → MATCH: preuve_requise (échéance « preuve »).
      Les deux preuves déposées (ou l'échéance) → LITIGE → arbitre → paiement/remboursement.
   c. Les deux déclarent un nul → MATCH: nul_en_attente (échéance « choix_nul »).
      rejouer + rejouer  → manche 2, AUCUN mouvement d'argent, escrow intact.
      sinon (choix opposés ou échéance) → partage : chacun 1 800, la plateforme garde 400.
```

---

### Conclusion

Ces 18 tables sont suffisantes pour démarrer le développement du backend, du mobile et du
back-office de QUI PERD. Les futures fonctionnalités (classement, amis, chat, parrainage,
récompenses, tournois…) pourront être ajoutées ensuite sans remettre en cause ce cœur de
données.

Le point à traiter avec le plus de rigueur n'est pas le nombre de tables, mais **le moteur de
mise/escrow et ses transactions atomiques** (§5) : un montant ne doit jamais pouvoir être
simultanément disponible, bloqué et payé, et un même match ne doit jamais déclencher deux
paiements.
