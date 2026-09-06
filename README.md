# QUI PERD

Plateforme de défis 1 contre 1 entre gamers : un joueur crée un défi (jeu, plateforme, mise), un
adversaire le rejoint, les deux mises sont bloquées en séquestre, le gagnant remporte tout moins
la commission de la plateforme. Preuves (capture + vidéo) vérifiées, arbitrage humain en cas de
litige, dépôts et retraits par mobile money.

Dépôt unique, trois applications :

| Dossier     | Rôle                                            | Stack                                                      |
|-------------|-------------------------------------------------|------------------------------------------------------------|
| `backend/`  | API REST, moteur d'escrow, jobs, administration | Go 1.26, Fiber v3, GORM, PostgreSQL, Redis, Asynq, Swagger |
| `frontend/` | Site public, espace joueur web, tableau admin   | TanStack Start, React 19, TypeScript 7, Tailwind CSS v4    |
| `mobile/`   | Application joueur                              | Flutter                                                    |
| `.agent/`   | Skills : sources de vérité pour les agents      | Markdown (modèle de données, charte API, design, recette)  |

## Démarrer en développement

Backend (PostgreSQL et Redis doivent tourner ; copier `backend/.env.example` en `backend/.env`) :

```bash
cd backend && go build ./... && go run .
```

Le serveur écoute sur `http://127.0.0.1:8080`, documentation Swagger sur `/api/docs`. La recette
HTTP complète se lance avec `pwsh -File tests/parcours-api.ps1` depuis `backend/`.

Frontend (bun ; copier `frontend/.env.example` en `frontend/.env`) :

```bash
cd frontend && bun install && bun run dev
```

Le site est servi sur `http://localhost:3000` (port imposé par la configuration CORS du backend).
`bun run typecheck` doit rester à zéro erreur.

## Règles du dépôt

- Les fichiers `.env`, les binaires compilés, les preuves uploadées (`backend/public/preuves/`) et
  les dépendances ne sont jamais versionnés (voir `.gitignore`).
- Toute évolution de contrat (champ, route, table) se fait d'abord dans le backend et dans
  `.agent/skills/skill dev/demarrage-backend.md`, puis se répercute dans les clients.
