# syntax=docker/dockerfile:1
# Défis en Ligne — image du backend Go. Binaire statique (CGO désactivé), image finale Alpine minimale.
# Construit par docker compose (deploy/docker-compose.yml) depuis ~/dev/backend.

# Étiquette de version MINEURE volontairement flottante (1.26, pas 1.26.0) : chaque
# reconstruction récupère le dernier correctif de la bibliothèque standard. C'est ce qui
# ferme les failles `crypto/x509` et consorts sans changer une ligne de code
# (`govulncheck` les signale sur un binaire compilé avec un Go trop ancien).
FROM golang:1.26-alpine AS build
WORKDIR /src
# Dépendances d'abord : couche mise en cache tant que go.mod / go.sum ne changent pas.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /defisenligne-backend .

FROM alpine:3.21
# ca-certificates : appels HTTPS vers les prestataires de paiement ; tzdata : fuseaux ;
# wget (busybox) : healthcheck. L'utilisateur d'exécution est fixé par docker compose (user:).
RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app
COPY --from=build /defisenligne-backend /app/defisenligne-backend
# Dossier des preuves : monté en volume par docker compose (./preuves:/app/public/preuves).
RUN mkdir -p /app/public/preuves && chmod 777 /app/public/preuves
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/sante >/dev/null || exit 1
ENTRYPOINT ["/app/defisenligne-backend"]
