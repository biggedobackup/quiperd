# Création du frontend web de la plateforme QUI PERD

Je souhaite que vous créiez le frontend web complet de **QUI PERD** en utilisant la compétence
définie dans ce fichier.

Ce frontend est une **application unique TanStack Start** (dossier `frontend/` du dépôt) qui
couvre trois usages distincts :

1. **Le site public** (vitrine, SEO) — accueil, comment ça marche, jeux disponibles, aide,
   mentions légales, CGU, confidentialité.
2. **L'accès joueur web** — les mêmes fonctionnalités que l'application mobile (créer/rejoindre
   un défi, jouer, déclarer un score, envoyer une preuve, gérer son portefeuille, ses litiges),
   accessible depuis un navigateur.
3. **Le tableau de bord admin** — gestion des utilisateurs, du catalogue jeux/plateformes,
   arbitrage des litiges (visionnage des preuves), configuration des règles financières, suivi
   des paiements et statistiques globales.

> Le modèle de données, la charte API (formats, erreurs, authentification) et la liste
> complète des routes sont définis dans
> [`demarrage-backend.md`](demarrage-backend.md) — ce fichier ne les redéfinit jamais, il y
> renvoie. Toute évolution de contrat (nouveau champ, nouvelle route) se fait d'abord côté
> backend (code + skill backend + recette `backend/tests/parcours-api.ps1`), puis se répercute
> ici. Les écrans « accès joueur » sont le miroir fonctionnel de
> [`demarrage-mobile.md`](demarrage-mobile.md) — les deux clients consomment la même API et ne
> doivent jamais diverger sur la logique métier (calculs, statuts).

## Équipe d'agents

Vous mettrez en place une équipe d'agents composée de :

- **Un chef d'équipe** : chargé de déléguer les tâches aux sous-agents
- **Des agents de développement** : dédiés au codage des routes et composants TanStack Start
- **Des agents de vérification** : chargés de la validation du code (`bun run typecheck`,
  `bun run build`)
- **Des agents de test** : responsables des parcours fonctionnels dans le navigateur

## Processus de développement

- Chaque route devra être **testée et approuvée** dans le navigateur avant d'être considérée
  comme terminée.
- **Vérification = `bun run typecheck` (TypeScript 7, `tsc --noEmit`) + `bun run build` sans
  erreur ni avertissement bloquant**, puis parcours dans le navigateur aux 3 paliers du §6, **en
  commençant par le palier mobile (375 px, émulation tactile)** : la majorité des joueurs sont
  sur téléphone, le menu hamburger, la barre basse, les modales et les formulaires doivent y être
  confortables (cibles ≥ 44 px, aucun défilement horizontal, texte lisible sans zoom) avant de
  passer à la tablette et au bureau.
- **Le backend tourne pendant tout le développement** (`http://127.0.0.1:8080`, voir
  `demarrage-backend.md`) avec `CORS_ORIGIN=http://localhost:3000` ; le frontend écoute sur le
  **port 3000** — toute autre valeur casse les appels navigateur → backend. Aucune donnée
  mockée : chaque écran est branché sur l'API réelle dès son premier rendu.
