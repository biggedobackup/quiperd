# syntax=docker/dockerfile:1
# QUI PERD — image du site web (TanStack Start + Nitro, servi par bun).
# Construit par docker compose (deploy/docker-compose.yml) depuis ~/dev/frontend.

FROM oven/bun:1 AS build
WORKDIR /src
# Dépendances d'abord : couche mise en cache tant que package.json / bun.lock ne changent pas.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --no-progress
COPY . .
# Produit .output/ (serveur Nitro autonome + fichiers statiques).
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build --chown=bun:bun /src/.output ./.output
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", ".output/server/index.mjs"]
