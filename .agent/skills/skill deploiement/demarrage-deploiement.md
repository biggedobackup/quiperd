# Déploiement de la plateforme QUI PERD (serveur Debian)

Je souhaite que vous déployiez le backend et le frontend web de **QUI PERD** sur un serveur
Debian en utilisant la compétence définie dans ce fichier : création de l'arborescence
serveur, configuration, SSL, déploiement complet, puis tests réels de bout en bout.

> Ce fichier déploie ce que décrivent
> [`../skill dev/demarrage-backend.md`](../skill%20dev/demarrage-backend.md) et
> [`../skill dev/demarrage-web.md`](../skill%20dev/demarrage-web.md) — il ne redéfinit ni
> routes, ni modèle de données, ni stack applicative, il les met en production. **Hors scope :**
> la publication de l'app mobile (`../skill dev/demarrage-mobile.md`) sur les stores Android/iOS
> ne passe pas par ce serveur — c'est un circuit de distribution séparé.

## Équipe d'agents

Vous mettrez en place une équipe d'agents composée de :

- **Un chef d'équipe** : chargé de déléguer les tâches aux sous-agents
- **Des agents de provisioning** : préparation du serveur (paquets, utilisateur, pare-feu,
  Docker)
- **Des agents de configuration** : `Caddyfile`, `docker-compose.yml` de production, `.env` de
  production, DNS
- **Des agents de déploiement** : build des images, migrations, mise en ligne
- **Des agents de test** : santé des services, certificat SSL, parcours HTTP réels,
  restauration de sauvegarde

## Processus de déploiement

- Chaque étape (provisioning, configuration, déploiement) est **vérifiée avant de passer à la
  suivante** — jamais de config Caddy non testée, jamais de service démarré sans vérifier son
  `healthcheck`.
- En cas d'**erreur**, l'agent principal en est informé, puis **redélègue** à l'agent
  approprié ; ce cycle se répète jusqu'à ce que le déploiement soit entièrement validé.
- **Jamais de secret en clair dans un dépôt git**, jamais de désactivation d'une protection
  (pare-feu, TLS, en-têtes de sécurité) pour simplement faire disparaître une erreur — même
  règle que
  [`../skill de securité/securité et perfomance.md`](../skill%20de%20securité/securité%20et%20perfomance.md)
  étape 3.
- À la fin : un **rapport de déploiement** est produit (services actifs, URL, résultat des
  tests, sauvegardes programmées).

# Guide de Déploiement — QUI PERD (Serveur Debian)

---

## 1. Prérequis serveur & durcissement de base

- **Debian 12 (bookworm)** ou plus récent, à jour (`apt update && apt upgrade -y`).
- Utilisateur non-root dédié (ex. `deploiement`) avec `sudo` ; connexion SSH root désactivée,
  authentification par mot de passe désactivée (clé publique uniquement).
- Pare-feu `ufw` : seuls les ports **22** (SSH — idéalement sur un port non standard ou
  restreint par IP), **80** et **443** sont ouverts. PostgreSQL, Redis et le backend Go ne sont
  **jamais exposés publiquement** — uniquement accessibles via le réseau interne Docker.
- `fail2ban` actif sur le service SSH.
- Mises à jour de sécurité automatiques (`unattended-upgrades`).
- Horloge synchronisée (`systemd-timesyncd`) — une dérive d'horloge invalide les JWT et les
  certificats TLS.
- **Docker Engine + le plugin Docker Compose**, installés depuis le dépôt officiel Docker
  (jamais le paquet `docker.io` de Debian, obsolète).

---

## 2. Arborescence sur le serveur

```text
/opt/qui-perd/
├── docker-compose.yml          # production — backend, postgres, redis, web, caddy
├── .env                        # secrets de production — chmod 600, jamais commité
├── Caddyfile
├── backend/                    # code ou image buildée du dépôt backend
│   └── public/preuves/         # volume monté — stockage des preuves de match
├── web/                        # code ou image buildée du dépôt web (TanStack Start)
├── data/
│   ├── postgres/                # volume de données PostgreSQL
│   └── redis/                   # volume de persistance Redis (AOF)
├── backups/
│   ├── postgres/                 # dumps quotidiens (pg_dump)
│   └── preuves/                  # archive du dossier des preuves de match
└── logs/                        # logs applicatifs si non centralisés via `docker logs`
```

