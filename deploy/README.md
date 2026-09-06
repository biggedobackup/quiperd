# Déploiement de QUI PERD sur le serveur

Serveur : Debian 12 (`172.17.18.42`), utilisateur `adminika`, Docker Compose. Deux dossiers dans
son répertoire personnel :

| Dossier                     | Contenu                                                                                                        |
|-----------------------------|----------------------------------------------------------------------------------------------------------------|
| `/home/adminika/dev`        | Clone git du dépôt (branche `main`). C'est ici qu'on modifie le code, qu'on commit et qu'on pousse sur GitHub.  |
| `/home/adminika/production` | Ce qui tourne : `docker-compose.yml`, `Caddyfile`, `.env` (secrets), données PostgreSQL et Redis, preuves uploadées, sauvegardes. |

Rien ne s'exécute depuis `dev` : `deployer.sh` construit les images **à partir de `dev`** et les met en
ligne **dans `production`**. Les fichiers `docker-compose.yml` et `Caddyfile` de `production` sont des
copies de ceux de `deploy/` (versionnés) ; seul `.env` est propre au serveur.

## Architecture

```text
Internet ──HTTPS──► Cloudflare ──tunnel──► cloudflared ──► caddy :80 ──► web :3000 ──► backend :8080
Réseau local ──HTTP──► caddy :80 (site)  /  caddy :8080 (API : appli mobile, Swagger /api/docs)
                                                              backend ──► postgres :5432, redis :6379

Temps réel : navigateur ══WSS══► Cloudflare ══► caddy :80 /api/temps-reel ══► backend :8080
```

- Conteneurs : `postgres` (18), `redis` (7), `backend` (Go, image Alpine), `web` (TanStack Start
  servi par bun), `caddy` (reverse proxy), `cloudflared` **ou** `tunnel-rapide` (lien public).
- Seuls les ports 80 et 8080 du serveur sont publiés, sur le réseau local. Rien n'est ouvert vers
  Internet : le lien public passe par un tunnel sortant vers Cloudflare, qui termine le HTTPS.
- Le site sait s'il est visité en HTTPS (tunnel) ou en HTTP (réseau local) grâce à
  `X-Forwarded-Proto` transmis par Caddy : les cookies de session prennent `Secure` uniquement en HTTPS.
- Images étiquetées par révision git (`quiperd-backend:<rev>`, `quiperd-web:<rev>`) : retour arrière
  en une commande (voir plus bas).

### Le socket temps réel traverse bien la chaîne

Le navigateur ouvre **un seul** socket, `wss://<origine du site>/api/temps-reel`. Il ne passe pas
par une server function du site (un WebSocket ne se relaie pas ainsi) : Caddy route ce chemin exact
du port 80 vers `backend:8080`, donc le socket a la **même origine que la page**. Conséquences :

