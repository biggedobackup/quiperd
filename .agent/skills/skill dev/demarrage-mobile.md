# Création de l'application mobile de la plateforme QUI PERD

Je souhaite que vous créiez l'application mobile complète de **QUI PERD** en utilisant la
compétence définie dans ce fichier.

**QUI PERD** connecte des gamers du monde entier : un joueur crée un **défi** de match (jeu,
plateforme, mise en argent), un autre joueur le **rejoint**, les deux s'affrontent en réel sur
**EA SPORTS FC 27 (FIFA 27)** ou **eFootball**, déclarent le résultat, fournissent une preuve
(capture + vidéo), et **celui qui perd le match perd sa mise**.

> Le modèle de données, la charte API (formats, erreurs, authentification) et la liste
> complète des routes sont définis dans
> [`demarrage-backend.md`](demarrage-backend.md) — ce fichier ne les redéfinit jamais, il y
> renvoie. Toute évolution de contrat (nouveau champ, nouvelle route) se fait d'abord côté
> backend, puis se répercute ici.

## Équipe d'agents

Vous mettrez en place une équipe d'agents composée de :

- **Un chef d'équipe** : chargé de déléguer les tâches aux sous-agents
- **Des agents de développement** : dédiés au codage des écrans et services Flutter
- **Des agents de vérification** : chargés de la validation du code (`flutter analyze`,
  `flutter build`)
- **Des agents de test** : responsables des parcours fonctionnels sur émulateur/simulateur

## Processus de développement

- Chaque écran et chaque service devront être **testés et approuvés** sur émulateur/simulateur
  avant d'être considérés comme terminés.
- En cas d'**erreur**, l'agent principal en sera informé.
- L'agent principal **redéléguera** la tâche concernée à l'agent approprié.
- Ce processus sera **répété en boucle** jusqu'à ce que l'intégralité du travail soit
  entièrement terminée et validée.
- À la fin : **connexion à l'API réelle** — suppression de toute donnée mockée et branchement
  complet sur le backend Go (voir §4).

# Guide de Développement — QUI PERD (Mobile)

Document de référence pour le développement de l'application mobile **QUI PERD** avec
**Flutter (Dart)**, application unique Android/iOS pour les joueurs.

---

## 1. Stack Technique

| Catégorie              | Package / Technologie      | Rôle                                                         |
|--------------------------|-----------------------------|---------------------------------------------------------------|
| Framework               | Flutter (Dart)              | app unique Android/iOS                                        |
| Client HTTP             | `dio`                       | appels à l'API backend, intercepteur JWT, upload avec progression |
| Gestion d'état          | Riverpod (ou Provider)      | état des écrans, cache local des listes (défis, notifications) |
| Stockage sécurisé       | `flutter_secure_storage`    | jeton JWT — jamais `SharedPreferences` en clair                |
| Sélection média         | `image_picker`              | capture d'écran de fin de match                                |
| Lecture/capture vidéo   | `video_player` + `camera` ou `image_picker` (vidéo) | preuve vidéo du match                    |
| Notifications push      | `firebase_messaging`        | défi rejoint, match à valider, litige, paiement confirmé       |
| Formulaires             | `flutter_form_builder` (optionnel) | création de défi, dépôt/retrait                        |

---

## 2. Arborescence des Dossiers et Fichiers

```text
mobile/
├── lib/
│   ├── main.dart
│   ├── config/
│   │   └── environnement.dart   # apiBaseUrl (dev/prod)
│   ├── models/                  # miroir exact des DTO backend (camelCase français)
│   │   ├── utilisateur.dart
│   │   ├── compte_gamer.dart
│   │   ├── jeu.dart
│   │   ├── plateforme.dart
│   │   ├── defi.dart
│   │   ├── match_defi.dart          # classe `MatchDefi`, jamais `Match` (collision avec dart:core.Match, le type des regex)
│   │   ├── resultat_declare.dart
│   │   ├── preuve_match.dart
│   │   ├── litige.dart
│   │   ├── portefeuille.dart
│   │   ├── transaction_portefeuille.dart
│   │   ├── paiement.dart
│   │   └── notification.dart
│   ├── services/                # un client dio par module backend
│   │   ├── auth_service.dart
│   │   ├── utilisateurs_service.dart    # profil, changement de mot de passe
│   │   ├── comptes_gamers_service.dart
│   │   ├── jeux_service.dart            # catalogue en lecture seule — alimente la création de défi
│   │   ├── plateformes_service.dart     # catalogue en lecture seule — alimente la création de défi
│   │   ├── defis_service.dart
│   │   ├── matchs_service.dart          # inclut l'upload de preuve (module `preuves` côté backend)
│   │   ├── litiges_service.dart
│   │   ├── portefeuille_service.dart
│   │   ├── paiements_service.dart
│   │   └── notifications_service.dart
│   ├── providers/                # Riverpod : état auth, solde, liste de défis…
│   ├── screens/
│   │   ├── auth/                  # connexion, inscription, mot de passe oublié
│   │   ├── defis/                 # liste, filtres, création, détail, rejoindre
│   │   ├── matchs/                 # déclaration de score, upload preuve, suivi du statut
│   │   ├── portefeuille/           # solde, dépôt, retrait, historique des transactions
│   │   ├── litiges/                # ouverture, suivi
│   │   ├── notifications/
│   │   └── profil/                 # comptes gamers, paramètres du compte
│   └── widgets/                    # composants réutilisables (carte défi, badge statut…)
├── android/
├── ios/
└── pubspec.yaml
```