- Propriétaire de `/opt/qui-perd/` : l'utilisateur de déploiement, jamais `root` pour l'usage
  courant.
- `.env` en `chmod 600` — lisible uniquement par cet utilisateur.

---

## 3. Configuration Caddy & SSL

Caddy est déjà le reverse proxy choisi dans `demarrage-backend.md` — **SSL automatique via
Let's Encrypt, aucune action manuelle** (pas de `certbot`, pas de renouvellement à planifier).

- **DNS** (à faire avant le déploiement, propagation à prévoir) : un enregistrement `A` pour le
  domaine du site (`quiperd.com`, à remplacer par le domaine réel) → IP du serveur, et un pour
  `api.quiperd.com` → même IP. Le backend est sur un sous-domaine dédié pour que les callbacks
  LigdiCash/MoneyFusion et les uploads de preuves aient une origine stable, distincte du site.
- **Note d'architecture** : cette séparation en deux origines est ce qui impose le CORS
  documenté dans `demarrage-backend.md` §1. Une alternative existe (un seul domaine, Caddy qui
  route `/api/*` vers le backend et le reste vers le web — donc plus de CORS du tout) ; elle
  n'a pas été retenue pour l'instant pour ne pas modifier une architecture déjà actée, mais
  reste une simplification possible à envisager plus tard.

Exemple de `Caddyfile` (à adapter au domaine réel) :

```caddyfile
quiperd.com {
    reverse_proxy web:3000
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}

api.quiperd.com {
    reverse_proxy backend:8080
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        -Server
    }
    # Les preuves de match ne sont JAMAIS servies en chemin statique direct par Caddy —
    # uniquement via la route backend protégée (voir demarrage-backend.md §1).
}
```

Caddy obtient et renouvelle seul le certificat dès que le DNS pointe vers le serveur et que les
ports 80/443 sont ouverts. Après déploiement, vérifier qu'aucun avertissement de certificat
n'apparaît dans un navigateur et qu'aucune négociation TLS 1.0/1.1 n'est possible (désactivées
par défaut dans Caddy — ne jamais les réactiver).

### 3 bis. Le WebSocket derrière Caddy et le tunnel Cloudflare

Le temps réel (`demarrage-backend.md` §5 bis) ajoute une contrainte d'infrastructure : le
navigateur **ne peut pas** faire passer un WebSocket par une server function TanStack, il joint
le backend directement. Quatre points, tous vérifiés en production, **à ne pas défaire** :

1. **`/api/temps-reel` est servi depuis l'origine DU SITE**, en plus de celle de l'API. Le
   socket a alors la même origine que la page : aucune requête inter-site, donc aucun risque de
   détournement (CSWSH) et aucune origine supplémentaire à déclarer. Seuls les chemins **exacts**
   `/api/temps-reel` et `/api/temps-reel/` sont routés — les matchers de chemin Caddy sont exacts
   sans joker, donc `/api/temps-reel/ticket` n'est **pas** exposé sur l'origine du site : il est
   appelé côté serveur par le site, avec le jeton Bearer.
2. **`flush_interval -1`** sur la route du socket : sans lui, Caddy met les trames en tampon et
   le « direct » arrive par paquets. Et **`encode` reste dans les blocs `handle` des routes HTTP
   ordinaires** — jamais sur la route du socket : une trame WebSocket n'a rien à faire dans un
   flux compressé. Caddy relaie `Upgrade` / `Connection` de lui-même : ne pas les recopier.
3. **Aucun `read_timeout` / `write_timeout` dans le bloc global `servers`.** Caddy est sans
   limite par défaut ; en poser un couperait les sockets en pleine partie.
4. **Ping de 30 s côté backend obligatoire** : Cloudflare ferme un WebSocket inactif au bout de
   **100 s**. Le battement de cœur du serveur (ping 30 s / fermeture après 60 s sans pong) est ce
   qui garde le tunnel ouvert ; le baisser ou le retirer produit des déconnexions inexpliquées
   toutes les ~100 s, visibles seulement en production.

