#!/usr/bin/env bash
# QUI PERD — sauvegarde PostgreSQL (format custom, restaurable avec pg_restore) et archive des
# preuves de match dans ~/production/sauvegardes. Rétention 14 jours. Lancé chaque nuit par la
# crontab posée par preparer-production.sh ; peut aussi être lancé à la main.
#
# Restaurer : docker compose exec -T postgres pg_restore -U quiperd -d qui_perd --clean --no-owner < fichier.dump
set -euo pipefail

RACINE="${QUIPERD_RACINE:-$HOME}"
PROD="$RACINE/production"
RETENTION_JOURS="${RETENTION_JOURS:-14}"
cd "$PROD"

lire() { grep -E "^$1=" .env | head -n1 | cut -d= -f2-; }
DB_USER="$(lire DB_USER)"
DB_NAME="$(lire DB_NAME)"
HORODATAGE="$(date +%Y%m%d-%H%M)"
mkdir -p sauvegardes/postgres

DUMP="sauvegardes/postgres/qui_perd-$HORODATAGE.dump"
docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --format=custom > "$DUMP"
echo "$(date '+%Y-%m-%d %H:%M:%S') PostgreSQL : $DUMP ($(du -h "$DUMP" | cut -f1))"

if [ -d preuves ]; then
  ARCHIVE="sauvegardes/preuves-$HORODATAGE.tar.gz"
  tar -czf "$ARCHIVE" preuves
  echo "$(date '+%Y-%m-%d %H:%M:%S') Preuves : $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
fi

find sauvegardes/postgres -name 'qui_perd-*.dump' -mtime +"$RETENTION_JOURS" -delete
find sauvegardes -maxdepth 1 -name 'preuves-*.tar.gz' -mtime +"$RETENTION_JOURS" -delete
