#!/usr/bin/env bash
# QUI PERD — installation système, à lancer UNE fois avec sudo (relançable sans risque) :
#   Docker Engine + plugin Compose depuis le dépôt officiel Docker (jamais le paquet docker.io de
#   Debian), git, cron, fail2ban, unattended-upgrades ; ajoute l'utilisateur de déploiement au
#   groupe docker ; rotation des journaux Docker. C'est le seul script qui a besoin de sudo.
#
# Usage : sudo ./installer-docker.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Ce script doit être lancé avec sudo." >&2
  exit 1
fi
UTILISATEUR="${SUDO_USER:-adminika}"
export DEBIAN_FRONTEND=noninteractive

etape() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

etape "Paquets de base"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git cron fail2ban unattended-upgrades
timedatectl set-ntp true 2>/dev/null || true

etape "Docker Engine + Compose (dépôt officiel Docker)"
if docker compose version >/dev/null 2>&1; then
  echo "Déjà installé : $(docker --version) · $(docker compose version)"
else
  if dpkg -l docker.io 2>/dev/null | grep -q '^ii'; then
    echo "Le paquet Debian docker.io est installé : il est remplacé par docker-ce (dépôt officiel)."
    apt-get remove -y -q docker.io docker-doc docker-compose podman-docker containerd runc 2>/dev/null || true
  fi
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  echo "Installé : $(docker --version) · $(docker compose version)"
fi

if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
EOF
  systemctl restart docker
fi
systemctl enable --now docker cron fail2ban >/dev/null

etape "Utilisateur de déploiement"
usermod -aG docker "$UTILISATEUR"
echo "$UTILISATEUR ajouté au groupe docker (actif à sa prochaine connexion SSH)"

etape "Résumé"
docker --version
docker compose version
systemctl is-active docker fail2ban cron | paste -sd' ' | sed 's|^|docker fail2ban cron : |'
echo
echo "Étape suivante, en tant que $UTILISATEUR dans une NOUVELLE session SSH :"
echo "  ~/dev/deploy/serveur/preparer-production.sh   puis   ~/dev/deploy/serveur/deployer.sh"