---

## 3. Écrans et Parcours

1. **Authentification** — inscription, connexion, mot de passe oublié. Jeton stocké via
   `flutter_secure_storage` dès la connexion réussie.
2. **Portefeuille** — solde disponible / bloqué, dépôt (LigdiCash/MoneyFusion via WebView
   ouverte dans le geste de clic, jamais après un `await`), retrait, historique des
   transactions.
3. **Défis** — liste des défis ouverts (filtres jeu/plateforme/mise), création d'un défi
   (vérifie le solde disponible avant l'appel API), détail, bouton « rejoindre ».
4. **Match** — une fois le défi rejoint : écran de suivi, déclaration du score en fin de
   partie, **confirmation du score proposé par l'adversaire** (`POST /matchs/:id/confirmation`,
   sans corps), choix **rejouer / partager** après un nul (`POST /matchs/:id/choix-nul`),
   manches, compte à rebours de l'échéance en cours, upload de la preuve (capture + vidéo, avec
   barre de progression — la vidéo peut être volumineuse), statut suivi en direct
   (`en_cours` → `preuve_requise` / `nul_en_attente` / `litige` → `termine`). La machine à
   états est celle de `demarrage-backend.md` §5.3 — le mobile ne réimplémente aucune règle.
5. **Litige** — ouverture depuis l'écran de match si désaccord, suivi de la décision arbitrale.
6. **Notifications** — liste + push FCM (défi rejoint, match à valider, litige, paiement
   confirmé) ; taper une notification ouvre l'écran concerné.
7. **Profil** — gestion des comptes gamers (identifiant par jeu/plateforme), modification du
   profil (`PATCH /api/utilisateurs/:id`) et changement de mot de passe
   (`POST /api/auth/changer-mot-de-passe`).

---

## 4. Connexion à l'API Réelle (dernière phase)

- Créer `mobile/lib/config/environnement.dart` (`apiBaseUrl`) avec un environnement dev
  (`http://localhost:8080/api` ou IP locale pour test sur appareil) et un environnement prod.
- Implémenter les services Dart (`dio`) module par module, en suivant strictement les réponses
  JSON du backend (camelCase français, voir la charte API dans `demarrage-backend.md` §1) —
  ne jamais renommer un champ côté mobile sans le faire d'abord évoluer côté backend.
- Un intercepteur `dio` ajoute `Authorization: Bearer <jwt>` sur chaque requête et gère le
  `401` (déconnexion automatique + redirection vers l'écran de connexion).
- Upload des preuves avec suivi de progression (`onSendProgress` de `dio`).
- Intégrer FCM : demander la permission, envoyer le jeton au backend (stocké dans
  `sessions_utilisateurs.jeton_fcm`), gérer les notifications en premier plan et en arrière-plan.
- Supprimer toute donnée mockée (`mobile/lib/mocks/` s'il en existe) une fois chaque écran
  branché.
- Valider sur émulateur/simulateur les parcours complets de bout en bout : inscription, dépôt,
  création de défi, un second compte qui rejoint, déclaration + preuve des deux côtés,
  validation du match, mise à jour du solde, retrait, et le parcours litige.

---

## 5. Points d'attention spécifiques au mobile

- **Jamais de solde ou de logique de règlement calculée côté mobile** : le mobile affiche ce
  que l'API renvoie, tout calcul (commission, gain, statut) est fait côté backend (§5 de
  `demarrage-backend.md`).
- **Paiement Mobile Money :** ouvrir l'URL de paiement hébergée (LigdiCash/MoneyFusion) dans
  une WebView native, jamais dans une iframe HTML.
- **Vidéo de preuve :** limiter la durée/taille côté client avant l'upload pour éviter les
  échecs réseau sur connexion mobile faible ; afficher un état « envoi en cours » explicite.
- **Hors-ligne / réseau instable :** les actions financières (créer un défi, rejoindre, dépôt,
  retrait) ne sont jamais retentées automatiquement côté client — en cas d'échec réseau,
  l'utilisateur est informé et peut relancer manuellement, pour éviter tout doublon.
- **Temps réel :** le mobile ouvre le **même** socket que le web (`GET /api/temps-reel`) et
  parle **le même contrat** — noms d'événements, salons et charges utiles sont ceux de
  [`backend/tempsreel/evenements.go`](../../../backend/tempsreel/evenements.go), source de
  vérité unique (miroir web : `frontend/src/temps-reel/evenements.ts`). Mêmes salons
  (`public:defis`, `utilisateur:<id>`, `match:<id>`, `admin`) et même authentification par
  **ticket à usage unique** : `POST /api/temps-reel/ticket` avec le Bearer, puis ouverture de
  `wss://…/api/temps-reel?ticket=…` — le ticket est consommé à la connexion, il faut en
  redemander un à chaque reconnexion. Le serveur envoie un ping toutes les 30 s ; répondre au
  pong et se reconnecter avec un backoff (1 s → 30 s) après une coupure, puis recharger les
  écrans concernés une seule fois. **Aucun polling** : ni `Timer.periodic` de rafraîchissement,
  ni rechargement automatique d'une liste — le serveur pousse (même règle que le web).