- La recette frontend (§5) se joue avec deux comptes joueurs créés depuis l'écran
  d'inscription et l'administrateur du seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_MOTDEPASSE` du
  `.env` backend) ; les dépôts sont validés depuis le tableau admin (prestataires non
  configurés en développement).
- En cas d'**erreur**, l'agent principal en sera informé.
- L'agent principal **redéléguera** la tâche concernée à l'agent approprié.
- Ce processus sera **répété en boucle** jusqu'à ce que l'intégralité du travail soit
  entièrement terminée et validée.
- La compétence
  [`../skill de securité/securité et perfomance.md`](../skill%20de%20securité/securité%20et%20perfomance.md)
  s'applique à ce frontend (XSS, CSP à nonce en production, gestion des tokens, CORS, Core Web
  Vitals) avant mise en production.

# Guide de Développement — QUI PERD (Frontend Web)

---

## 1. Stack Technique

Toujours la **dernière version stable** de chaque paquet au moment du scaffold
(`npm view <paquet> version`), installée avec `bun add` qui fige la version dans
`package.json`. Versions constatées lors du démarrage : TypeScript 7.0, TanStack Start 1.168,
TanStack Router 1.170, TanStack Query 5.102, React 19.2, Vite 7, Tailwind CSS 4.

| Catégorie            | Package / Technologie                                   | Rôle                                                                 |
|----------------------|----------------------------------------------------------|----------------------------------------------------------------------|
| Langage              | **TypeScript 7** (compilateur natif, `tsc --noEmit`)     | `strict`, `verbatimModuleSyntax`, `moduleResolution: bundler`, alias `@/` → `src/` |
| Framework            | **TanStack Start** (React 19, Vite 7, SSR streaming)     | site public + espace joueur + admin, une seule app                   |
| Routage              | TanStack Router (file-based, `src/routeTree.gen.ts` généré par le plugin Vite, jamais édité) | routes typées, layouts `_public`, `/joueur/*`, `/admin/*` |
| Données              | TanStack Query + `@tanstack/react-router-ssr-query`      | cache des listes, invalidation après chaque mutation, hydratation SSR |
| Style                | **Tailwind CSS v4** (`@tailwindcss/vite`)                | tokens déclarés une seule fois dans `src/styles/app.css` via `@theme` — **il n'existe plus de `tailwind.config.ts`** en v4 |
| Icônes               | **Font Awesome** (`@fortawesome/fontawesome-svg-core`, `@fortawesome/react-fontawesome`, `free-solid-svg-icons`, `free-regular-svg-icons`, `free-brands-svg-icons`) | icônes importées **une à une** et nommées par usage dans `src/lib/icones.ts` (jamais `library.add(fas)` : + 1 Mo de bundle) ; `config.autoAddCss = false` et le CSS de `fontawesome-svg-core` importé une fois dans `__root.tsx` (sinon flash d'icônes géantes au SSR) |
| Animation            | **`motion`** (`motion/react`)                            | transitions de page, listes en cascade, compteurs animés, micro-interactions — presets centralisés dans `components/partages/animation/`, `prefers-reduced-motion` respecté |
| Polices              | `@fontsource-variable/unbounded` (titres), `@fontsource-variable/manrope` (texte), `@fontsource-variable/jetbrains-mono` (montants, scores, références) | auto-hébergées : compatibles avec la CSP `font-src 'self'` de la compétence sécurité, aucun appel à Google Fonts |
| Formulaires          | React Hook Form + Zod (`@hookform/resolvers`)            | création de défi, dépôt/retrait, déclaration de score, formulaires admin |
| Graphiques           | Recharts                                                 | répartitions du tableau de bord admin (le backend n'expose pas encore de séries temporelles : aucune courbe inventée) |
| Lecture média        | balise `<video>` / `<img>` native                        | preuves de match servies par la route proxy authentifiée (§1, « pont serveur ») |
| Notifications utilisateur | `sonner` (toasts)                                    | retour visuel de succès/erreur sur chaque action mutante — voir §4    |
| Formatage            | `Intl.NumberFormat` / `Intl.DateTimeFormat` (locale `fr`), centralisés dans `src/lib/format.ts` | montants FCFA, dates, temps relatif — jamais de formatage ad hoc dans un composant |
| Authentification     | Cookie `HttpOnly` posé par une server function TanStack Start | le JWT ne transite jamais côté client en JS accessible — critique sur une app qui manipule de l'argent réel |
| Temps réel           | **API `WebSocket` native du navigateur** — aucune dépendance npm | socket unique `wss://…/api/temps-reel?ticket=…`, client dans `src/temps-reel/` (§4 bis). Interdiction d'ajouter socket.io, ws ou équivalent : le backend parle un protocole WebSocket brut et la connexion de l'utilisateur est lente |
| Gestionnaire de paquets | **bun** (`bun install`, `bun run dev`) — `npm` accepté | `bun.lock` versionné                                                  |
| Déploiement          | build Vite → serveur Node derrière Caddy (`reverse_proxy web:3000`) | même reverse proxy que le backend, dans le même `docker-compose.yml` — détail complet dans [`../skill deploiement/demarrage-deploiement.md`](../skill%20deploiement/demarrage-deploiement.md) |

### `server/` vs `services/` — à ne pas confondre

- **`src/server/`** : infrastructure transverse, indépendante de tout module métier — lecture/
  écriture du cookie de session et gardes de route (`session.ts`), client HTTP de base vers le
  backend (`http-client.ts`).
- **`src/services/`** : la couche d'appel au backend proprement dite (l'équivalent frontend des
  `services.go` du backend), organisée **un fichier par module backend**, avec exactement les
  mêmes noms que dans `demarrage-backend.md` §2 (`auth`, `utilisateurs`, `comptes-gamers`,
  `jeux`, `plateformes`, `defis`, `matchs`, `preuves`, `litiges`, `portefeuilles`, `paiements`,
  `notifications`, `administration`). Chaque fonction de `services/` est une **server function**
  (`createServerFn`) qui relit le cookie via `server/session.ts` et appelle le backend via
  `server/http-client.ts` — le navigateur n'appelle jamais le backend Go directement.
  `src/models/` suit le même découpage par module, un fichier de types par module — pour qu'un
  agent qui travaille sur un module backend trouve immédiatement son équivalent exact côté
  frontend.

### Pourquoi un cookie `HttpOnly` plutôt qu'un stockage JS

Contrairement au mobile (où le JWT est stocké via `flutter_secure_storage`, hors d'atteinte du
DOM), un navigateur expose `localStorage`/`sessionStorage` à tout script — un XSS y volerait le
jeton. `src/services/auth.ts` appelle `POST /api/auth/connexion` (ou `/admin/connexion`) sur le
backend, reçoit le JWT, et le pose en cookie `HttpOnly`, `Secure` (hors `localhost`),
`SameSite=Lax` via le helper `server/session.ts`. **`Lax` et non `Strict`** : le retour depuis
la page de paiement hébergée LigdiCash/MoneyFusion (`return_url`) est une navigation de premier
niveau depuis un autre site — avec `Strict` le cookie ne serait pas envoyé et le joueur
reviendrait déconnecté. Chaque service relit ensuite ce cookie et l'ajoute en
`Authorization: Bearer <jwt>` pour ses appels au backend Go — le JWT n'est jamais lu ni
manipulé côté client. Deux cookies distincts (`qp_session` joueur, `qp_admin` administrateur)
pour qu'un admin puisse aussi tester un compte joueur dans le même navigateur.

### Pont serveur pour les fichiers de preuve (« proxy authentifié »)

Une balise `<video src>` ou `<img src>` ne peut pas envoyer d'en-tête `Authorization`, et un
`multipart` envoyé via une server function ne remonte pas sa progression. Deux **routes serveur
TanStack Start** (fichiers `src/routes/api/…ts`, `server.handlers`) servent donc de pont :

- `GET /api/preuves/$preuveId/fichier` (frontend) → lit le cookie, appelle
  `GET /api/preuves/:id/fichier` du backend avec le Bearer, et **re-stream** la réponse
  (type MIME conservé). C'est la seule URL utilisée par `<video>`/`<img>`.
- `POST /api/matchs/$matchId/preuves` (frontend) → relaie tel quel le `multipart/form-data` vers
  le backend ; le navigateur l'appelle en `XMLHttpRequest` pour afficher la progression
  (`barre-progression-upload`).

Ces routes vivent sur l'origine du frontend (port 3000) : pas de CORS, pas de jeton exposé.

---

## 2. Arborescence des Dossiers et Fichiers

### Convention de nommage

- **Composants techniques d'interface** : anglais standard (`button`, `input`, `modal`,
  `toast`, `loader`, `skeleton`, `sidebar`, `navbar`, `breadcrumbs`, `data-table`,
  `stat-card`, `badge`, `empty-state`).
- **Routes, pages et notions métier** : intégralement en français (`defis`, `matchs`,
  `litiges`, `portefeuille`, `tableau-de-bord`, `configurations`, `journal-audit`), à
  l'identique des noms de modules backend (`demarrage-backend.md` §2).
- **URLs préfixées par section** : `/joueur/…` et `/admin/…`. Les deux espaces ont un
  `tableau-de-bord`, des `litiges`, etc. : sans préfixe, deux fichiers de route produiraient
  la même URL (collision TanStack Router). Le site public reste à la racine (`/`,
  `/comment-ca-marche`…).

```text
frontend/
├── package.json · bun.lock
├── vite.config.ts               # tsconfigPaths(), tailwindcss(), tanstackStart(), viteReact() — dans cet ordre, port 3000
├── tsconfig.json                # TypeScript 7 strict, alias @/ → src/
├── .env.example                 # API_BASE_URL=http://127.0.0.1:8080/api (lu côté serveur uniquement, jamais VITE_*)
├── public/                      # assets statiques du site
│   ├── images/                  # logo, illustrations
│   ├── icons/                   # favicon, icônes PWA
│   ├── og/                      # images Open Graph par page (SEO/partage social)
│   └── robots.txt
└── src/
    ├── router.tsx               # getRouter() : createRouter + QueryClient dans le contexte + intégration SSR Query
    ├── routeTree.gen.ts         # généré — jamais édité, jamais formaté à la main
    ├── styles/
    │   └── app.css              # @import "tailwindcss"; @theme { tokens } ; polices ; keyframes ; thème sombre (variables)
    ├── routes/
    │   ├── __root.tsx           # <html> shell, HeadContent/Scripts, providers (Query, toasts), meta par défaut
    │   ├── _public.tsx          # layout site vitrine : header + footer + transition de page
    │   ├── _public/
    │   │   ├── index.tsx        # accueil : hero, défis ouverts en direct, comment ça marche, catalogue par catégorie
    │   │   ├── defis.tsx        # page « Défis » : GET /api/defis/ouverts (public), filtres catégorie/famille/jeu/plateforme/mise, mise à jour EN DIRECT par le socket (aucun polling)
    │   │   ├── comment-ca-marche.tsx
    │   │   ├── jeux.tsx         # catalogue public groupé par catégorie + plateformes par famille (GET /api/jeux, /api/plateformes)
    │   │   ├── aide.tsx         # FAQ <details>/<summary> + formulaire « Nous contacter » branché sur POST /api/contact (services/contact.ts)
    │   │   ├── cgu.tsx · confidentialite.tsx · mentions-legales.tsx
    │   │   ├── connexion.tsx    # joueur → POST /api/auth/connexion (garde invité)
    │   │   ├── inscription.tsx  # garde invité
    │   │   ├── mot-de-passe-oublie.tsx
    │   │   └── reinitialisation-mot-de-passe.tsx   # ?token= → POST /api/auth/reinitialisation-mot-de-passe
    │   ├── joueur.tsx           # layout protégé (garde joueur) : sidebar + navbar + <Outlet/>
    │   ├── joueur/
    │   │   ├── tableau-de-bord.tsx      # solde, mes matchs en cours, défis ouverts, notifications récentes
    │   │   ├── defis/
    │   │   │   ├── index.tsx    # liste + filtres (catégorie, jeu groupé par catégorie, plateforme groupée par famille, mise max) + « mes défis »
    │   │   │   ├── nouveau.tsx  # création (bornes de mise et commission lues sur l'API, jamais en dur)
    │   │   │   └── $defiId.tsx  # détail, rejoindre (confirmation), annuler si créateur
    │   │   ├── matchs/
    │   │   │   ├── index.tsx    # GET /api/matchs — mes matchs (en_cours / preuve_requise / nul_en_attente / litige / termine)
    │   │   │   └── $matchId.tsx # déclaration, confirmation du score adverse, désaccord, choix après un nul, manches, chronos vivants, upload preuve, litige
    │   │   ├── portefeuille.tsx # solde, dépôt, retrait (frais affichés depuis l'API), historique
    │   │   ├── litiges.tsx
    │   │   ├── notifications.tsx
    │   │   └── profil.tsx       # profil, mot de passe, comptes gamers
    │   ├── admin/
    │   │   ├── connexion.tsx    # POST /api/auth/admin/connexion — jamais liée depuis le site public
    │   │   ├── _prive.tsx       # layout protégé (garde admin) : sidebar dense + navbar
    │   │   └── _prive/
    │   │       ├── tableau-de-bord.tsx  # KPIs (stat-card) + répartitions (Recharts)
    │   │       ├── utilisateurs.tsx     # CRUD complet (utilisateur-modal : création/édition, suppression logique confirmée), suspension/réactivation, liste paginée 10/page
    │   │       ├── matchs/
    │   │       │   ├── index.tsx        # GET /api/matchs?tous=1 (filtre statut : litige et preuve_requise en priorité d'arbitrage)
    │   │       │   └── $matchId.tsx     # déclarations, validation/rejet des preuves, règlement manuel
    │   │       ├── jeux-plateformes.tsx # catalogue : création avec catégorie/famille, changement de groupe en ligne, recherche + puces de filtre, activation/désactivation, suppression
    │   │       ├── litiges/
    │   │       │   ├── index.tsx        # GET /api/litiges?tous=1
    │   │       │   └── $litigeId.tsx    # déclarations, preuves des deux joueurs (lecteur), décision
    │   │       ├── paiements.tsx        # dépôts/retraits, validation manuelle
    │   │       ├── messages.tsx         # messages de contact : liste paginée, détail, statut, note admin, suppression
    │   │       ├── configurations.tsx   # commission, mise min/max, frais de retrait (historisé)
    │   │       └── journal-audit.tsx
    │   ├── api/                 # routes serveur (pont vers le backend, §1)
    │   │   ├── preuves/$preuveId/fichier.ts
    │   │   └── matchs/$matchId/preuves.ts
    │   └── sitemap[.]xml.ts     # route serveur : sitemap des pages publiques (le `[.]` échappe le point)
    ├── temps-reel/              # client WebSocket (§4 bis) — AUCUNE dépendance npm, API WebSocket native
    │   ├── evenements.ts        # CONTRAT GELÉ : miroir de backend/tempsreel/evenements.go (noms, salons, charges)
    │   ├── client.ts            # socket singleton : ticket, reconnexion (backoff 1 s → 30 s + gigue), abonnements, instantané SSR
    │   ├── fournisseur.tsx      # <FournisseurTempsReel> — n'ouvre jamais le socket pendant le rendu serveur
    │   ├── hooks.ts             # useSalon, useEvenement, usePresence, useResynchronisation, useChrono, useEtatTempsReel
    │   ├── cache.ts             # application des événements au cache TanStack Query
    │   └── indicateur-direct.tsx # pastille « en direct / reconnexion »
    ├── server/
    │   ├── http-client.ts       # fetch vers API_BASE_URL, Bearer, mapping des erreurs { erreur } → ErreurApi(statut, message, details), type Resultat<T>
    │   ├── session.ts           # SERVEUR SEUL : cookies qp_session / qp_admin, appelJoueur/appelAdmin (401 → cookie effacé + redirection)
    │   ├── session-fns.ts       # server functions obtenirSessionJoueur/obtenirSessionAdmin/obtenirSiteUrl (appelables depuis le client)
    │   └── gardes.ts            # gardeJoueur, gardeAdmin, gardeInvite, gardeInviteAdmin — pour `beforeLoad`, n'importe que session-fns
    ├── services/                # server functions — un fichier par module backend
    │   ├── auth.ts · utilisateurs.ts · comptes-gamers.ts · jeux.ts · plateformes.ts
    │   ├── defis.ts · matchs.ts · preuves.ts · litiges.ts · contact.ts
    │   ├── portefeuilles.ts · paiements.ts · notifications.ts · administration.ts
    │   └── temps-reel.ts        # server function du ticket : POST /api/temps-reel/ticket (le JWT reste dans le cookie HttpOnly)
    ├── models/                  # types TypeScript — mêmes champs camelCase que le JSON backend
    │   ├── utilisateur.ts · compte-gamer.ts · jeu.ts · plateforme.ts
    │   ├── defi.ts · match.ts · resultat-declare.ts · preuve-match.ts · litige.ts
    │   ├── portefeuille.ts · transaction-portefeuille.ts · paiement.ts · notification.ts
    │   └── administration.ts    # statistiques, configuration financière, journal d'audit
    ├── lib/
    │   ├── format.ts            # formatMontant (FCFA), formatDate, formatDateRelative, formatPourcentage
    │   ├── icones.ts            # registre Font Awesome : icone.defi, icone.portefeuille, icone.litige…
    │   ├── statuts.ts           # libellés + variantes visuelles de chaque statut backend (une seule source)
    │   └── query.ts             # clés TanStack Query par module (cles.defis.liste(filtres)…)
    └── components/
        ├── partages/            # boîte à outils commune aux 3 sections
        │   ├── en-tete-page/    # en-tête d'écran (surtitre, titre, actions) — joueur ET admin, donc partagé
        │   ├── button/ · input/ · select/ · textarea/ · badge/ · badge-statut/
        │   ├── modal/ · confirm-modal/
        │   ├── toast/           # <Toaster/> sonner + helpers succes()/erreur()
        │   ├── loader/ · skeleton/ · empty-state/ · pagination/
        │   ├── data-table/ · stat-card/ · compteur-anime/ · barre-progression-upload/
        │   ├── lecteur-preuve/  # <video>/<img> via la route proxy
        │   └── animation/       # presets motion : apparition, cascade, transition de page
        ├── public/              # header, footer, hero, section-*, faq-accordion, ticker-defis
        ├── joueur/              # sidebar, navbar, carte-defi, carte-match, tableau-score, modals/
        └── admin/               # sidebar, navbar, graphique-repartition, modals/
```

---

## 3. Routes et Parcours par Usage

### 3.1 Site public (SEO)

- Rendu **SSR** avec balises meta par route (titre, description, Open Graph), `robots.txt` et
  sitemap.
- Contenu rendu serveur — aucune donnée sensible, aucun appel authentifié. Les seuls appels
  API sont publics : `GET /api/jeux`, `GET /api/plateformes`, `GET /api/defis/ouverts` (défis
  en attente d'adversaire, page « Défis » et section d'accueil, rafraîchis toutes les 30 s côté
  client), `GET /api/configurations-financieres` (commission et bornes de mise affichées
  dynamiquement).
- Objectif Core Web Vitals : LCP/CLS optimisés, JS non critique chargé en différé, animations
  d'entrée uniquement sur `transform`/`opacity`.
- La **garde invité** (`server/session.ts`) redirige un joueur ou un admin déjà connecté loin
  de `connexion` / `inscription` vers son tableau de bord respectif.

**Structure de la page d'accueil (`index.tsx`)** — une page unique de présentation, complétée
par les pages dédiées d'authentification et légales :

1. **Header/Navigation** — logo QUI PERD, liens (Accueil, Défis, Jeux, Comment ça marche, Aide), menu
   mobile. **Le bloc de droite dépend de la session**, lue une fois au chargement de
   `_public.tsx` (`session-fns.ts`, jamais un état recalculé après coup côté client) :
   - **Visiteur anonyme** : boutons Connexion / Inscription.
   - **Joueur déjà connecté** : lien « Tableau de bord » + menu profil (déconnexion) — les
     boutons Connexion / Inscription **ne s'affichent plus du tout**.
   - **Administrateur déjà connecté** : lien « Administration » à la place — même règle.

   Ce n'est pas seulement la garde invité qui bloque l'accès direct aux routes `connexion`/
   `inscription` (ci-dessus) : le header lui-même ne doit jamais proposer ces liens à quelqu'un
   déjà connecté, pour ne pas laisser croire qu'il peut créer un second compte ou se
   reconnecter depuis là.

   La règle vaut pour **toute** la page, pas seulement le header : hero, bande d'appel, pied de
   page, cartes de défis et états vides reçoivent `connecte` (loader de `_public.tsx`) et
   remplacent « Créer un compte » / « Se connecter » par « Créer un défi », « Mon espace » ou
   « Voir et rejoindre ». Un joueur connecté ne doit voir ces deux libellés **nulle part** —
   c'est vérifié dans la recette navigateur, connecté, sur chaque page publique.
2. **Hero** — proposition de valeur (« Défiez un adversaire, misez, le gagnant remporte tout »),
   CTA principal vers l'inscription (« Créer un défi » si connecté) et lien vers la page Défis
   affichant le nombre de défis ouverts, tableau de score animé d'un match type (voir §6). Le
   surtitre parle de « défis 1 contre 1 sur tous les jeux », jamais d'un jeu précis.
2 bis. **Défis en attente d'adversaire** — les 6 derniers défis ouverts (`GET /api/defis/ouverts`)
   en tickets `carte-defi-publique` : catégorie du jeu (icône + libellé de `lib/catalogue.ts`),
   jeu, plateforme, mise en gros chiffres, créateur, expiration ; pied « Voir et rejoindre »
   (connecté → `/joueur/defis/$defiId`) ou « Se connecter pour rejoindre »
   (`/connexion?vers=/joueur/defis/<id>` : la page de connexion accepte un paramètre `vers`
   limité à `/joueur/…` et y renvoie après authentification). La page `/defis` reprend la liste
   complète avec puces de catégorie et sélecteurs jeu/famille/plateforme/mise max.
3. **Comment ça marche** — les 4 étapes numérotées du parcours : créer un défi → un adversaire
   rejoint → jouer le match sur le jeu et la plateforme du défi → le gagnant remporte la mise
   (commission lue sur `GET /api/configurations-financieres`, **jamais un pourcentage codé en
   dur** — voir la compétence d'audit, point « Contenu éditorial vs configuration »).
4. **Jeux disponibles** — catalogue public (`GET /api/jeux`, `GET /api/plateformes`) **groupé
   par catégorie** : `lib/catalogue.ts` est la seule source des libellés, icônes, descriptions et
   de l'ordre des 7 catégories (`sport`, `combat`, `course`, `tir`, `strategie`, `cartes`,
   `arcade`) et des 3 familles de plateforme (`pc`, `console`, `mobile`), avec
   `optionsJeuxGroupees` / `optionsPlateformesGroupees` pour les `<optgroup>` des listes
   déroulantes (composant `Select`, prop `groupes`). L'accueil montre une carte par catégorie
   (premiers titres + compteur), la page Jeux la liste complète avec puces de filtre (`Puce`) et
   les plateformes rangées par famille.
5. **Sécurité & Confiance** — mise en séquestre (escrow) de l'argent le temps du match,
   vérification des preuves (capture + vidéo), arbitrage humain en cas de litige — sans
   promettre de chiffres non garantis par le backend.
6. **Aide** — FAQ en accordéon (natif `<details>/<summary>`, aucun JS nécessaire) et formulaire
   « Nous contacter » (nom, e-mail, sujet, message) branché sur `POST /api/contact` (module
   `contact` : `models/contact.ts`, `services/contact.ts`, anti-spam 5 messages/heure/IP → 429
   traduit en message clair, nom/e-mail préremplis pour un joueur connecté). Les messages sont
   lus et traités dans l'admin (`/admin/messages` : liste paginée, statuts nouveau/lu/traité,
   note interne, suppression). Jamais un formulaire sans route backend derrière (« widget
   décoratif sans effet », compétence d'audit).
7. **Footer** — liens légaux (CGU, confidentialité, mentions légales), copyright.

### 3.2 Accès joueur web (miroir du mobile)

1. **Authentification** — connexion/inscription, cookie `HttpOnly` posé par `services/auth.ts`,
   toast de confirmation ou d'erreur explicite (identifiants invalides, compte suspendu…).
2. **Tableau de bord** — solde, mes matchs en cours (`GET /api/matchs?statut=en_cours`), défis
   ouverts, notifications récentes ; squelette de chargement le temps du premier chargement.
3. **Défis** — liste (`GET /api/defis`, filtres catégorie/jeu/plateforme/mise, sélecteurs
   groupés par catégorie et par famille), état vide explicite
   (« Aucun défi disponible, créez le premier ! ») ; onglet « mes défis » (`GET /api/defis?mes=1`)
   avec annulation d'un défi encore ouvert ; création (`nouveau.tsx`) : bornes de mise et
   commission lues sur l'API, solde disponible affiché, erreur 422 traduite en message clair ;
   détail, bouton rejoindre avec confirmation (montant bloqué rappelé).
4. **Match** — l'écran suit la machine à états du backend (`demarrage-backend.md` §5.3), en
   direct sur le salon `match:<id>` : déclaration du score (`declaration-score-modal`) ; quand
   l'adversaire a déclaré, deux actions claires — **« Confirmer 1-3 »**
   (`POST /matchs/:id/confirmation`, sans corps : le score confirmé est celui du serveur) ou
   « Proposer un autre score » ; en cas de désaccord (`preuve_requise`), upload de preuve
   (`multipart/form-data`, capture + vidéo, `barre-progression-upload`) avec le compte à rebours
   de dépôt ; en cas de nul des deux côtés (`nul_en_attente`), le choix **rejouer / partager**
   (`POST /matchs/:id/choix-nul`) en rappelant la conséquence financière (rejouer = aucun
   mouvement d'argent ; partager = mise moins la commission) et le choix déjà exprimé par
   l'adversaire ; le numéro de **manche** et l'historique des manches précédentes ; le compte à
   rebours de l'échéance en cours (`match.echeance` + `useChrono`, jamais de requête) ; la
   présence de l'adversaire. `badge-statut` visuellement distinct pour chacun des statuts
   (`en_cours`, `preuve_requise`, `nul_en_attente`, `litige`, `termine`) ; les deux joueurs sont
   nommés (`joueur1Nom`/`joueur2Nom` renvoyés par l'API).
5. **Portefeuille** — solde disponible/bloqué, dépôt (`depot-modal`) et retrait
   (`retrait-modal`, **frais de retrait calculés par le backend et affichés avant confirmation**)
   via LigdiCash/MoneyFusion (redirection vers la page de paiement hébergée quand l'API renvoie
   `urlPaiement`, jamais une iframe ; sinon message « en attente de confirmation »), historique
   paginé, état vide si aucune transaction. Les prestataires proposés viennent de
   `GET /api/paiements/prestataires` (`optionsPrestataires`) — **jamais une liste en dur** : le
   backend refuse une passerelle non configurée. Liste vide → encart explicatif sans formulaire ;
   un seul prestataire → pas de `<select>` à un choix ; le numéro n'est obligatoire que si le
   serveur le dit (`numeroRequis`). Les montants sont des entiers de FCFA.
6. **Litiges** — ouverture depuis l'écran de match (confirmation avant envoi), suivi de la
   décision arbitrale avec `badge-statut` dédié.
7. **Notifications / Profil** — liste des notifications (marquage lu), gestion des comptes
   gamers par jeu/plateforme, modification du profil (`PATCH /api/utilisateurs/:id`) et
   changement de mot de passe (`POST /api/auth/changer-mot-de-passe`), chacun confirmé par un
   toast de succès.

### 3.3 Tableau de bord admin

0. **Authentification** — page `admin/connexion.tsx` distincte de `_public/connexion.tsx` :
   `administrateurs` est une table séparée de `utilisateurs` (voir `demarrage-backend.md` §7,
   tables 1 et 15), la connexion admin appelle `POST /api/auth/admin/connexion` et n'est jamais
   liée depuis la navigation du site public.
1. **Tableau de bord** — `GET /api/administration/statistiques` : `stat-card` par KPI (défis
   ouverts, matchs en cours/terminés, litiges ouverts, volume misé, commission cumulée, dépôts,
   retraits), `graphique-repartition` (Recharts) — squelette de chargement le temps de la
   première requête.
2. **Utilisateurs** — `data-table` (recherche, filtre par statut) sur `GET /api/utilisateurs`,
   suspension/réactivation via `suspension-utilisateur-modal`
   (`PATCH /api/utilisateurs/:id/statut`), toast de confirmation.
2 bis. **Matchs & preuves** — `GET /api/matchs?tous=1` filtré par statut (`verification` par
   défaut) : c'est ici que l'administrateur **valide ou rejette les preuves** d'un match sans
   litige (`PATCH /api/preuves/:id`, motif obligatoire au rejet) — la validation des deux joueurs
   déclenche le règlement automatique ; bouton « Régler le match » (`POST /api/matchs/:id/validation`,
   confirmation) en secours. Sans cet écran, aucun match normal ne pourrait jamais être réglé.
3. **Jeux & Plateformes** — gestion du catalogue : création avec **catégorie** (jeu) ou
   **famille** (plateforme) obligatoire, changement de catégorie/famille en ligne (liste
   déroulante sur chaque ligne), recherche et puces de filtre par groupe avec compteurs (une
   cinquantaine de jeux), activation/désactivation, suppression confirmées par toast.
4. **Litiges** — `data-table` sur `GET /api/litiges?tous=1`, détail avec déclarations et
   preuves des deux joueurs (capture + vidéo, `lecteur-preuve`, validation/rejet de chaque
   preuve via `PATCH /api/preuves/:id`), décision arbitrale via `decision-litige-modal`
   (`PATCH /api/litiges/:id`, confirmation obligatoire avant envoi car irréversible) qui
   déclenche le règlement ou le remboursement croisé côté backend (moteur d'escrow,
   `demarrage-backend.md` §5).
5. **Paiements** — `data-table` des dépôts/retraits (filtre par type/statut), validation
   manuelle (`PATCH /api/paiements/:id/statut` : `reussi` / `echoue` / `rembourse`) avec
   confirmation.
6. **Configurations financières** — édition de `commission_defi`, `mise_minimale`,
   `mise_maximale`, `frais_retrait` via `edition-configuration-modal` (confirmation obligatoire,
   impact financier immédiat) — toute modification est historisée dans le journal d'audit.
7. **Journal d'audit** — `data-table` en lecture seule (filtre par action).

---

## 4. Règles d'architecture

- Une seule app TanStack Start, trois sections (`_public`, `/joueur`, `/admin`) — jamais trois
  projets séparés : le code partagé (client API, composants, thème) doit rester unique.
- Les routes `/joueur/*` et `/admin/*` sont protégées par un **`beforeLoad` de garde**
  (`server/session.ts`) qui lit le cookie, vérifie le rôle auprès du backend
  (`GET /api/auth/moi`) et redirige vers `/connexion` (ou `/admin/connexion`) si absent/invalide.
  Le résultat de `GET /api/auth/moi` est placé dans le contexte de route (`context.session`) et
  réutilisé par les pages — pas un appel par composant.
- Le layout public (`_public.tsx`) lit la session (`session-fns.ts`, joueur **et** admin) au
  chargement, exactement comme les layouts protégés — le header rendu au SSR est donc déjà
  correct pour un visiteur connecté, sans bascule visible après hydratation. Un visiteur déjà
  connecté ne voit **nulle part** les libellés Connexion / Créer un compte — ni dans le header,
  ni dans le hero, le pied de page, les bandes d'appel, les cartes ou les états vides (§3.1) —
  en plus d'être redirigé s'il force l'URL de ces routes (garde invité). Après connexion ou
  déconnexion, `router.invalidate()` recharge les loaders pour que le site public reflète la
  session sans rechargement complet.
- **Listes admin paginées** : toutes les listes de l'administration (utilisateurs, paiements,
  matchs, litiges, journal d'audit, messages de contact) consomment l'enveloppe
  `Page<T> = { elements, total, page, taille, pages }` (`@/models/pagination`, 10 par page) avec
  `?page=N` dans les search params de la route (`validateSearch` + `loaderDeps`), `useQuery` +
  `placeholderData: keepPreviousData` pour un changement de page fluide, le composant partagé
  `Pagination` (`page`, `pages`, `total`, `onChanger`) sous chaque `DataTable`, et retour à la
  page 1 dès qu'un filtre change. Les listes joueur (mes matchs, mes défis, notifications)
  restent des tableaux. Le CRUD utilisateurs admin (`utilisateur-modal`) crée, modifie
  (mot de passe optionnel) et supprime logiquement (409 affiché tel quel si le joueur a une mise
  bloquée, un défi ouvert ou un match en cours).
- **Jamais de calcul financier ou de logique de règlement côté frontend** : commission, gain,
  frais, statuts sont toujours ceux renvoyés par l'API — le frontend affiche et déclenche des
  actions, il ne calcule rien (voir le moteur d'escrow, `demarrage-backend.md` §5). Une
  estimation affichée avant confirmation (« gain potentiel ») utilise le taux lu sur l'API et
  est libellée comme estimation.
- `services/` suit exactement la charte API du backend (§1 de `demarrage-backend.md`) :
  camelCase français, formats d'erreur, statuts HTTP — aucun renommage de champ côté frontend
  sans évolution préalable du backend. Un module backend ajouté ou renommé
  (`demarrage-backend.md` §2) déclenche le même ajout/renommage dans `services/` et `models/`.
- Les erreurs backend (`{ erreur, details? }`) sont converties en `ErreurApi` par
  `http-client.ts` ; un `401` supprime le cookie et redirige vers la connexion ; les `details`
  de validation sont reportés champ par champ dans les formulaires.
- `components/public/`, `components/joueur/` et `components/admin/` ne s'importent jamais entre
  eux (un composant du tableau admin n'apparaît pas dans l'espace joueur) ; seul
  `components/partages/` est utilisable par les trois sections.
- **Retour visuel obligatoire sur chaque action mutante** (créer un défi, rejoindre, déclarer un
  score, envoyer une preuve, dépôt/retrait, décision de litige, changement de configuration) :
  un toast de succès ou d'erreur, jamais une action silencieuse ; la liste concernée est
  invalidée dans TanStack Query (`cles.*`) pour se rafraîchir sans rechargement.
- **Squelette de chargement (`skeleton/`) sur toute donnée asynchrone** (listes, tableaux,
  statistiques) — jamais un écran vide ou figé pendant un appel réseau.
- **Toute action irréversible ou à impact financier** (rejoindre un défi, suspension, décision
  de litige, changement de configuration financière, retrait, validation manuelle d'un
  paiement) passe par un `confirm-modal` nommé explicitement par l'action — jamais un bouton
  qui déclenche l'action directement au clic. Les actions financières ne sont jamais
  retentées automatiquement (pas de `retry` TanStack Query sur les mutations).
- Tout montant affiché passe par `lib/format.ts` (`formatMontant`), toute date par
  `formatDate`/`formatDateRelative`, tout statut par `lib/statuts.ts` — jamais de
  `toLocaleString`/`toFixed`/libellé improvisé dans un composant.
- Les preuves de match (vidéos/captures) passent toujours par le pont serveur authentifié
  (§1), jamais un chemin statique public ni une URL du backend dans le HTML.
- CORS strict côté backend : seul le domaine de ce frontend est autorisé ; le navigateur ne
  parle qu'à l'origine du frontend.

---

## 4 bis. Temps réel — « aucun polling »

> **Règle non négociable : le serveur pousse, le client n'interroge jamais en boucle.**

Interdits dans tout le frontend, sans exception :

- `refetchInterval` (ou `refetchIntervalInBackground`) sur un `useQuery` ;
- un `setInterval` / `setTimeout` récursif dont le but est de rappeler l'API ;
- un texte du type « liste actualisée toutes les 30 secondes » : il documenterait un défaut.

Deux exceptions, et seulement celles-là :

1. **un `invalidateQueries` à la (re)connexion du socket** (`useResynchronisation`), pour
   rattraper ce qui a changé pendant une coupure ;
2. **un compte à rebours purement client** (`useChrono`), calculé à partir d'une date fournie
   par le serveur (`match.echeance`) — il n'émet aucune requête.

> **Piège vérifié en recette : « à la reconnexion » ne veut pas dire « au montage ».**
> Un effet React se rejoue à chaque montage du composant, donc à chaque navigation vers
> l'écran, et autant de fois que React remonte l'arbre. Un `useResynchronisation` qui se
> contente de dépendre de `generation` invalide donc à chaque arrivée sur la page : la donnée
> que le loader vient de charger est jetée et redemandée. Mesuré sur `/joueur/portefeuille` :
> quatre invalidations et trois appels réseau par écran pour une seule navigation, sur des
> pages qui n'en demandent qu'un.
> La mémoire du « déjà resynchronisé » doit donc vivre **au niveau du module**
> (`Map<famille, generation>` dans `hooks.ts`), jamais dans un `useRef` — un `useRef` renaît
> vide à chaque montage. Contrôle de non-régression : naviguer entre deux écrans doit produire
> **zéro** `invalidateQueries`, et couper puis rétablir le backend doit en produire
> **exactement un**.

### Le client `src/temps-reel/`

- **Un seul socket pour toute l'application**, singleton (`client.ts`), multiplexé par salons.
  Un composant ne crée jamais sa propre connexion : il s'abonne (`useSalon`, `useEvenement`)
  et se désabonne au démontage.
- **Le socket ne s'ouvre JAMAIS pendant le rendu serveur.** Pas de `WebSocket` au niveau module,
  pas d'ouverture dans le corps d'un composant : uniquement dans un `useEffect` du
  `FournisseurTempsReel`. Une ouverture au SSR fait planter le rendu (l'API `WebSocket` n'existe
  pas dans Node) ou fuit une connexion par requête. Le rendu serveur utilise un instantané neutre
  (`instantaneServeur()`), et l'état affiché est « hors ligne » tant que l'hydratation n'a pas eu lieu.
- **Authentification par ticket, jamais le JWT.** Le jeton vit dans un cookie `HttpOnly` que le
  JS ne lit pas, et un `WebSocket` ne peut pas porter d'en-tête `Authorization` : une server
  function (`services/temps-reel.ts`) appelle `POST /api/temps-reel/ticket` et le navigateur
  ouvre `wss://…/api/temps-reel?ticket=…`. Le ticket est **à usage unique** : à chaque
  reconnexion, on en redemande un ; ne jamais le mettre en cache ni le réutiliser.
- **Reconnexion** : backoff exponentiel 1 s → 30 s avec gigue, puis resynchronisation. L'état
  (`connecte` / `connexion` / `hors_ligne`) est affiché par `indicateur-direct.tsx` — l'utilisateur
  doit toujours savoir si ce qu'il regarde est vivant.
- **Contrat gelé** : `src/temps-reel/evenements.ts` est le miroir exact de
  `backend/tempsreel/evenements.go`. On peut y ajouter un événement (documenté des deux côtés),
  jamais renommer ni changer la forme d'un existant d'un seul côté.
- **Hydratation** : un compte à rebours rend un texte **neutre et stable au premier rendu**
  (« — », ou l'échéance formatée), puis se met à égrener après le montage. Rendre « 4 min 12 s »
  côté serveur produit un HTML différent de celui du client une seconde plus tard : React
  signale une erreur d'hydratation et remonte tout l'arbre.
- Les événements d'argent (`portefeuille.maj`, `transaction.creee`, `paiement.statut`) arrivent
  **uniquement** sur le salon privé de l'utilisateur : ne jamais afficher un solde reçu d'un
  salon public, et ne jamais recalculer un montant côté client (règle §4).

---

## 5. Connexion à l'API Réelle

- `API_BASE_URL` (défaut `http://127.0.0.1:8080/api`) est lue **côté serveur** dans
  `server/http-client.ts` — jamais une variable `VITE_*` exposée au navigateur. Utiliser
  `127.0.0.1` et non `localhost` (résolution `::1` d'abord sous Windows, délai de ~2 s par
  requête).
- Implémenter les fichiers de `services/` un par un, module par module (même découpage que le
  backend), en suivant strictement la charte API — aucune donnée mockée, à aucun moment.
- Chaque server function relit le cookie de session et transmet `Authorization: Bearer <jwt>`
  au backend Go ; un `401` du backend déclenche la suppression du cookie et une redirection vers
  `/connexion` (ou `/admin/connexion`).
- Toute action sensible (suspension d'utilisateur, décision de litige, changement de
  configuration financière, dépôt/retrait, rejoindre un défi) affiche une confirmation avant
  l'appel API.
- Valider dans le navigateur les parcours complets : site public (meta tags, `robots.txt`),
  inscription/connexion joueur, dépôt validé par l'admin, création d'un défi, un second compte
  qui rejoint, déclaration + preuve des deux côtés, validation des preuves par l'admin et
  règlement visible dans les deux portefeuilles, retrait (frais affichés), litige (auto par
  déclarations divergentes et manuel) jusqu'à la décision arbitrale, suspension d'un
  utilisateur, édition d'une configuration financière.
- Chaque parcours ci-dessus est validé aux **3 largeurs de viewport** (mobile, tablette,
  ordinateur — voir §6) avant d'être considéré terminé, pas seulement en plein écran desktop.

---

## 6. Design & UX/UI

Un seul système de design pour les 3 usages (site public, joueur, admin) — la cohérence
visuelle et le respect des règles ci-dessous sont vérifiés à chaque écran, pas seulement en fin
de projet. **Objectif : une interface reconnaissable, pas un gabarit générique** — l'identité
vient de la typographie, des motifs et du mouvement, jamais de dégradés.

### Identité visuelle « Arène » (direction retenue — validée par le propriétaire)

**Fond blanc, vert et noir. Rien d'autre comme couleurs d'identité.** L'univers est celui du
**tableau d'affichage** et du **ticket de match** : gros chiffres, noir, accent vert, coins
coupés, perforations — le tout sur des pages **blanches**. Ce qui est interdit parce
qu'immédiatement identifiable comme un gabarit générique ou rejeté par le propriétaire : fond de
page coloré (beige, gris, sombre), **thème sombre ou bascule clair/sombre** (le rendu sombre a été
jugé « infâme »), dégradés, verre dépoli (`backdrop-blur` sur des cartes flottantes), icônes dans
des ronds pastel alignées par trois, ombres diffuses `shadow-lg` partout, typographie Inter par
défaut, textes centrés sur toute la page.

| Rôle | Token (`@theme`) | Valeur | Usage |
| :--- | :--- | :--- | :--- |
| Encre | `--color-encre` | `#0E0F12` | texte principal, bordures fortes, boutons primaires, blocs noirs (barre latérale, tableau de score, pied de page) |
| Craie | `--color-craie` | `#FFFFFF` | fond des pages : **blanc pur** |
| Papier | `--color-papier` | `#FFFFFF` | cartes, champs, tableaux (séparés du fond par un trait noir de 2 px, pas par une teinte) |
| Gris | `--color-gris` | `#F4F4F5` | seule surface discrète autorisée : en-têtes de tableau, pieds de carte, survol de ligne |
| Volt | `--color-volt` | `#22C55E` | **le vert** : surlignages, badge « ouvert », survol du CTA, curseur de progression — **toujours avec du texte noir (`text-nuit`) dessus, jamais de texte vert clair sur blanc** |
| Gain | `--color-gain` | `#15803D` | vert foncé lisible sur blanc (AA) : montants crédités, badge « gagné », succès, liens |
| Perte | `--color-perte` | `#B91C1C` | montants débités, badge « perdu », actions destructrices — usage sémantique seulement |
| Alerte | `--color-alerte` | `#A16207` | en attente, vérification, litige en cours — usage sémantique seulement |
| Info | `--color-info` | `#374151` | statut « en cours » (gris foncé, pas de bleu) |
| Muet | `--color-muet` | `#6B7280` | texte secondaire, légendes (AA sur blanc) |
| Trait | `--color-trait` | `#E4E4E7` | séparateurs fins, bordures de tableau |

Un seul thème (`color-scheme: light`) : aucun script de préférence, aucun `prefers-color-scheme`.

**Contenu éditorial** : la plateforme couvre **tous les jeux** — ne jamais nommer un jeu (EA
SPORTS FC, eFootball…) en dur dans un texte, un titre, une meta, une FAQ, une image Open Graph
ou un placeholder ; le catalogue affiché vient de `GET /api/jeux`.

**Zéro dégradé, aucune exception** : chaque valeur ci-dessus est une couleur unie, jamais
combinée en `linear-gradient` ni via les classes `bg-gradient-*`/`bg-linear-*` de Tailwind — y
compris pour un survol ou une ombre « colorée ». Les textures autorisées sont des motifs SVG
plats (grille pointillée, hachures) en fond de section.

### Typographie

- **Titres** : `Unbounded` (variable), capitales, interlettrage serré (`tracking-tight`),
  tailles `display` (72/56/40 px selon palier) → `h1` 40/32 → `h2` 28 → `h3` 20.
- **Texte** : `Manrope` (variable), corps 16 px / 1.6, légendes 13 px.
- **Chiffres** : `JetBrains Mono` pour tout montant, score, référence, compteur — avec
  `font-variant-numeric: tabular-nums` pour que les colonnes de chiffres s'alignent.
- Échelle déclarée une seule fois dans `app.css` (`--text-*`, `--font-*`), jamais une taille
  improvisée écran par écran.

### Motifs de composants signature

- **Ticket** : carte de défi/match à coins coupés (`clip-path: polygon(...)`) avec une ligne de
  perforation pointillée entre l'en-tête (jeu, plateforme) et la mise ; survol = translation
  `-2px` + ombre portée **pleine** décalée (`4px 4px 0 var(--color-encre)`), jamais floue.
- **Tableau de score** : `KADER 3 — 1 MOUSSA` en `JetBrains Mono` 56 px sur fond encre, texte
  craie, gagnant souligné en volt — utilisé dans le hero, le détail de match et la décision de
  litige.
- **Numérotation** : sections « Comment ça marche » et étapes numérotées `01 · 02 · 03 · 04`
  en Unbounded, alignées à gauche, jamais centrées.
- **Ticker** : bandeau défilant des défis ouverts (jeu · mise · créateur) sous le hero,
  animation CSS `translateX` en boucle, pause au survol, arrêt si `prefers-reduced-motion`.
- **Boutons** : rectangles à bord 2 px encre, fond encre + texte craie (primaire) ou fond papier
  + texte encre (secondaire), survol = fond volt + texte encre, pression = `scale(0.98)`,
  chargement = spinner Font Awesome `spinner` en rotation + libellé conservé.
- **Badge de statut** : pastille carrée 8 px + libellé en capitales 11 px ; `en_cours` pulse
  lentement (animation `pulsation` 2 s), les états finaux sont statiques.
- **Sidebar** de l'espace joueur/admin : fond encre, item actif = barre volt de 3 px à gauche +
  texte craie, icônes Font Awesome 16 px, section « solde » en mono au sommet (joueur).
- **Compteurs** : les soldes et KPIs s'animent de 0 à la valeur à l'apparition
  (`compteur-anime`, 600 ms, `easeOut`) — une seule fois par montage.

### Mouvement (motion)

- Entrée de page : `opacity 0 → 1` + `translateY(12px → 0)` en 240 ms `easeOut`
  (preset `apparition`), listes en cascade avec 40 ms de décalage par élément (`cascade`, plafond
  12 éléments).
- Modales : fond `opacity` 160 ms, panneau `scale(0.96 → 1)` 200 ms ; fermeture par `Échap`,
  clic sur le fond et bouton — focus piégé et restitué.
- Survol des cartes : `translateY(-2px)` 120 ms ; jamais d'animation sur `width`/`height`/
  `top` (uniquement `transform`/`opacity`).
- Squelettes : balayage `shimmer` 1.4 s, hauteur identique au contenu final (zéro CLS).
- `prefers-reduced-motion: reduce` → transitions ramenées à 0 ms, ticker figé, compteurs
  affichés directement.

### Principes non négociables

- **Aucun dégradé (gradient) nulle part dans l'interface** — couleurs plates uniquement (fonds,
  boutons, badges, cartes, états de survol).
- **Alignement strict sur une grille cohérente** : une échelle d'espacement unique dans toute
  l'app (classes Tailwind `p-*`/`m-*`/`gap-*` standard, base 4 px), jamais de valeur
  arbitraire type `mt-[13px]` sans raison documentée. Contenu aligné à gauche par défaut.
- **Palette en tokens, jamais en dur** : couleurs et tailles déclarées une seule fois dans
  `src/styles/app.css` (`@theme`) et référencées par leur nom de token (`bg-encre`,
  `text-volt`, `border-trait`) — jamais une valeur hex écrite directement dans une classe ou
  un style inline.
- **États d'interaction explicites** : hover, focus visible (anneau volt 2 px pour la navigation
  clavier), disabled (opacité 50 % + curseur), chargement et erreur sont visuellement distincts
  sur chaque élément interactif — jamais de composant sans retour visuel.
- **Cohérence inter-sections** : site public, espace joueur et tableau admin partagent la même
  base visuelle (`components/partages/`, mêmes tokens) — seule la densité d'information varie
  (l'admin affiche davantage de données par écran : tableaux 13 px, lignes 40 px).
- **Icônes** : Font Awesome uniquement, jamais d'emoji ni d'icône SVG inline copiée ; une icône
  accompagne toujours un libellé texte (sauf boutons d'action avec `aria-label`).

### Responsive obligatoire — 3 paliers testés systématiquement

- **Mobile** (< 768px) : une colonne, navigation par barre basse (joueur) ou menu plein écran
  (public), cibles tactiles d'au moins 44px, tableaux admin transformés en cartes.
- **Tablette** (768–1024px) : mise en page à 2 colonnes quand pertinent (ex. liste + détail),
  sidebar repliée en icônes.
- **Ordinateur** (> 1024px) : mise en page complète (sidebar + contenu, tableaux larges pour
  l'admin).
- Utiliser systématiquement les breakpoints Tailwind (`sm`/`md`/`lg`/`xl`) — jamais un composant
  qui déborde ou provoque un scroll horizontal de la page à une largeur intermédiaire (mesurer
  le débordement réel des dropdowns/modales/menus, pas seulement le `scrollWidth` du `body` —
  voir la compétence d'audit, point « Éléments flottants en mobile réel »).
- Chaque écran neuf est vérifié aux 3 paliers avant d'être considéré terminé.

---

## 7. Pièges connus (leçons retenues)

- **API TanStack Start (1.168+)** : la validation d'entrée d'une server function s'écrit
  `createServerFn({ method }).inputValidator(fn).handler(...)` — `.validator()` (docs plus
  anciennes) n'existe plus dans les types. Les utilitaires de requête viennent de
  `@tanstack/react-start/server` (`getRequest`, `getRequestHeader`, `setResponseHeader`,
  `getCookie`, `setCookie`, `deleteCookie`). Vérifier les `.d.ts` du paquet installé plutôt
  qu'une page de documentation.
- **Code serveur vs code client** : un module qui importe `@tanstack/react-start/server` ou
  lit `process.env` ne doit jamais être importé par un composant ni par un `beforeLoad`
  (exécuté aussi dans le navigateur). D'où le découpage `server/session.ts` (serveur seul,
  importé uniquement dans des handlers), `server/session-fns.ts` (server functions) et
  `server/gardes.ts` (client-safe). `SITE_URL` est fournie par une server function
  (`obtenirSiteUrl`) et non lue dans `head()`.
- **`Link` actif/inactif** : ne pas répéter toutes les classes dans `activeProps` (les deux
  `className` sont concaténés et deux utilitaires de même propriété se disputent) — mettre le
  socle dans `className`, les différences dans `activeProps` / `inactiveProps`.
- **`React.ReactNode` sans import** : `React` est un global UMD, inaccessible dans un module
  ES → `import type { ReactNode } from 'react'`.
- **Installation sur connexion lente** : `bun add` sans versions relance des téléchargements
  massifs (manifestes complets, binaires natifs rolldown/TypeScript 7/lightningcss de
  plusieurs dizaines de Mo). Épingler dans `package.json` les versions déjà présentes dans le
  cache bun (`~/.bun/install/cache`), lancer `bun install --network-concurrency 4
  --no-progress` depuis PowerShell (figé depuis Git Bash) en arrière-plan, relancer la même
  commande après une erreur `IntegrityCheckFailed` (le cache conserve ce qui est extrait).
  `nitro` (sortie Node de production) est chargé dynamiquement dans `vite.config.ts` : absent,
  le dev fonctionne ; présent, `bun run build` produit `.output/`.
- **Tailwind v4** : pas de `tailwind.config.ts`, pas de `content: []` — tout passe par
  `@import "tailwindcss"` et `@theme` dans `app.css` ; le plugin `@tailwindcss/vite` remplace
  PostCSS.
- **Font Awesome + SSR** : sans `config.autoAddCss = false` + import de
  `@fortawesome/fontawesome-svg-core/styles.css`, les icônes s'affichent en pleine largeur au
  premier rendu serveur.
- **`routeTree.gen.ts`** est régénéré à chaque `vite dev`/`vite build` : un fichier de route
  mal nommé (`$id.tsx` vs `[id].tsx`) ne produit pas d'erreur claire, seulement une route
  absente — vérifier l'arbre généré après chaque ajout.
- **Collision d'URL** : deux fichiers `tableau-de-bord.tsx` dans deux groupes `(…)` produisent
  la même URL — d'où les préfixes `/joueur` et `/admin` (§2).
- **Cookie `SameSite=Strict`** perd la session au retour d'une page de paiement externe →
  `Lax` (§1).
- **`<video>` et `Authorization`** : impossible d'ajouter un en-tête à une balise média → pont
  serveur (§1).
- **Progression d'upload** : une server function n'expose pas `onprogress` → route serveur +
  `XMLHttpRequest` (§1).
- **Routes du backend nécessaires aux clients** (ajoutées au backend pour ce frontend, voir la
  table des routes de `demarrage-backend.md`) : `GET /api/matchs` (mes matchs),
  `GET /api/defis?mes=1` (mes défis), `GET /api/defis/ouverts` (public, page « Défis » du site),
  `GET /api/configurations-financieres` (public), `GET /api/matchs/:id` et `GET /api/defis/:id`
  enrichis des noms (joueurs, jeu, plateforme) ; `categorie` sur chaque jeu, `famille` sur
  chaque plateforme, `jeuCategorie`/`plateformeFamille` sur les défis listés.
  Un écran qui a besoin d'une donnée que l'API ne renvoie pas ne la devine pas et ne la
  calcule pas : on fait évoluer le backend d'abord.
- **Recette mobile d'abord** (375 × 812, émulation tactile) : la majorité des joueurs sont sur
  téléphone. Deux pièges rencontrés : (1) un `backdrop-filter` (`backdrop-blur`) sur un header
  `sticky` fait de ce header le **bloc conteneur** de tout descendant `position: fixed` — le menu
  hamburger `fixed inset-x-0 top-16 bottom-0` se retrouve avec une hauteur de 0 px et le contenu
  de la page transparaît derrière les liens ; les headers sont donc opaques (`bg-craie`), sans
  flou. (2) Tout débordement horizontal, même transitoire, **élargit définitivement le viewport
  de mise en page du téléphone** (`innerWidth` 388 au lieu de 375, page qui « glisse ») :
  `html, body { overflow-x: clip }` dans `app.css`, titres de page en `text-h1 sm:text-display-sm`
  (un mot long comme « PLATEFORMES » en Unbounded 40 px dépasse les 343 px utiles). Vérifier sur
  chaque écran que `document.documentElement.scrollWidth === innerWidth`, menu ouvert compris.
- **Sélecteurs de catalogue** : jamais de valeur présélectionnée arbitraire (le premier jeu par
  ordre alphabétique de catégorie était « Fall Guys ») — placeholder « Choisissez un jeu » +
  validation `requis`, options groupées en `<optgroup>` par catégorie / famille.
- **Overlays plein écran (menu mobile, modales)** : `html` porte `overflow-x: clip`, donc un
  `overflow: hidden` posé sur `body` seul ne bloque plus le défilement de la fenêtre — verrouiller
  `html` **et** `body` (valeurs restaurées à la fermeture). Tout overlay embarque sa propre barre
  de fermeture (logo + X) et se rend dans `document.body` via `createPortal`, jamais en enfant
  d'un header `sticky` : sinon, dès que la page défile, la barre part avec elle et l'utilisateur
  ne peut plus fermer le menu (bug constaté en mobile).
- **Logo** : dans un rail de 76 px, seule la marque (`<Logo variante="marque" />`) ; le
  logotype complet exige ≥ 150 px utiles (il débordait par-dessus le header sur tablette).
- **Formulaires** : tout mot de passe passe par `InputMotDePasse` (voir/masquer, cible 44 px) ;
  le pays vient de `@/lib/pays` (`Select groupes={optionsPaysGroupees()}`, valeur = nom
  français) ; le téléphone du compte n'est jamais qualifié de « mobile money » hors des modales
  de paiement.
