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
```

- Conteneurs : `postgres` (18), `redis` (7), `backend` (Go, image Alpine), `web` (TanStack Start
  servi par bun), `caddy` (reverse proxy), `cloudflared` **ou** `tunnel-rapide` (lien public).
- Seuls les ports 80 et 8080 du serveur sont publiés, sur le réseau local. Rien n'est ouvert vers
  Internet : le lien public passe par un tunnel sortant vers Cloudflare, qui termine le HTTPS.
- Le site sait s'il est visité en HTTPS (tunnel) ou en HTTP (réseau local) grâce à
  `X-Forwarded-Proto` transmis par Caddy : les cookies de session prennent `Secure` uniquement en HTTPS.
- Images étiquetées par révision git (`quiperd-backend:<rev>`, `quiperd-web:<rev>`) : retour arrière
  en une commande (voir plus bas).

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
