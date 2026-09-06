#!/usr/bin/env bash
# QUI PERD — déploiement : construit les images depuis ~/dev, met à jour ~/production
# (docker-compose.yml, Caddyfile, version déployée, tunnel), relance la pile Docker et vérifie
# qu'elle répond réellement. À lancer en tant qu'utilisateur de déploiement (groupe docker), sans sudo.
#
# Usage : deployer.sh [--pull] [--backend] [--frontend]
#   sans option      backend + site, sans git pull
#   --pull           git pull --ff-only dans ~/dev avant de construire
#   --backend        ne reconstruit que le backend
#   --frontend       ne reconstruit que le site
set -euo pipefail

RACINE="${QUIPERD_RACINE:-$HOME}"
DEV="$RACINE/dev"
PROD="$RACINE/production"

PULL=0
FAIRE_BACKEND=0
FAIRE_FRONTEND=0
for arg in "$@"; do
  case "$arg" in
    --pull) PULL=1 ;;
    --backend) FAIRE_BACKEND=1 ;;
    --frontend) FAIRE_FRONTEND=1 ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg (voir --help)" >&2; exit 2 ;;
  esac
done
if [ "$FAIRE_BACKEND" -eq 0 ] && [ "$FAIRE_FRONTEND" -eq 0 ]; then
  FAIRE_BACKEND=1
  FAIRE_FRONTEND=1
fi

etape() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
erreur() { echo "Erreur : $*" >&2; exit 1; }

[ -f "$PROD/.env" ] || erreur "$PROD/.env introuvable : lancez d'abord preparer-production.sh"
[ -d "$DEV/.git" ] || erreur "$DEV n'est pas un clone git"
docker info >/dev/null 2>&1 || erreur "Docker inaccessible : sudo installer-docker.sh, puis ouvrir une nouvelle session SSH (groupe docker)"

if [ "$PULL" -eq 1 ]; then
  etape "git pull ($DEV)"
  git -C "$DEV" pull --ff-only
fi
REVISION="$(git -C "$DEV" rev-parse --short HEAD)"
DEBUT=$(date +%s)

etape "Configuration de $PROD (révision $REVISION)"
cp "$DEV/deploy/docker-compose.yml" "$PROD/docker-compose.yml"
cp "$DEV/deploy/Caddyfile" "$PROD/Caddyfile"
cd "$PROD"
lire_env() { grep -E "^$1=" .env | head -n1 | cut -d= -f2-; }
definir_env() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}
definir_env QUIPERD_DEV "$DEV"
definir_env QUIPERD_VERSION "$REVISION"
if [ -n "$(lire_env CLOUDFLARE_TUNNEL_TOKEN)" ]; then
  PROFIL=tunnel
elif [ "$(lire_env QUIPERD_TUNNEL_RAPIDE)" = "oui" ]; then
  PROFIL=tunnel-rapide
else
  PROFIL=
fi
definir_env COMPOSE_PROFILES "$PROFIL"
echo "Lien public : ${PROFIL:-aucun tunnel}"

SERVICES=()
if [ "$FAIRE_BACKEND" -eq 1 ]; then SERVICES+=(backend); fi
if [ "$FAIRE_FRONTEND" -eq 1 ]; then SERVICES+=(web); fi
etape "Construction des images : ${SERVICES[*]}"
docker compose build --pull "${SERVICES[@]}"
# Étiquettes : la révision construite devient « latest » ; un service non reconstruit garde son
# image « latest » sous la nouvelle révision (docker-compose.yml référence quiperd-*:REVISION).
for s in backend web; do
  if printf '%s\n' "${SERVICES[@]}" | grep -qx "$s"; then
    docker tag "quiperd-$s:$REVISION" "quiperd-$s:latest"
  elif docker image inspect "quiperd-$s:latest" >/dev/null 2>&1; then
    docker tag "quiperd-$s:latest" "quiperd-$s:$REVISION"
  else
    erreur "image quiperd-$s:latest absente : lancez un déploiement complet (sans --backend / --frontend)"
  fi
done

etape "Mise en ligne (docker compose up)"
# Le tunnel non retenu est arrêté s'il tournait encore (changement de profil).
for t in cloudflared tunnel-rapide; do
  case "$PROFIL:$t" in
    tunnel:cloudflared | tunnel-rapide:tunnel-rapide) ;;
    *) docker compose --profile tunnel --profile tunnel-rapide rm -sf "$t" >/dev/null 2>&1 || true ;;
  esac
done
if ! docker compose up -d --remove-orphans --wait --wait-timeout 300; then
  docker compose ps
  docker compose logs --tail 60 backend web caddy
  erreur "un service n'est pas passé « healthy » (journaux ci-dessus)"
fi

etape "Vérifications réelles"
SANTE="$(curl -fsS --max-time 10 http://127.0.0.1:8080/api/sante)" || erreur "API : http://127.0.0.1:8080/api/sante ne répond pas"
echo "API  : $SANTE"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 http://127.0.0.1/)"
[ "$CODE" = "200" ] || erreur "site : HTTP $CODE sur http://127.0.0.1/"
echo "Site : HTTP $CODE sur http://127.0.0.1/"
if [ "$PROFIL" = "tunnel-rapide" ]; then
  URL=""
  for _ in $(seq 1 20); do
    URL="$(docker compose logs tunnel-rapide 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n1 || true)"
    if [ -n "$URL" ]; then break; fi
    sleep 2
  done
  echo "Lien public (tunnel rapide, change à chaque redémarrage) : ${URL:-introuvable dans les journaux → docker compose logs tunnel-rapide}"
elif [ "$PROFIL" = "tunnel" ]; then
  echo "Lien public : les noms d'hôte définis dans Cloudflare Zero Trust (état : docker compose logs cloudflared)"
fi

docker image prune -f >/dev/null 2>&1 || true
printf 'révision %s\ndate %s\n' "$REVISION" "$(date '+%Y-%m-%d %H:%M:%S')" > VERSION
etape "Déploiement terminé en $(( $(date +%s) - DEBUT )) s (révision $REVISION)"
docker compose ps