- rien de plus à ouvrir sur le pare-feu, et le **tunnel rapide** (qui n'expose que `caddy:80`)
  suffit à faire fonctionner le temps réel ;
- pas d'origine croisée, donc pas de refus par le contrôle anti-CSWSH du backend ;
- `/api/temps-reel/ticket` n'est **pas** exposé sur le port 80 : il reste appelé côté serveur par
  le site avec le jeton Bearer.

Points de vigilance déjà traités dans `Caddyfile` — ne pas les défaire :

- **aucun `read_timeout` / `write_timeout`** dans le bloc global `servers`. Caddy est sans limite
  par défaut ; en poser un couperait les sockets en pleine partie ;
- `flush_interval -1` sur la route du socket : aucune mise en tampon des trames ;
- `encode gzip zstd` est déclaré **dans** les blocs `handle` des routes HTTP ordinaires, jamais sur
  la route du socket ;
- Caddy transmet `Upgrade` et `Connection` de lui-même dès qu'il voit une réponse 101, il n'y a pas
  d'en-tête à recopier à la main (ce serait même une erreur en HTTP/2).

Côté **Cloudflare**, les WebSockets sont acceptés sur toutes les offres, tunnel nommé comme tunnel
rapide, sans réglage. Cloudflare ferme en revanche un socket resté **100 secondes sans trafic** :
le backend envoie un `ping` toutes les 30 s (et ferme au bout de 60 s sans réponse), ce qui garde
la connexion vivante. Ne pas allonger l'intervalle de ping au-delà de 60 s.

Deux variables commandent tout cela, générées par `preparer-production.sh` dans `~/production/.env` :

| Variable | Qui la lit | Valeur |
| --- | --- | --- |
| `WS_PUBLIC_URL` | le **site** (conteneur `web`) | `$SITE_URL/api/temps-reel` — l'adresse que le navigateur ouvre. Sans elle, le site donnerait au navigateur `http://backend:8080/api`, un nom interne à Docker qu'il ne sait pas résoudre. |
| `WS_ORIGINES_AUTORISEES` | le **backend** | origines admises **en plus** de `CORS_ORIGIN`. Vide convient tant que le site n'est joint que par `SITE_URL`. |

Vérification après déploiement (depuis un poste du réseau local) :

```bash
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     http://<serveur>/api/temps-reel        # attendu : HTTP/1.1 101 Switching Protocols
```

## Première installation (dans l'ordre)

```bash
sudo ~/dev/deploy/serveur/installer-docker.sh   # Docker + Compose (dépôt officiel), git, cron, fail2ban ; groupe docker
exit                                            # nouvelle session SSH pour activer le groupe docker
~/dev/deploy/serveur/preparer-production.sh     # crée ~/production, génère .env (secrets aléatoires), crontab de sauvegarde
~/dev/deploy/serveur/deployer.sh                # build des images, mise en ligne, vérifications
```

`installer-docker.sh` est le seul script qui demande `sudo`. Tous sont relançables sans risque.

## Lien public : Cloudflare Tunnel

Deux modes, choisis automatiquement par `deployer.sh` d'après `~/production/.env` :

1. **Tunnel rapide** (par défaut, `QUIPERD_TUNNEL_RAPIDE=oui`, aucun compte) : URL aléatoire
   `https://xxxx.trycloudflare.com`, affichée à la fin du déploiement et dans
   `docker compose logs tunnel-rapide`. Elle change à chaque redémarrage du conteneur : bien pour
   tester et faire essayer, pas pour une adresse durable.
2. **Tunnel nommé** (recommandé, URL stable sur votre domaine) : dans le tableau de bord Cloudflare
   Zero Trust, *Networks → Tunnels → Create a tunnel → Cloudflared*, nommer le tunnel (`quiperd`),
   copier le **jeton** et le coller dans `~/production/.env` (`CLOUDFLARE_TUNNEL_TOKEN=…`). Dans
   l'onglet *Public Hostname* du tunnel, déclarer :
   - `quiperd.votre-domaine` → type `HTTP`, URL `caddy:80` (le site) ;
   - `api.quiperd.votre-domaine` → type `HTTP`, URL `caddy:8080` (l'API, pour l'application mobile
     et les callbacks de paiement).
   Puis mettre dans `.env` : `SITE_URL=https://quiperd.votre-domaine`, `APP_BASE_URL` et
   `CORS_ORIGIN` identiques, les deux `*_CALLBACK_URL` en `https://api.quiperd.votre-domaine/api/…`,
   et relancer `deployer.sh`. Cloudflare fournit le certificat ; aucun port à ouvrir.
   Le socket temps réel suit le site : `wss://quiperd.votre-domaine/api/temps-reel`, rien à
   déclarer de plus. Si le site est joignable par plusieurs adresses (domaine **et** IP du réseau
   local, préproduction…), ajouter les origines supplémentaires dans `WS_ORIGINES_AUTORISEES`
   (liste séparée par des virgules) — sinon le backend refuse l'ouverture du socket depuis
   l'adresse non déclarée, et le site retombe en « hors ligne ».

Le jeton du tunnel est un secret : il ne va que dans `~/production/.env` (mode 600), jamais dans git.

## Mise à jour au quotidien

```bash
cd ~/dev
git pull                                   # récupérer ce qui a été poussé depuis le poste de travail
# … ou modifier directement ici, puis : git add -A && git commit -m "…" && git push
./deploy/serveur/deployer.sh               # tout reconstruire et mettre en ligne
./deploy/serveur/deployer.sh --backend     # seulement le backend
./deploy/serveur/deployer.sh --frontend    # seulement le site
./deploy/serveur/deployer.sh --pull        # git pull puis déploiement complet
```

## Exploitation

```bash
cd ~/production
docker compose ps                          # état et santé des conteneurs
docker compose logs -f backend             # journaux backend en direct (web, caddy, postgres, redis…)
docker compose restart backend             # redémarrer un service
docker compose down && docker compose up -d --wait   # tout arrêter / relancer
cat VERSION                                # révision déployée
QUIPERD_VERSION=<ancienne révision> docker compose up -d --wait   # retour arrière (images conservées)
~/dev/deploy/serveur/sauvegarder.sh        # sauvegarde à la main (sinon chaque nuit à 03h15)
docker compose exec -T postgres pg_restore -U quiperd -d qui_perd --clean --no-owner < sauvegardes/postgres/<fichier>.dump
```

Le mot de passe administrateur initial est dans `~/production/.env` (`SEED_ADMIN_MOTDEPASSE`),
e-mail `admin@quiperd.local`, connexion sur `/admin/connexion`. Les clés des prestataires de paiement
(`LIGDICASH_*`, `FUSIONMONEY_API_URL`) se renseignent dans ce même fichier, puis `deployer.sh --backend`
(ou `docker compose up -d backend` pour un simple rechargement de la configuration).