```caddyfile
{
    servers { trusted_proxies static private_ranges }   # aucun read_timeout / write_timeout
}

quiperd.com {
    @socket path /api/temps-reel /api/temps-reel/
    handle @socket {
        reverse_proxy backend:8080 { flush_interval -1 }
    }
    handle {
        encode gzip zstd
        reverse_proxy web:3000
    }
}
```

**Variables d'environnement du temps réel :**

| Variable | Qui la lit | Valeur |
| :--- | :--- | :--- |
| `WS_PUBLIC_URL` | le **site** (conteneur `web`) | `$SITE_URL/api/temps-reel` — l'adresse que le **navigateur** ouvre. Sans elle, le site donnerait au navigateur `http://backend:8080/api`, un nom interne à Docker qu'il ne sait pas résoudre : le socket ne s'ouvre jamais et l'application retombe silencieusement sur un état figé. Le site convertit `http://` en `ws://` et `https://` en `wss://` tout seul |
| `WS_ORIGINES_AUTORISEES` | le **backend** | origines admises **en plus** de `CORS_ORIGIN`. Vide convient tant que le site n'est joint que par `SITE_URL`. Ne jamais la remplacer par un `CheckOrigin` permissif |

Le script de déploiement pose `WS_PUBLIC_URL` d'après `SITE_URL` si elle est absente, pour
migrer une installation antérieure au temps réel sans retoucher son `.env` à la main.

---

## 4. Variables d'environnement de production

- `.env` généré à partir de `.env.example` — jamais copié tel quel, chaque secret régénéré :
  `JWT_SECRET` (aléatoire, 32+ octets), identifiants PostgreSQL/Redis, `LIGDICASH_API_KEY` /
  `LIGDICASH_API_TOKEN`, `FUSIONMONEY_API_URL`,
  `LIGDICASH_CALLBACK_URL=https://api.quiperd.com/api/paiements/callback-ligdicash`,
  `CORS_ORIGIN=https://quiperd.com`.
