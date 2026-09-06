#!/usr/bin/env bash
# QUI PERD — crée ~/production (données PostgreSQL et Redis, preuves, sauvegardes), génère
# ~/production/.env avec des secrets aléatoires et programme la sauvegarde nocturne (crontab).
# Ne remplace JAMAIS un .env existant. Sans sudo.
#
# Variables optionnelles :
#   QUIPERD_RACINE          racine des dossiers dev/ et production/ (défaut : $HOME)
#   QUIPERD_SITE_URL        origine publique du site (défaut : http://172.17.18.42)
#   QUIPERD_API_PUBLIC_URL  origine publique de l'API, sans /api (défaut : http://172.17.18.42:8080)
set -euo pipefail

RACINE="${QUIPERD_RACINE:-$HOME}"
DEV="$RACINE/dev"
PROD="$RACINE/production"
SITE_URL="${QUIPERD_SITE_URL:-http://172.17.18.42}"
API_PUBLIC_URL="${QUIPERD_API_PUBLIC_URL:-http://172.17.18.42:8080}"

# Chaîne aléatoire alphanumérique de N caractères (aucune commande interrompue par SIGPIPE).
aleatoire() {
  local s=""
  while [ "${#s}" -lt "$1" ]; do
    s="$s$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
  done
  printf '%s' "${s:0:$1}"
}

mkdir -p "$PROD/data/postgres" "$PROD/data/redis" "$PROD/preuves" "$PROD/sauvegardes/postgres"
chmod 700 "$PROD"

ENV_PROD="$PROD/.env"
if [ -f "$ENV_PROD" ]; then
  echo "Conservé : $ENV_PROD (déjà présent, secrets inchangés)"
else
  DB_PASSWORD="$(aleatoire 32)"
  REDIS_PASSWORD="$(aleatoire 32)"
  JWT_SECRET="$(aleatoire 64)"
  ADMIN_MDP="$(aleatoire 16)"
  umask 077
  cat > "$ENV_PROD" <<EOF
# === QUI PERD — production (Docker Compose) — généré le $(date '+%Y-%m-%d %H:%M') par preparer-production.sh ===
# Lu par docker compose (variables \${…} de docker-compose.yml) et injecté dans le conteneur backend.
# Fichier secret : chmod 600, jamais dans git. Après modification : ~/dev/deploy/serveur/deployer.sh

# --- Déploiement (mis à jour automatiquement par deployer.sh) ---
QUIPERD_DEV=$DEV
QUIPERD_UID=$(id -u)
QUIPERD_GID=$(id -g)
QUIPERD_VERSION=latest
COMPOSE_PROFILES=

# --- Lien public : Cloudflare Tunnel ---
# Tunnel nommé (votre domaine, URL stable) : coller le jeton créé dans Cloudflare Zero Trust
# (Networks > Tunnels > Create a tunnel > Cloudflared), puis relancer deployer.sh.
CLOUDFLARE_TUNNEL_TOKEN=
# Sans jeton : tunnel rapide gratuit, URL aléatoire *.trycloudflare.com (change à chaque redémarrage). oui / non
QUIPERD_TUNNEL_RAPIDE=oui

# --- Site web ---
# Origine publique du site. Avec un tunnel nommé : https://votre-domaine
SITE_URL=$SITE_URL

# --- Backend ---
APP_ENV=production
APP_HOST=
APP_PORT=8080
# Origine publique du site (pages de retour des paiements : /portefeuille?paiement=…)
APP_BASE_URL=$SITE_URL
CORS_ORIGIN=$SITE_URL

# PostgreSQL (conteneur « postgres », base créée au premier démarrage avec ces valeurs)
DB_HOST=postgres
DB_PORT=5432
DB_USER=quiperd
DB_PASSWORD=$DB_PASSWORD
DB_NAME=qui_perd
DB_SSLMODE=disable
DB_TIMEZONE=UTC

# Redis (conteneur « redis »)
REDIS_ADDR=redis:6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_DB=0

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRATION_HEURES=72

# Preuves de match : volume ./preuves monté dans le conteneur sur /app/public/preuves
STOCKAGE_PREUVES_DIR=public/preuves
UPLOAD_MAX_MO=50

# Compte administrateur créé au premier démarrage (changer le mot de passe après la première connexion)
SEED_ADMIN_NOM=Administrateur
SEED_ADMIN_EMAIL=admin@quiperd.local
SEED_ADMIN_MOTDEPASSE=$ADMIN_MDP

# Paiement — LigdiCash (clés à renseigner). Avec un tunnel nommé : callbacks en https://api.votre-domaine/…
LIGDICASH_API_KEY=
LIGDICASH_API_TOKEN=
LIGDICASH_BASE_URL=https://app.ligdicash.com/pay/v01
LIGDICASH_CALLBACK_URL=$API_PUBLIC_URL/api/paiements/callback-ligdicash

# Paiement — MoneyFusion (URL sans www.)
FUSIONMONEY_API_URL=
FUSIONMONEY_CALLBACK_URL=$API_PUBLIC_URL/api/paiements/callback-fusion

# Prestataires actifs (csv)
PAIEMENT_PRESTATAIRES=ligdicash,fusionmoney

# Firebase Cloud Messaging (push)
FCM_ACTIF=false
FCM_CREDENTIALS_FILE=
EOF
  echo "Créé : $ENV_PROD"
fi
chmod 600 "$ENV_PROD"

if command -v crontab >/dev/null 2>&1; then
  LIGNE="15 3 * * * $DEV/deploy/serveur/sauvegarder.sh >> $PROD/sauvegardes/journal.log 2>&1"
  if crontab -l 2>/dev/null | grep -Fq 'deploy/serveur/sauvegarder.sh'; then
    echo "Sauvegarde nocturne déjà programmée (crontab)"
  else
    { crontab -l 2>/dev/null || true; echo "$LIGNE"; } | crontab -
    echo "Sauvegarde nocturne programmée à 03h15 (crontab)"
  fi
else
  echo "crontab absent : sauvegarde nocturne non programmée (sudo installer-docker.sh installe cron)"
fi

echo
echo "Arborescence prête sous $PROD :"
find "$PROD" -maxdepth 2 -not -path '*/data/*/*' -not -path '*/preuves/*' | sort | sed 's|^|  |'
echo
echo "Mot de passe admin initial : SEED_ADMIN_MOTDEPASSE dans $ENV_PROD (e-mail admin@quiperd.local)"
echo "Étape suivante : $DEV/deploy/serveur/deployer.sh"
