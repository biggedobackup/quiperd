# Démarrage du projet QUI PERD — Orchestration séquentielle

Ce fichier est le **point d'entrée unique** pour construire QUI PERD. Il ne redéfinit ni stack,
ni routes, ni modèle de données — chaque sujet a déjà sa compétence dédiée. Son seul rôle est
d'imposer **l'ordre d'exécution** entre elles :

1. [`skills/skill dev/demarrage-backend.md`](skills/skill%20dev/demarrage-backend.md) — **Backend**
2. [`skills/skill dev/demarrage-web.md`](skills/skill%20dev/demarrage-web.md) — **Frontend Web**
3. [`skills/skill dev/demarrage-mobile.md`](skills/skill%20dev/demarrage-mobile.md) — **Mobile**
4. [`skills/skill deploiement/demarrage-deploiement.md`](skills/skill%20deploiement/demarrage-deploiement.md) — **Déploiement**

> **Règle absolue : ces 4 étapes s'exécutent strictement l'une après l'autre, jamais en
> parallèle.** L'étape N+1 ne démarre que lorsque l'étape N est **entièrement terminée et
> validée** selon les critères ci-dessous — même si, techniquement, certaines parties
> pourraient être menées de front. C'est un choix délibéré : chaque étape doit pouvoir
> s'appuyer sur une étape précédente stable, sans devoir composer avec un contrat encore
> mouvant.

## Pourquoi cet ordre

- Le **backend** est la source de vérité (modèle de données, charte API, routes) pour les 3
  autres compétences — rien ne peut être construit correctement avant qu'il soit stable.
- Le **frontend web** est construit avant le **mobile** : les itérations y sont plus rapides
  (rechargement navigateur vs compilation/émulateur), donc les problèmes de contrat API avec le
  backend y sont détectés et corrigés plus vite, avant d'investir dans le développement Flutter.
- Le **déploiement** vient en dernier : c'est la mise en production de l'ensemble, il n'a de
  sens qu'une fois backend, web et mobile terminés.

## Chef de projet (agent principal)

Un agent **chef de projet** pilote l'ensemble des 4 étapes :

- Il ouvre la compétence de l'étape en cours et met en place l'équipe d'agents qu'elle décrit
  (chef d'équipe local, agents de développement, de vérification, de test).
- Il **ne passe à l'étape suivante que sur un rapport de fin d'étape explicite** (voir critères
  ci-dessous) — jamais sur une simple impression que « ça a l'air prêt ».
- S'il découvre en cours d'étape N+1 qu'une correction est nécessaire sur l'étape N (ex. un
  champ manquant côté backend découvert en construisant le web), il **revient sur l'étape N**,
  corrige, revalide, puis reprend l'étape N+1 — jamais de correctif improvisé côté client pour
  contourner un manque côté backend.
- À la fin des 4 étapes, il produit un **rapport global** : ce qui a été construit, testé, et
  l'état du déploiement (URL, services actifs).

---

## Étape 1 — Backend

Ouvrir [`skills/skill dev/demarrage-backend.md`](skills/skill%20dev/demarrage-backend.md) et
suivre sa compétence intégralement.

**Critères de fin d'étape** (tous requis avant de passer à l'étape 2) :

- Les 13 modules métier (§2 du skill backend) sont codés, avec `models.go`, `services.go`,
  `controllers.go`, `permissions.go`, `routes.go` pour chacun.
- Toutes les routes de la table des routes (§4) répondent correctement à des **requêtes HTTP
  réelles** (pas de simulation) — succès, erreurs, permissions.
- Le **moteur de mise/escrow** (§5) est testé avec des scénarios concurrents (deux requêtes
  simultanées) : aucune double dépense, aucun double paiement.
- Les migrations et le seed s'exécutent proprement sur une base vide.
- Swagger (`/api/docs`) est à jour et reflète les routes réelles.

## Étape 2 — Frontend Web

Ouvrir [`skills/skill dev/demarrage-web.md`](skills/skill%20dev/demarrage-web.md) et suivre sa
compétence intégralement. **Ne démarre qu'après l'étape 1 entièrement validée.**

**Critères de fin d'étape :**

- Les 3 usages (site public, accès joueur, tableau admin) sont branchés sur l'API réelle du
  backend de l'étape 1 — plus aucune donnée mockée.
- Chaque route est testée dans le navigateur, y compris les parcours complets décrits au §5 du
  skill web (inscription/connexion joueur, création de défi, un second compte qui rejoint,
  déclaration + preuve, dépôt/retrait, et côté admin : décision de litige, configuration
  financière, suspension d'utilisateur).
- La connexion admin (`(admin)/connexion.tsx`) et la connexion joueur sont testées séparément.
- Le site public répond en SSR avec les meta tags attendus (vérification SEO de base).
- Le design respecte le §6 du skill web : aucun dégradé, alignement strict, et chaque parcours
  vérifié aux 3 paliers responsive (mobile < 768px, tablette 768–1024px, ordinateur > 1024px).

## Étape 3 — Mobile

Ouvrir [`skills/skill dev/demarrage-mobile.md`](skills/skill%20dev/demarrage-mobile.md) et
suivre sa compétence intégralement. **Ne démarre qu'après l'étape 2 entièrement validée.**

**Critères de fin d'étape :**

- L'application Flutter est branchée sur l'API réelle du backend de l'étape 1 — plus aucune
  donnée mockée.
- Chaque écran est testé sur émulateur/simulateur, y compris les parcours complets décrits au
  §4 du skill mobile (inscription, dépôt, création de défi, un second compte qui rejoint,
  déclaration + preuve des deux côtés, validation, mise à jour du solde, retrait, litige).
- Les notifications push (FCM) sont reçues en premier plan et en arrière-plan.
- Le comportement hors-ligne/réseau instable (§5 du skill mobile) est vérifié : pas de
  répétition automatique des actions financières.

## Étape 4 — Déploiement

Ouvrir
[`skills/skill deploiement/demarrage-deploiement.md`](skills/skill%20deploiement/demarrage-deploiement.md)
et suivre sa compétence intégralement. **Ne démarre qu'après l'étape 3 entièrement validée** —
c'est la mise en production du backend et du frontend web (le mobile suit son propre circuit de
publication sur les stores, hors de ce serveur).

**Critères de fin d'étape :**

- Tous les tests post-déploiement du §6 du skill de déploiement passent : santé des services,
  HTTPS valide sans avertissement, en-têtes de sécurité présents, PostgreSQL/Redis injoignables
  depuis l'extérieur, preuves de match non accessibles en chemin statique, callback de paiement
  atteint par le prestataire, restauration de sauvegarde vérifiée.
- Les sauvegardes automatiques (§7) sont programmées et actives.

---

### Rapport final

Une fois les 4 étapes validées, le chef de projet résume : ce qui fonctionne, les URL de
production (site, API, admin), les identifiants de test restants à supprimer avant l'ouverture
au public, et toute limitation connue (fonctionnalités reportées : classement, amis, chat,
parrainage, tournois — voir la conclusion du skill backend).