- Si un secret a pu fuiter (log, capture d'écran, dépôt rendu public par erreur), il est
  **régénéré immédiatement**, jamais laissé "au cas où".
- Vérifier que `.env`, `Caddyfile` avec secrets éventuels, et `data/` sont dans le
  `.gitignore` du dépôt de déploiement s'il est versionné.

---

## 5. Déploiement

1. `git pull` sur le dépôt de déploiement (ou récupération d'une image déjà buildée en CI).
2. `docker compose build`.
3. `docker compose up -d` — les migrations `GORM AutoMigrate` s'exécutent automatiquement au
   démarrage de `main.go` (voir `demarrage-backend.md` §6), pas d'étape séparée nécessaire.
4. `docker compose ps` : tous les services doivent apparaître `healthy`, pas seulement
   `running`.
5. **Ordre de démarrage** géré par `depends_on` + `healthcheck` dans `docker-compose.yml` :
   PostgreSQL et Redis prêts avant le démarrage du backend.
6. **Rollback** : conserver le tag de la version précédente de chaque image ; en cas de
   problème, `docker compose up -d` avec l'ancien tag rétablit l'état précédent en quelques
   secondes.

Exemple de `docker-compose.yml` (extrait, healthchecks inclus) :

```yaml
services:
  postgres:
    image: postgres:18
    environment:
      POSTGRES_DB: qui_perd
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    command: redis-server --appendonly yes
    volumes:
      - ./data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    volumes:
      - ./backend/public/preuves:/app/public/preuves
    env_file: .env
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/api/sante"]
      interval: 15s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }

  web:
    build: ./web
    depends_on:
      backend: { condition: service_healthy }
    env_file: .env
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }

  caddy:
    image: caddy:2
    depends_on: [backend, web]
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  caddy_data:
```

---

## 6. Tests post-déploiement (obligatoires, réels — jamais simulés)

- `GET https://api.quiperd.com/api/sante` → `200`, confirme PostgreSQL + Redis.
- Parcours HTTP complet en conditions réelles : inscription, connexion, création d'un défi, un
  second compte qui rejoint, déclaration + preuve des deux côtés, validation, dépôt et retrait
  (en mode sandbox du prestataire si disponible).
- `https://quiperd.com` et `https://api.quiperd.com` répondent en HTTPS sans aucun avertissement
  de certificat.
- En-têtes de sécurité présents sur les deux origines (HSTS, `X-Content-Type-Options`,
  `X-Frame-Options` côté web).
- PostgreSQL (5432) et Redis (6379) **injoignables depuis l'extérieur du serveur** — vérifier
  depuis une machine externe (`nc -zv <ip> 5432`, doit échouer).
- `https://api.quiperd.com/preuves/...` (chemin statique direct) renvoie `404` — seule la route
  backend protégée sert les fichiers de preuve.
- **Temps réel** (§3 bis) : ouvrir le site, vérifier que l'indicateur passe à « en direct »,
  qu'une action faite dans un second navigateur (créer un défi, déclarer un score) apparaît
  **sans rechargement**, et laisser la page ouverte **plus de 3 minutes** pour confirmer que le
  socket survit à la coupure Cloudflare des 100 s. Vérifier aussi qu'un événement produit par le
  **worker Asynq** (expiration d'un défi, échéance d'un match) atteint bien le navigateur :
  c'est ce qui prouve que la diffusion Redis Pub/Sub inter-process fonctionne en production.
  `https://quiperd.com/api/temps-reel/ticket` doit répondre `404` (le ticket n'est pas exposé
  sur l'origine du site).
- Envoi d'un paiement de test (sandbox si disponible) et vérification que le prestataire atteint
  bien `https://api.quiperd.com/api/paiements/callback-ligdicash` (ou `-fusion`) — ces routes ne
  peuvent pas être testées en local (voir `api_paiement_skill_ligdicash.md` §"Dev local sans
  callback public").
- Connexion admin testée séparément de la connexion joueur (`(admin)/connexion.tsx` vs
  `(public)/connexion.tsx`, voir `demarrage-web.md` §3.3).
- **Restauration réelle** d'une sauvegarde PostgreSQL sur un environnement de test — une
  sauvegarde qui existe mais ne s'est jamais restaurée n'est pas une sauvegarde fiable.

---

## 7. Sauvegardes & supervision

- `pg_dump` quotidien (cron ou timer systemd) vers `backups/postgres/`, rotation locale (ex. 14
  jours) **et copie hors-site** (stockage S3-compatible externe ou `rsync` vers un autre
  serveur) — jamais uniquement sur le disque qui héberge la donnée source.
- Archive régulière de `public/preuves/` : ce sont des pièces potentiellement nécessaires en cas
  de litige, elles ne doivent jamais être perdues.
- Rotation des logs Docker (`max-size`/`max-file`, voir l'exemple `docker-compose.yml` §5) pour
  éviter de saturer le disque.
- Alerte (email ou Slack) sur : échec de sauvegarde, conteneur qui redémarre en boucle, jobs
  Asynq en échec répété (`paiement:reverification`, `defi:expiration`, `match:echeance` — une
  échéance de match qui n'est pas traitée bloque de l'argent en escrow), certificat Caddy qui ne
  se renouvelle pas.
- **Un seul worker Asynq par file Redis.** Deux versions du binaire vivantes en même temps (un
  ancien conteneur non arrêté, un binaire lancé à la main pendant un test) font consommer les
  tâches par un process qui n'a pas le handler correspondant : Asynq les met en échec avec un
  backoff silencieux et l'échéance « ne part jamais ». Après un déploiement, vérifier
  `docker compose ps` : un seul conteneur `backend`/`worker` en cours d'exécution.

---

## 8. Sécurité serveur (rappel)

Ce déploiement applique concrètement
[`../skill de securité/securité et perfomance.md`](../skill%20de%20securité/securité%20et%20perfomance.md)
§4 (Serveur Web) : HTTPS obligatoire, HSTS, suppression des en-têtes `Server`/`X-Powered-By`,
protection de `.env` et `.git`, désactivation du directory listing, rate limiting.

- `ufw` + `fail2ban` couvrent l'accès SSH (§1) ; ajouter un rate limiting au niveau Caddy sur
  `/api/auth/connexion` et `/api/auth/admin/connexion` (protection brute-force en complément du
  rate limiting applicatif déjà prévu côté backend).
- Aucun mode de test/simulateur de paiement ne reste actif en production (voir
  `api_paiement_skill_FusionMoney.md` §5 : « Désactiver les points d'entrée du mode mock »).
