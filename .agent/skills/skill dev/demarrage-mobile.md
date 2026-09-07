# Création de l'application mobile de la plateforme QUI PERD (Flutter & Dart — Espace Joueur)

Je souhaite que vous créiez l'application mobile complète de **QUI PERD** en utilisant la
compétence définie dans ce fichier, en parfaite harmonie avec le frontend web
(`frontend/`, TanStack Start) et le backend Go Fiber (`backend/`).

**QUI PERD** connecte des gamers : un joueur crée un **défi** de match (jeu, plateforme, mise
en argent), un autre joueur le **rejoint**, les deux s'affrontent en réel sur le jeu et la
plateforme du défi, déclarent le résultat, fournissent une preuve en cas de désaccord, et
**celui qui perd le match perd sa mise**.

> **Périmètre & parcours mobile :**
> - **Aucun site vitrine :** l'application ne contient aucune page marketing. À l'ouverture,
>   l'utilisateur passe par le splash / l'onboarding puis l'authentification, et accède
>   directement à son **Espace Joueur**.
> - **Espace joueur exclusivement :** l'administration reste cantonnée au web (`/admin`), avec
>   sa table `administrateurs` et sa route de connexion séparées. Aucun écran d'arbitrage,
>   aucune validation de preuve, aucune configuration financière dans l'application mobile.
> - **La plateforme couvre tous les jeux :** ne jamais nommer un jeu en dur dans un texte, un
>   titre, un libellé ou un placeholder. Le catalogue vient de `GET /api/jeux` et
>   `GET /api/plateformes`. Seule exception admise : l'illustration d'accueil
>   (`assets/images/hero-gaming.jpg`), fournie par le propriétaire.

> **Sources de vérité — ce fichier ne les redéfinit jamais, il y renvoie :**
> - [`demarrage-backend.md`](demarrage-backend.md) — modèle de données (§7), charte API (§1),
>   table des routes (§4), moteur de mise / escrow (§5), machine à états du match (§5.3),
>   couche temps réel (§5 bis).
> - [`demarrage-web.md`](demarrage-web.md) — système de design (§6), parcours joueur (§3.2)
>   dont les écrans mobiles sont le **miroir**, pièges connus (§7).
> - [`backend/tempsreel/evenements.go`](../../../backend/tempsreel/evenements.go) — contrat des
>   événements temps réel (miroir web : `frontend/src/temps-reel/evenements.ts`).
>
> Toute évolution de contrat (nouveau champ, nouvelle route) se fait **d'abord côté backend**,
> puis se répercute ici. Un écran qui a besoin d'une donnée que l'API ne renvoie pas ne la
> devine pas et ne la calcule pas.

## Équipe d'agents

Vous mettrez en place une équipe d'agents composée de :

- **Un chef d'équipe** : chargé de déléguer les tâches aux sous-agents.
- **Des agents de développement** : dédiés au codage des écrans, composants et services
  Flutter/Dart.
- **Des agents de vérification** : chargés de la validation du code (`flutter analyze`,
  `flutter build`, respect des règles de lint).
- **Des agents de test** : responsables des tests de widgets et des parcours fonctionnels sur
  émulateur/simulateur.

## Processus de développement

- Chaque écran et chaque service devront être **testés et approuvés** sur émulateur/simulateur
  avant d'être considérés comme terminés.
- En cas d'**erreur**, l'agent principal en sera informé.
- L'agent principal **redéléguera** la tâche concernée à l'agent approprié.
- Ce processus sera **répété en boucle** jusqu'à ce que l'intégralité du travail soit
  entièrement terminée et validée.
- **Aucune phase « mock »** : le backend est complet, documenté (Swagger sur `/api/docs`) et
  tourne en local. Les écrans sont branchés sur l'API réelle dès le premier jour ; il n'y a
  pas de dossier `mocks/` à créer puis à supprimer.

---

# Guide de Développement & Architecture — QUI PERD (Mobile Flutter)

Document de référence pour le développement de l'application mobile **QUI PERD** avec
**Flutter & Dart (Material 3 + thème maison)**, application unique Android/iOS pour les joueurs.

---

## 1. Stack Technique & Charte Graphique

> **Règle absolue : la stack ci-dessous est celle réellement déclarée dans
> `mobile/pubspec.yaml`, avec `pubspec.lock` déjà résolu.** Elle a été choisie **délibérément
> légère** (paquets officiels Dart/Flutter, peu de dépendances transitives, aucun binaire
> natif lourd) parce que le poste de développement a une connexion lente et instable :
> chaque paquet ajouté coûte un téléchargement réel. Un paquet manquant s'installe
> (`flutter pub add`), jamais ne se contourne — mais on ne **remplace** pas un paquet du
> tableau par un équivalent (`http` → `dio`, `provider` → `riverpod`, `shared_preferences` →
> `flutter_secure_storage`) sans demande explicite du propriétaire.

### Stack Technique

| Catégorie | Package / Technologie | Rôle & Justification |
| :--- | :--- | :--- |
| **Framework & Langage** | Flutter 3.x+ / Dart 3.10+ | Application native cross-platform (Android & iOS) |
| **Design System** | Material 3 + thème maison | `ThemeData` reconstruit depuis les tokens du web — jamais le thème Material par défaut |
| **Client HTTP** | `http` | Appels REST à l'API, `MultipartRequest` pour l'envoi des preuves |
| **Temps réel** | `web_socket_channel` | Socket `GET /api/temps-reel` — le serveur pousse, l'application ne redemande jamais périodiquement |
| **Gestion d'état** | `provider` (`ChangeNotifier`) | Session, portefeuille, notifications, catalogue, état du socket |
| **Stockage local** | `shared_preferences` | Jeton de session, pseudo, préférences d'affichage |
| **Formatage** | `intl` | Montants, dates et durées en fr-FR (`NumberFormat`, `DateFormat`) |
| **Média** | `image_picker` | Capture d'écran et vidéo de preuve (galerie **et** appareil photo) |
| **Page de paiement** | `webview_flutter` | Page hébergée du prestataire, affichée DANS l'application (`ecrans/paiement_web.ecran.dart`) |
| **Ouverture externe** | `url_launcher` | Échappatoire « ouvrir dans le navigateur » si la WebView échoue |
| **Liens profonds** | `app_links` | Un lien de défi partagé ouvre l'application sur la fiche du défi (`https://<hôte>/defis/<id>` et `quiperd://defis/<id>`) |
| **Icônes** | `cupertino_icons` + `Icons` Material | Aucune icône SVG copiée, aucun emoji dans l'interface |
| **Lint** | `flutter_lints` | `flutter analyze` doit rester à zéro avertissement |

**Deuxième phase — notifications push (pas encore dans `pubspec.yaml`).** Le backend est déjà
prêt : `POST /api/notifications/jeton-fcm` enregistre le jeton dans
`sessions_utilisateurs.jeton_fcm`, et le worker envoie réellement le push
(`backend/worker/worker.go` → `utils.EnvoyerPush`). Brancher `firebase_messaging` demande
d'ajouter le paquet, le fichier `google-services.json` et le plugin Gradle ; tant que ce n'est
pas fait, **les notifications arrivent par le socket** quand l'application est ouverte, ce qui
couvre déjà tout le parcours de match.

### Charte Graphique — les tokens du web, à l'identique

Le fichier `lib/theme/couleurs.dart` est la **transcription littérale** de `@theme` dans
`frontend/src/styles/app.css`. Aucune couleur n'est écrite en dur ailleurs dans l'application.

| Rôle | Constante Dart | Valeur | Usage |
| :--- | :--- | :--- | :--- |
| Encre | `Couleurs.encre` | `#0E0F12` | texte principal, blocs noirs (carte de solde, tableau de score, barre basse) |
| Craie | `Couleurs.craie` | `#FFFFFF` | fond des écrans : **blanc pur** |
| Papier | `Couleurs.papier` | `#FFFFFF` | cartes, champs, feuilles — séparés du fond par un trait, pas par une teinte |
| Gris | `Couleurs.gris` | `#F4F4F5` | seule surface discrète autorisée (en-tête de tableau, survol, pied de carte) |
| Vert | `Couleurs.vert` | `#15803D` | **actions** et pastilles d'icône, toujours avec du texte blanc (5,0:1 sur blanc) |
| Vert sombre | `Couleurs.vertSombre` | `#14532D` | pression d'un bouton vert, panneau d'appel |
| Vert pâle | `Couleurs.vertPale` | `#EAF7EF` | fond de badge, pastille discrète |
| Ardoise | `Couleurs.ardoise` | `#F6F8F7` | surface de section, très légèrement froide |
| Volt | `Couleurs.volt` | `#22C55E` | vert vif : surlignages et accents portant du **texte noir** |
| Gain | `Couleurs.gain` | `#15803D` | montants crédités, succès |
| Perte | `Couleurs.perte` | `#B91C1C` | montants débités, perte, actions destructrices |
| Alerte | `Couleurs.alerte` | `#A16207` | en attente, preuve exigée, litige en cours |
| Info | `Couleurs.info` | `#374151` | statut « en cours » (gris foncé, **jamais de bleu**) |
| Muet | `Couleurs.muet` | `#6B7280` | texte secondaire, légendes |
| Trait | `Couleurs.trait` | `#E4E4E7` | séparateurs, bordures de carte et de champ |

- **Règles strictes, non négociables :**
  - 🚫 **ZÉRO DÉGRADÉ** : aucun `LinearGradient`, `RadialGradient`, `SweepGradient`, aucune
    `ShaderMask` de couleur — partout, y compris pour un état pressé ou une ombre « colorée ».
  - ⚪ **Fond blanc, un seul thème** : `ThemeMode.light` en dur, aucun `ThemeData.dark()`, aucune
    lecture de `MediaQuery.platformBrightness`, aucune bascule clair/sombre. Le rendu sombre a
    été explicitement rejeté par le propriétaire.
  - ⚫ **Vert et noir** sont les seules couleurs d'identité ; rouge et ambre sont **sémantiques**
    (perte, attente) et s'emploient avec parcimonie.
  - Les grands aplats noirs (carte de solde, tableau de score, barre de navigation basse) sont
    un choix de composition, pas un thème.
  - **Aucune valeur hexadécimale écrite dans un widget** : tout passe par `Couleurs.*`.

### Typographie — identique au site, sans exception

Les trois fichiers variables sont **embarqués** dans `assets/fonts/` (aucun téléchargement au
lancement) et déclarés dans `pubspec.yaml`. Les graisses se demandent par `fontVariations`.

- **Titres** : `Unbounded`, **en CAPITALES**, interlettrage serré, graisse 700.
- **Texte** : `Manrope`, corps 16 / hauteur 1.6, légende 13.
- **Chiffres** : `JetBrainsMono` pour **tout** montant, score, référence, compteur et minuteur,
  avec `fontFeatures: [FontFeature.tabularFigures()]` pour que les colonnes s'alignent.
- Échelle déclarée **une seule fois** dans `lib/theme/typographie.dart`, jamais une taille
  improvisée écran par écran :

| Style | Taille | Police | Correspondance web |
| :--- | :--- | :--- | :--- |
| `display` | 40 | Unbounded 700 | `text-display-sm` (le `display` 72 px du web n'a pas sa place sur 375 px) |
| `h1` | 32 | Unbounded 700 | `text-h1` |
| `h2` | 24 | Unbounded 700 | `text-h2` |
| `h3` | 18 | Unbounded 700 | `text-h3` |
| `corps` | 16 | Manrope 400/600 | `text-corps` |
| `legende` | 13 | Manrope 400 | `text-legende` |
| `etiquette` | 11 | Unbounded 700, capitales, `letterSpacing: 1.3` | `.etiquette` |
| `chiffres` | hérite | JetBrainsMono, tabulaire | `.chiffres` |

### Ergonomie mobile

- **Barre de navigation inférieure** (`NavigationBar` Material 3, fond encre) pour les cinq
  sections principales — les mêmes que la barre basse du web (§3.1).
- **Tiroir latéral** (`Drawer`) pour les écrans secondaires et les pages légales.
- **Feuilles inférieures** (`showModalBottomSheet`) plutôt que des boîtes de dialogue centrées
  pour toute saisie : déclaration du résultat, choix après un nul, ouverture de litige, dépôt,
  retrait. Le pouce atteint le bas de l'écran, pas le milieu.
- **Cibles tactiles ≥ 48 px** (Material) — et jamais moins de 44 px, y compris pour les icônes
  d'action et les puces de filtre.
- **Aucun défilement horizontal** : un texte long se tronque (`TextOverflow.ellipsis`) ou passe
  à la ligne, il ne pousse jamais la mise en page.
- **Geste de rafraîchissement manuel** (`RefreshIndicator`) autorisé sur les listes : c'est une
  action de l'utilisateur. **Aucune minuterie de rafraîchissement** (voir §7).
- **Retour haptique** discret sur les actions engageantes (créer un défi, rejoindre, déclarer),
  et `SafeArea` sur chaque écran (encoches, barre de gestes).

---

## 2. Démarrage & Authentification

Accès immédiat à l'application, sans page vitrine.

### Parcours de lancement

1. **Écran de démarrage (splash)** — logotype QUI PERD centré sur fond blanc, indicateur discret.
   - Le jeton est lu dans `shared_preferences` puis **validé** par `GET /api/auth/moi` (un jeton
     peut avoir expiré ou le compte avoir été suspendu) → redirection vers
     `/joueur/tableau-de-bord`.
   - Jeton absent ou refusé → `/onboarding` (premier lancement) ou `/connexion`.
2. **Écran de découverte (onboarding)** — 3 diapositives sur l'illustration
   `assets/images/hero-gaming.jpg` : *créez un défi et misez* → *un adversaire rejoint, les deux
   mises passent en séquestre* → *le gagnant remporte tout*. Boutons **Se connecter** /
   **Créer un compte**. Vu une fois (drapeau en préférences), jamais réaffiché.

> **Règle absolue, valable sur TOUT l'écran et TOUTE l'application :** dès que l'utilisateur est
> connecté, les libellés « Se connecter » et « Créer un compte » **ne s'affichent plus nulle
> part** — ni en en-tête, ni dans un état vide, ni au pied d'une liste. Ils sont remplacés par
> « Créer un défi », « Mon espace » ou « Voir et rejoindre ».

### Écrans d'authentification (miroir exact des routes publiques du web)

| Écran | Champs réels du web | Route API |
| :--- | :--- | :--- |
| **Connexion** | « E-mail ou pseudo », « Mot de passe » (voir/masquer) | `POST /api/auth/connexion` |
| **Inscription** | « Pseudo QUI PERD », « E-mail », « Mot de passe » (6 car. min.) + « Confirmation », « Pays » (liste groupée), « Téléphone » (indicatif prérempli au choix du pays) | `POST /api/auth/inscription` |
| **Mot de passe oublié** | « E-mail » | `POST /api/auth/mot-de-passe-oublie` |
| **Réinitialisation** | jeton reçu par e-mail + nouveau mot de passe | `POST /api/auth/reinitialisation-mot-de-passe` |

Le jeton renvoyé est écrit dans `shared_preferences` **avant** toute navigation ; la déconnexion
appelle `POST /api/auth/deconnexion`, **vide l'état local** (solde, matchs, notifications,
litiges) et ferme le socket — un téléphone prêté ne doit jamais montrer les données du
précédent.

### Confirmation de l'adresse e-mail — bloquante pour l'argent

Écran dédié à **code à 6 chiffres** (six champs, collage du code accepté, passage automatique au
champ suivant), miroir de `/joueur/confirmation-email` :

- `POST /api/auth/verification-email` (corps `{ "code": "123456" }`) — le code vit 30 minutes,
  **5 essais** maximum, après quoi il faut en redemander un ;
- `POST /api/auth/verification-email/renvoyer` — verrou anti-renvoi de **60 secondes**, à
  décompter visiblement sur le bouton ;
- écran de succès « Adresse confirmée » puis retour à l'endroit d'où l'on venait.

**Ce que l'adresse non confirmée bloque réellement (403 côté backend) :** créer un défi,
rejoindre un défi, demander un retrait. **Le dépôt reste ouvert** côté API : faire entrer de
l'argent ne présente pas le même risque.

**Mais l'application, elle, ferme tout.** Demande explicite de l'utilisateur : « sur l'app mobile
quand on s'inscrit on doit être bloqué direct sur la confirmation du compte par e-mail avant
d'aller sur le tableau ». C'est aussi ce que fait le web, où `routes/joueur.tsx` renvoie sur la
saisie du code tant que `emailVerifie` est faux.

L'implémentation tient en une ligne de l'aiguillage racine (`app.dart`) :

```dart
if (session.connecte && session.emailNonConfirme) {
  return const ConfirmationEmailEcran(bloquant: true);
}
if (session.connecte) return CoquilleEcran(key: cleCoquille);
```

Trois points à ne pas perdre :

- l'écran de code est la **racine**, pas un écran poussé : il n'y a rien derrière lui, le bouton
  retour du téléphone sort de l'application au lieu de découvrir le tableau de bord ;
- il porte donc un bouton **« Se déconnecter »**. Sans lui, un joueur qui ne reçoit pas son
  courriel serait enfermé dans son compte, sans aucun moyen d'en sortir ;
- `bloquant` est un **paramètre explicite**, jamais deviné. `Navigator.of(context).canPop()`
  répond « oui » au premier rendu — l'écran d'inscription est encore empilé au-dessus, il ne sera
  dépilé qu'à la fin de la frame — et l'écran s'affichait alors sans sortie et avec le mauvais
  texte de bas de page. Erreur commise, vue à l'émulateur, corrigée par le paramètre.

Conséquence : **aucun bandeau « adresse non confirmée » dans la coquille ni dans le tiroir**, ils
ne pourraient plus jamais s'afficher. Le bandeau reste là où il garde un sens — création de défi
et portefeuille — pour le cas où le serveur refuse en 403 une session locale qui se croyait à
jour. Une fois le code accepté, `rafraichirUtilisateur()` met `emailVerifie` à vrai et
l'aiguillage bascule seul sur la coquille : rien à dépiler.

---

## 3. Espace Joueur Mobile — les sections réelles du frontend

Les écrans ci-dessous reprennent **section par section** ce que le frontend affiche
réellement. Les libellés cités entre guillemets sont ceux du site : ils ne se réécrivent pas.

### 3.1 Navigation

**Barre de navigation inférieure — exactement les cinq entrées de `layout-joueur.tsx` :**

| Ordre | Destination | Libellé mobile | Libellé complet |
| :--- | :--- | :--- | :--- |
| 1 | `/joueur/tableau-de-bord` | **Accueil** | Tableau de bord |
| 2 | `/joueur/defis` | **Défis** | Défis |
| 3 | `/joueur/matchs` | **Matchs** | Mes matchs |
| 4 | `/joueur/portefeuille` | **Argent** | Portefeuille |
| 5 | `/joueur/profil` | **Profil** | Profil |

L'entrée active est en **volt** avec un liseré de 3 px, les autres en craie à 60 % — fond encre.

**Barre du haut :** logotype, **cloche de notifications** avec pastille de non-lues, et bouton
de compte (monogramme sur fond vert) ouvrant un menu : pseudo, e-mail, « Mon profil »,
« Déconnexion ».

**Tiroir latéral — il liste TOUT, y compris les cinq onglets de la barre basse.** Demande
explicite de l'utilisateur : « dans le drawer menu je veux qu'il y ait tous les menus, accueil,
défis, matchs, argent, profil etc. » Celui qui ouvre le menu cherche une destination, pas la
moitié des destinations : devoir refermer le tiroir pour atteindre le portefeuille n'a pas de
sens. Deux groupes séparés par un filet :

1. les cinq onglets, **construits à partir de `CoquilleEcranState.onglets`** — la même liste que
   la barre basse, donc impossible que les deux divergent — avec l'entrée en cours marquée en
   vert (fond `vertPale`, libellé gras). L'index actif est **passé en paramètre** au tiroir :
   un `const _Tiroir()` ne se reconstruirait pas au changement d'onglet et marquerait la
   mauvaise entrée ;
2. les écrans secondaires : Litiges · Notifications · **Classement** · Aide & contact ·
   Déconnexion.

Le solde disponible est rappelé en haut, comme dans la barre latérale du web.

### 3.2 Tableau de bord (`/joueur/tableau-de-bord`)

**Ordre imposé par l'utilisateur** — l'argent, puis ce qui se joue, et les notifications en
dernier : « sur l'accueil il faut mettre notification en dernier, tu réduis un peu le cadre où
il y a le solde, et après cela un match en cours, et il y a défis ouverts. » Les notifications
rendent compte de ce qui vient d'arriver ; placées avant les matchs, elles repoussaient
l'essentiel sous la ligne de flottaison.

- En-tête : « Bonjour » / « Bonsoir » selon l'heure + **pseudo**, sous-titre « Votre arène :
  solde, matchs en cours, défis à relever. », actions **Déposer** et **Créer un défi**.
- **Carte de solde** (bloc noir), volontairement **resserrée** : rembourrage 16, montant en 28,
  interlignes courts. Elle gagne une soixantaine de pixels, ce qui suffit à faire entrer
  « Matchs en cours » dans le premier écran d'un téléphone courant. « Solde disponible » en
  compteur animé volt, « Bloqué en séquestre » en dessous, lien « Historique ».
- Section **« Matchs en cours »** (`GET /api/matchs?statut=en_cours`) + lien « Tous mes matchs » ;
  état vide : « Aucun match en cours ».
- Section **« Défis ouverts »** (3 cartes) + lien « Tous les défis » ; état vide : « Aucun défi
  disponible » avec bouton « Créer un défi ».
- **L'ordre de ces deux sections dépend de ce que le joueur a en cours** — même règle que sur le
  web, demandée par l'utilisateur : avec un match ouvert, les matchs passent devant ; **sans
  aucun match, les défis ouverts passent en premier** et l'état vide des matchs descend. Les
  deux blocs sont donc construits par `_sectionMatchs()` / `_sectionDefis()`, qui rendent une
  `List<Widget>` étalée dans l'ordre voulu. Pendant le chargement, ordre habituel : on ne sait
  pas encore, et intervertir les blocs sous les yeux du joueur serait pire.
- **Carte Notifications, en dernier** : les 4 dernières (pastille pleine si non lue, date
  relative) + « Tout voir ».

### 3.3 Défis (`/joueur/defis`)

- Deux **onglets** : « Défis ouverts » (l'arène) et « Mes défis ».
- **Filtres de l'arène : dans une feuille, jamais dépliés sur la page** (l'onglet « Mes défis »
  n'en a pas). Demande explicite de l'utilisateur : « il ne faut pas afficher les filtres
  directement comme ça, ça prend trop de place ; il faut les masquer, et si on clique sur un
  bouton une modale peut s'afficher pour faire un filtre. » Les quatre champs dépliés
  occupaient plus de la moitié de l'écran avant le premier défi.
  - la page ne porte qu'une **barre compacte** : un bouton « Filtrer », qui devient
    « Filtres · N » en vert dès qu'un critère est posé — sans ce compte, une liste filtrée
    ressemble à une arène vide — et un bouton « Effacer » à côté ;
  - `ouvrirFiltresDefis` (`composants/joueur/feuilles/filtres_defis.feuille.dart`) ouvre la
    feuille. Elle travaille sur une **copie** : la liste derrière ne bouge pas et ne relance
    aucune requête à chaque frappe. « Voir les défis » rend les filtres, « Tout effacer » rend
    `FiltresDefis.aucun`, et refermer la feuille rend `null` — on garde alors ce qu'on avait.
  - **Ne pas redéfinir `shape` ni ajouter une poignée** : le thème pose déjà `showDragHandle` et
    le rayon de 28 pour toutes les feuilles. En ajouter une donnait deux poignées empilées.
  - Les listes de jeux et de plateformes restent **groupées** — 7 catégories (`sport`, `combat`,
    `course`, `tir`, `strategie`, `cartes`, `arcade`) et 3 familles (`pc`, `console`, `mobile`) —
    et **jamais présélectionnées** : placeholder « Toutes les catégories » / « Choisissez un jeu ».
- **Carte de défi** : catégorie, jeu, plateforme, mise en gros chiffres, créateur, compte à
  rebours d'expiration.
- **Onglet « Mes défis »** : badge de statut, mise, « jeu · plateforme · créé il y a … », compte
  à rebours « expire dans », bouton **Détail** et bouton **Annuler** (feuille de confirmation
  qui rappelle que « votre mise vous sera rendue en totalité, sans commission »).
- **Indicateur « en direct »** visible, et quand un adversaire rejoint **mon** défi : une
  **invitation** apparaît (« X a rejoint votre défi », boutons « Voir le match » / « Plus
  tard »). **Jamais de navigation forcée** : le joueur peut être en train de faire autre chose.

### 3.4 Nouveau défi (`/joueur/defis/nouveau`)

Formulaire + **récapitulatif** :

- « Jeu » (groupé par catégorie) et « Plateforme » (groupée par famille), obligatoires.
- « Mise par joueur » en FCFA, bornée par `miseMinimale` / `miseMaximale` lues sur l'API, aide
  rappelant le solde disponible ; **puces de mise rapide** 500 / 1 000 / 2 000 / 5 000 / 10 000
  (filtrées par les bornes).
- « Durée d'ouverture » : 6 h, 12 h, **24 h (défaut)**, 48 h, 72 h — « sans adversaire à
  l'échéance, le défi expire et la mise vous est rendue en totalité, sans commission ».
- « Règles du match (optionnel) », 500 caractères maximum.
- **Récapitulatif** (bloc noir) : votre mise (bloquée), mise de l'adversaire, total en séquestre,
  commission (taux lu sur l'API), **gain estimé si vous gagnez** — avec la mention que le montant
  réel est calculé par la plateforme au règlement.
- Solde insuffisant → bouton désactivé + encart rouge « Déposer des fonds ».

### 3.5 Détail d'un défi (`/joueur/defis/:id`)

Surtitre « Défi · *jeu* », titre = **le montant de la mise**, « Proposé par *pseudo* » ou « Vous
avez créé ce défi ». Fiche : statut, plateforme, date de création, expiration (compte à rebours),
« Règles du match ». Bloc **enjeu** : mise par joueur, total en séquestre, commission.

Action principale : **« Miser *X* et accepter »**, où *X* est la mise réelle du défi —
« Miser 1 500 FCFA et accepter », « Miser 20 000 FCFA et accepter ». Demande explicite de
l'utilisateur, qui lisait « Rejoindre ce défi » : « ça doit être dynamique, quand c'est 3 000 ça
doit être écrit 3 000, si c'est 20 000 ça doit être écrit cette somme simplement. » Le montant
est la somme qui quitte le solde à la seconde où l'on appuie ; la lire ailleurs sur l'écran ne
remplace pas de la lire sur le bouton qu'on presse. Confirmation par-dessus (« Bloquer *X* et
jouer »), ou **Annuler** pour son propre défi.

Le libellé du bouton **diverge ici du web**, qui dit « Rejoindre pour *X* » : les deux portent le
montant, seule la formulation change, à la demande de l'utilisateur pour le mobile.

**« Copier le lien du défi »**, tant que le défi est ouvert. Le lien est
`Environnement.lienDefi(id)` = `<SITE_BASE_URL>/defis/<id>`, la page **publique** du site : le
destinataire voit le défi avant même d'avoir un compte. `SITE_BASE_URL` s'impose à la
compilation (`--dart-define=SITE_BASE_URL=https://quiperd.com`) ; en développement on vise
`http://10.0.2.2:3000`, l'alias de l'hôte vu depuis l'émulateur.

Le bouton **copie**, il n'ouvre pas la feuille de partage du système : `share_plus` n'est pas
dans le cache pub du poste et la connexion ne permet pas de le télécharger de façon fiable. Le
libellé le dit — on ne promet pas un partage natif qu'on ne rend pas. Si le paquet est ajouté
un jour, le libellé devient « Partager le défi » et `_partager` appelle `Share.share`.

**Piège de développement :** `vite dev` se liait à `::1` seulement, donc `10.0.2.2:3000` était
injoignable depuis l'émulateur et le lien copié ne s'ouvrait pas. Le script `dev` du frontend
porte maintenant `--host` : sans lui, tout test de lien partagé depuis l'émulateur échoue sans
que rien n'indique pourquoi.

### Liens profonds — un lien partagé ouvre l'application, pas le navigateur

Demande de l'utilisateur : « si je partage et qu'il clique dessus, si l'app est installée ça doit
ouvrir l'app pour aller sur la section. » Paquet : **`app_links`** (résolu depuis le cache pub,
aucun téléchargement).

**Deux formes de lien, deux rôles :**

| Forme | Vérification | Rôle |
|---|---|---|
| `https://<hôte>/defis/<id>` | App Link : exige `assetlinks.json` servi par le domaine | le lien qui circule vraiment (WhatsApp, SMS) |
| `quiperd://defis/<id>` | aucune | développement et porte de secours |

Les deux sont déclarés dans `AndroidManifest.xml`. L'hôte n'est **pas** écrit en dur : il vient
d'un `manifestPlaceholders["deepLinkHost"]` alimenté par `-Pdeep-link-host=…`, par défaut
`10.0.2.2` (l'hôte vu depuis l'émulateur). **`SITE_BASE_URL` et `deep-link-host` vont toujours
ensemble** — le premier construit le lien, le second décide quel lien l'application intercepte ;
les désaccorder produit des liens ignorés en silence.

`frontend/public/.well-known/assetlinks.json` porte l'empreinte SHA-256 du certificat de
signature (aujourd'hui la clé de debug, puisque `build.gradle.kts` signe la release avec elle —
**à régénérer le jour où une vraie clé de release est créée**, sinon les liens cassent en
production). Le site le sert déjà en `application/json`.

Sans ce fichier publié en **https** sur le vrai domaine, Android 12+ laisse le lien au
navigateur : ce n'est pas une panne, la page publique du site prend le relais. Pour tester sur
l'émulateur, on force l'association :
`adb shell pm set-app-links-user-selection --user 0 --package com.quiperd.app true <hôte>`.

**Côté Dart** : `_RacineState` écoute `AppLinks().uriLinkStream` et lit `getInitialLink()`.
`defiIdDepuis()` (`noyau/liens_profonds.dart`) extrait l'identifiant — et **n'accepte qu'un
UUID**, pour que `/defis/nouveau` ou `/defis/ouverts` ne poussent pas un écran de détail vide.

Trois règles qui ont chacune coûté un essai :

1. **Un lien reçu trop tôt est mis en attente**, pas perdu : joueur pas connecté, ou adresse non
   confirmée. Il est rejoué depuis `build`, à l'instant où la coquille s'ouvre. Sans cela,
   cliquer sur un lien puis se connecter perdait le défi en route.
2. **`_surLien` passe par `setState`.** Ce n'est pas cosmétique : c'est lui qui garantit qu'une
   frame est planifiée. Sans elle, un lien qui arrive alors que l'écran est déjà stable ne
   déclenche aucun rendu et le `addPostFrameCallback` attend indéfiniment — vécu :
   l'application s'ouvrait bien, mais sur le tableau de bord au lieu du défi.
3. **L'ouverture est programmée APRÈS le `popUntil`** qui dépile les écrans d'entrée, sinon la
   fiche poussée est dépilée dans la même frame.

Côté iOS, seul le schéma propre est déclaré (`CFBundleURLTypes`). Le lien https y demande un
Universal Link : capacité Associated Domains dans Xcode **et** un fichier
`apple-app-site-association` servi par le site.

### La photo de l'adversaire, partout où on le nomme

Demande de l'utilisateur : « quand quelqu'un accepte mon défi on doit voir aussi sa photo de
profil s'il en a. » On joue de l'argent contre quelqu'un ; un pseudo seul ne dit pas à qui.

`AvatarJoueur` (`composants/joueur/avatar_joueur.dart`, jumeau du `AvatarJoueur` du web) est
posé sur la **carte de match** et sur l'**écran de match**, à côté de « Face à … ». Il affiche
la photo si `joueur1Photo` / `joueur2Photo` n'est pas vide, le monogramme sinon — et retombe sur
le monogramme si l'image ne charge pas (session expirée, fichier retiré) plutôt que d'afficher un
carré cassé. La pastille garde la même taille dans les deux cas : la mise en page ne saute pas
quand l'image arrive.

L'image passe par `UtilisateursService.urlPhoto` **avec les en-têtes d'authentification** : la
route est protégée, un `Image.network` nu renverrait 401.

### 3.6 Mes matchs (`/joueur/matchs`)

Puces de filtre par statut, avec les libellés exacts de `lib/statuts.ts` : **Tous**, « En cours »,
« Preuve exigée », « Match nul », « Litige », « Terminé ». Cartes de match (adversaire, jeu,
mise, badge de statut, échéance en cours).

### 3.7 Écran de match (`/joueur/matchs/:id`) — le cœur du produit

L'écran suit **la machine à états du backend** (`demarrage-backend.md` §5.3) ; le mobile ne
réimplémente aucune règle. En-tête : « *jeu* · *plateforme* · Manche *n* », « *moi* vs
*adversaire* », « Mise de X par joueur · 2X en séquestre jusqu'au règlement ».

**Bloc d'action prioritaire, tout en haut de l'écran** (un seul à la fois, selon le statut) :

1. **Score à confirmer** — l'adversaire a déclaré : deux actions claires, **« Confirmer 1-3 »**
   (`POST /matchs/:id/confirmation`, **sans corps** : le score confirmé est celui du serveur, le
   client ne peut donc rien falsifier) ou « Proposer un autre score ». Compte à rebours de
   confirmation.
2. **`nul_en_attente`** — choix **rejouer / partager** (`POST /matchs/:id/choix-nul`) en
   rappelant la conséquence financière (rejouer = aucun mouvement d'argent ; partager = mise
   rendue moins la commission) et le choix déjà exprimé par l'adversaire.
3. **`preuve_requise`** — les déclarations divergent : envoi de preuve des deux côtés avant
   l'échéance, avec l'état « vous avez envoyé » / « l'adversaire a envoyé ».
4. **En attente de l'adversaire** — j'ai déclaré, lui pas encore : chrono de confirmation.
5. **`termine`** — résultat : gagné/perdu, gain crédité, commission, ou partage / abandon.

**Puis, dans l'ordre :** tableau de score (`KADER 3 — 1 MOUSSA`, mono, fond encre, gagnant
souligné en volt) · présence de l'adversaire · **chronologie du match** · carte
**« Déclarations »** (ma ligne et celle de l'adversaire, bouton « Déclarer le score ») · carte
**« Que faire maintenant ? »** (consignes cochées au fur et à mesure) · section **« Preuves »**
(envoi + lecture des fichiers déposés, avec l'auteur de chacun).

Actions de l'en-tête : « Mes matchs », « Déclarer le score », **« Ouvrir un litige »** (possible
en `en_cours`, `preuve_requise`, `nul_en_attente`, `verification`).

**Comptes à rebours :** l'échéance est **posée par le serveur** (`match.echeance` +
`echeanceType`) et simplement égrenée côté client (`Timer.periodic` d'affichage seulement, aucun
appel réseau). À l'expiration, on ne devine pas l'issue : on demande **une fois** l'état du match.

### 3.8 Portefeuille (`/joueur/portefeuille`)

- En-tête : « Le solde bloqué correspond à vos mises engagées. Tout le disponible est misable ;
  un dépôt doit avoir été joué avant de pouvoir être retiré. » Actions **Retirer** et
  **Déposer**. (L'ancienne phrase, « seul le solde disponible peut être misé ou retiré », est
  devenue fausse le jour où la règle du dépôt joué est entrée en vigueur.)
- Deux cartes : **« Disponible »** (bloc noir, compteur animé volt) et **« Bloqué en séquestre »**
  (« Vos mises engagées sur des défis ou matchs en cours »). Un solde qui vient de bouger est
  signalé par une pastille « Mis à jour ».
- **La légende du disponible a deux formes**, jamais la même : « Misable et retirable. » quand
  `soldeNonJoue` vaut 0, sinon « Misable en entier. Retirable : *X* — le reste vient d'un dépôt
  à jouer d'abord. » Annoncer « retirable » ce qui ne l'est pas se paie au retrait refusé.
- **Feuille Retrait** : le plafond est `soldeRetirable` (jamais le disponible brut), et un encart
  ambre nomme le montant non joué et la façon d'y remédier — miser. Le message d'erreur d'un 422
  vient du serveur : il couvre aussi bien le solde insuffisant que le dépôt pas encore joué, on
  ne le contredit pas par un titre « Solde insuffisant ».
- **Paiements en cours** : une carte par dépôt/retrait suivi, avec une phrase qui dit quoi faire
  (« Validez la demande sur votre téléphone : le solde se met à jour ici tout seul. »).
- **Historique** paginé (20 mouvements par page) : Mouvement (+ description), Date, Référence,
  Statut, Montant signé — crédit en vert, débit en rouge, commission liée à un match en gris
  (informative, déjà déduite). Un mouvement reçu en direct alors qu'on lit une page ancienne
  affiche un bandeau « *n* nouveaux mouvements » avec un bouton « Voir la page 1 ».
- **Feuille Dépôt** : montant (min. 100, **entier** — le XOF n'a pas de subdivision), prestataire,
  numéro Mobile Money. La liste des prestataires vient de `GET /api/paiements/prestataires` via
  `CatalogueEtat.prestataires` : **jamais de liste écrite en dur**, car une passerelle non
  configurée côté serveur est refusée par un 400 que le joueur ne peut pas comprendre. Trois cas
  à couvrir : liste vide → encart « Aucun moyen de paiement n'est disponible pour le moment »
  sans formulaire ; un seul → « Paiement via <nom>. » et pas de liste déroulante à un choix ;
  plusieurs → `ListeDeroulante`. Le caractère obligatoire du numéro vient du champ `numeroRequis`
  du serveur, pas d'un test sur le code du prestataire, et le plancher du montant vient de
  `montantMinimum` (200 F chez MoneyFusion, 100 ailleurs) — les mises rapides sous ce seuil
  disparaissent.
  Quand l'API renvoie `urlPaiement`, la page hébergée s'ouvre dans **`PaiementWebEcran`**
  (route nommée `paiement-web`) : le joueur ne quitte pas l'application, et l'écran se referme
  tout seul dès que l'événement `paiement.statut` annonce l'issue. Jamais de redirection vers
  le navigateur du système, qui laissait le joueur hors de l'application avec un solde à
  vérifier lui-même. La carte « paiements en cours » garde l'URL et propose **« Reprendre le
  paiement »** tant que le dépôt est en attente : refermer l'écran par mégarde ne doit pas
  condamner un paiement encore valable.
- **Feuille Retrait** : « Montant à recevoir » (min. 500, entier), prestataire (même liste, même
  trois cas), numéro ; **les frais sont calculés par le backend et affichés avant confirmation**
  — « le montant et les frais sont débités immédiatement ; en cas d'échec, tout est recrédité ».

### 3.9 Litiges (`/joueur/litiges`)

« Tant qu'un litige est en cours, les deux mises restent bloquées. L'arbitre règle le match au
gagnant ou rend leur mise aux deux joueurs, moins la commission. » Une carte par litige : badge
(« En arbitrage » / « Résolu »), décision, « *joueur 1* vs *joueur 2* », jeu et mise, dates
d'ouverture et de résolution, **motif entre guillemets**, mouvements d'argent reçus en direct, et
un lien « Voir le match ». État vide : « Aucun litige — tant mieux : vos matchs se règlent sans
arbitre. »

### 3.10 Notifications (`/joueur/notifications`)

Liste avec icône par type et libellés de `typesNotification` (« Défi accepté », « Défi expiré »,
« Match à valider », « Score à confirmer », « Déclarations divergentes », « Match nul »,
« Nouvelle manche », « Délai de confirmation écoulé », « Match terminé », « Litige ouvert »,
« Litige résolu », « Paiement confirmé », « Paiement échoué »). Marquage lu
(`POST /api/notifications/:id/lue`) ; **taper une notification ouvre l'écran concerné**. Aucune
alerte flottante ici : le joueur regarde déjà l'écran, la ligne qui apparaît suffit.

### 3.11 Profil (`/joueur/profil`)

Trois blocs, comme le web :

1. **Profil** — « Pseudo », « Pays » (liste groupée), « Téléphone » (format international,
   indicatif prérempli au choix du pays), « Photo de profil (URL) » →
   `PATCH /api/utilisateurs/:id`.
2. **Mot de passe** — actuel, nouveau, confirmation → `POST /api/auth/changer-mot-de-passe`.
3. **« Mes identifiants de joueur »** (comptes gamers) — « Votre pseudo dans chaque jeu, pour que
   l'adversaire vous trouve en ligne » : liste (identifiant, jeu · plateforme · nom affiché,
   suppression confirmée) et formulaire d'ajout (jeu, plateforme, « Identifiant en jeu »,
   « Nom affiché (optionnel) »).

### 3.12 Classement — écran propre au mobile

`GET /api/classement?periode=general|mois|semaine&limite=50` (route **publique**, enrichie de la
ligne du joueur connecté quand un jeton est présent). Trois onglets de période ; par ligne :
rang, photo/monogramme, pseudo, pays, matchs, victoires, **gains réellement crédités**. Si le
joueur connecté n'est pas dans le haut du tableau, sa ligne (`moi`) est **épinglée en bas**.
Le classement est recalculé à la lecture côté serveur : rien n'est agrégé côté mobile.

### 3.13 Aide & contact

FAQ en accordéon (les mêmes questions que le site, dont les montants et la commission viennent
de `GET /api/configurations-financieres` — **jamais un pourcentage codé en dur**) et formulaire
« Nous contacter » : nom, e-mail, sujet, message → `POST /api/contact` (nom et e-mail
préremplis pour un joueur connecté ; anti-spam 5 messages/heure/IP → **429** traduit en message
clair). Jamais un formulaire sans route backend derrière.

---

## 4. Arborescence des Dossiers et Fichiers

### Règle de nesting

Un dossier n'existe que s'il regroupe **au moins deux fichiers liés** (`defis/`, `matchs/`,
`feuilles/`, `communs/`). Un écran ou un composant qui tient dans un seul fichier reste
**directement** dans son dossier de domaine — pas de sous-dossier pour un fichier unique.
Contrairement au frontend web (où un composant impose plusieurs fichiers), un widget Flutter est
un seul `.dart` : imiter l'arborescence du web ajouterait de la profondeur sans raison.

**Conventions de nommage** (les mêmes que l'application mobile IKADRIVE) : `snake_case` pour les
fichiers, suffixe de rôle en point — `*.ecran.dart`, `*.feuille.dart`, `*.service.dart`,
`*.modele.dart`, `*.etat.dart` ; les widgets partagés gardent un nom simple.

```text
mobile/
├── analysis_options.yaml
├── pubspec.yaml
├── assets/
│   ├── fonts/
│   │   ├── Unbounded.ttf
│   │   ├── Manrope.ttf
│   │   └── JetBrainsMono.ttf
│   └── images/
│       └── hero-gaming.jpg
├── lib/
│   ├── main.dart
│   ├── app.dart                                 # MaterialApp, thème, routeur, providers racine
│   │
│   ├── config/
│   │   └── environnement.dart                   # apiBaseUrl / wsBaseUrl (dev, émulateur, prod)
│   │
│   ├── theme/
│   │   ├── couleurs.dart                        # transcription des tokens de app.css
│   │   ├── typographie.dart                     # Unbounded / Manrope / JetBrainsMono + échelle
│   │   └── theme.dart                           # ThemeData Material 3, clair uniquement
│   │
│   ├── noyau/
│   │   ├── client_api.dart                      # http + Bearer JWT + gestion du 401 et des erreurs
│   │   ├── resultat.dart                        # Succes<T> / Echec (statut, message, details)
│   │   ├── session_locale.dart                  # shared_preferences : jeton, pseudo, onboarding vu
│   │   ├── routeur.dart                         # onGenerateRoute + gardes invité / connecté
│   │   ├── format.dart                          # montants FCFA, dates, dates relatives, durées
│   │   ├── statuts.dart                         # libellés + couleurs de chaque statut backend
│   │   ├── catalogue.dart                       # 7 catégories de jeu, 3 familles de plateforme
│   │   └── validateurs.dart                     # e-mail, pseudo, mot de passe, téléphone, montant
│   │
│   ├── temps_reel/
│   │   ├── evenements.dart                      # miroir de backend/tempsreel/evenements.go
│   │   ├── salons.dart                          # public:defis, utilisateur:<id>, match:<id>
│   │   └── client_temps_reel.dart               # ticket, socket, abonnements, backoff, ping/pong
│   │
│   ├── modeles/
│   │   ├── utilisateur.modele.dart
│   │   ├── compte_gamer.modele.dart
│   │   ├── jeu.modele.dart
│   │   ├── plateforme.modele.dart
│   │   ├── regles_financieres.modele.dart       # commissionDefi, miseMinimale, miseMaximale, fraisRetrait
│   │   ├── defi.modele.dart
│   │   ├── match_defi.modele.dart               # classe `MatchDefi`, JAMAIS `Match` (dart:core)
│   │   ├── resultat_declare.modele.dart
│   │   ├── choix_nul.modele.dart
│   │   ├── preuve_match.modele.dart
│   │   ├── litige.modele.dart
│   │   ├── portefeuille.modele.dart
│   │   ├── transaction_portefeuille.modele.dart
│   │   ├── paiement.modele.dart
│   │   ├── notification_joueur.modele.dart      # `Notification` est pris par flutter/widgets
│   │   ├── ligne_classement.modele.dart
│   │   └── message_contact.modele.dart
│   │
│   ├── services/                                # un service par module backend
│   │   ├── auth.service.dart                    # inscription, connexion, moi, déconnexion, mot de passe, code e-mail
│   │   ├── utilisateurs.service.dart            # PATCH profil
│   │   ├── comptes_gamers.service.dart
│   │   ├── catalogue.service.dart               # jeux, plateformes, configurations-financieres
│   │   ├── defis.service.dart
│   │   ├── matchs.service.dart                  # liste, détail, déclaration, confirmation, choix-nul
│   │   ├── preuves.service.dart                 # multipart + lecture du fichier authentifiée
│   │   ├── litiges.service.dart
│   │   ├── portefeuille.service.dart
│   │   ├── paiements.service.dart               # dépôt, retrait
│   │   ├── notifications.service.dart           # liste, marquer lue, jeton FCM (phase 2)
│   │   ├── classement.service.dart
│   │   └── contact.service.dart
│   │
│   ├── etats/                                   # ChangeNotifier exposés par provider
│   │   ├── session.etat.dart                    # utilisateur courant, jeton, e-mail confirmé
│   │   ├── catalogue.etat.dart                  # jeux, plateformes, règles financières
│   │   ├── defis.etat.dart
│   │   ├── matchs.etat.dart
│   │   ├── portefeuille.etat.dart
│   │   ├── notifications.etat.dart
│   │   └── temps_reel.etat.dart                 # état du socket : connecté / reconnexion / hors ligne
│   │
│   ├── ecrans/
│   │   ├── demarrage/
│   │   │   ├── splash.ecran.dart
│   │   │   └── onboarding.ecran.dart
│   │   ├── authentification/
│   │   │   ├── connexion.ecran.dart
│   │   │   ├── inscription.ecran.dart
│   │   │   ├── mot_de_passe_oublie.ecran.dart
│   │   │   ├── reinitialisation_mot_de_passe.ecran.dart
│   │   │   └── confirmation_email.ecran.dart
│   │   ├── coquille.ecran.dart                  # Scaffold : barre du haut, barre basse, tiroir
│   │   ├── tableau_de_bord.ecran.dart
│   │   ├── defis/
│   │   │   ├── defis.ecran.dart                 # onglets « Défis ouverts » / « Mes défis » + filtres
│   │   │   ├── nouveau_defi.ecran.dart
│   │   │   └── detail_defi.ecran.dart
│   │   ├── matchs/
│   │   │   ├── matchs.ecran.dart
│   │   │   └── detail_match.ecran.dart
│   │   ├── portefeuille.ecran.dart
│   │   ├── litiges.ecran.dart
│   │   ├── notifications.ecran.dart
│   │   ├── classement.ecran.dart
│   │   ├── profil.ecran.dart
│   │   └── aide.ecran.dart                      # FAQ + formulaire de contact
│   │
│   └── composants/
│       ├── communs/
│       │   ├── bouton.dart                      # primaire / secondaire / volt / danger / fantôme
│       │   ├── champ_texte.dart
│       │   ├── champ_mot_de_passe.dart          # voir/masquer, cible 48 px
│       │   ├── liste_deroulante.dart            # options groupées (catégorie, famille, pays)
│       │   ├── badge_statut.dart
│       │   ├── etat_vide.dart
│       │   ├── squelette.dart                   # chargement, hauteur identique au contenu final
│       │   ├── indicateur_direct.dart           # « en direct » / « reconnexion… »
│       │   ├── message.dart                     # succès / erreur / info / attention
│       │   └── confirmation.dart                # feuille de confirmation générique
│       └── joueur/
│           ├── carte_defi.dart
│           ├── carte_match.dart
│           ├── tableau_score.dart
│           ├── compte_a_rebours.dart
│           ├── chronologie_match.dart
│           ├── confirmation_score.dart
│           ├── panneaux_match.dart              # attente / nul / preuve exigée
│           ├── presence_adversaire.dart
│           ├── resultat_match.dart
│           ├── envoi_preuve.dart
│           ├── lecteur_preuve.dart
│           ├── bandeau_email_non_confirme.dart
│           └── feuilles/
│               ├── declaration_score.feuille.dart
│               ├── choix_nul.feuille.dart
│               ├── litige.feuille.dart
│               ├── depot.feuille.dart
│               └── retrait.feuille.dart
│
├── android/
├── ios/
└── test/
    ├── unit/
    └── widget/
```

---

## 5. Table des Écrans et Routes de l'Application

Routage par `onGenerateRoute` (`noyau/routeur.dart`), avec des noms **calqués sur les URL du
web** pour que les deux clients se lisent de la même façon. Une **garde invité** empêche un
joueur connecté d'atteindre connexion/inscription ; une **garde connecté** renvoie vers
`/connexion` toute route `/joueur/*` sans session valide.

| Route | Écran | Accès | Description |
| :--- | :--- | :--- | :--- |
| `/` | `SplashEcran` | Public | Lecture du jeton et validation par `GET /api/auth/moi` |
| `/onboarding` | `OnboardingEcran` | Invité | 3 diapositives, vues une seule fois |
| `/connexion` | `ConnexionEcran` | Invité | E-mail ou pseudo + mot de passe |
| `/inscription` | `InscriptionEcran` | Invité | Pseudo, e-mail, mot de passe, pays, téléphone |
| `/mot-de-passe-oublie` | `MotDePasseOublieEcran` | Invité | Demande de réinitialisation |
| `/reinitialisation-mot-de-passe` | `ReinitialisationMotDePasseEcran` | Invité | Nouveau mot de passe |
| `/joueur/confirmation-email` | `ConfirmationEmailEcran` | Joueur | Code à 6 chiffres, renvoi après 60 s |
| `/joueur/tableau-de-bord` | `TableauDeBordEcran` | Joueur | Solde, notifications, matchs en cours, défis ouverts |
| `/joueur/defis` | `DefisEcran` | Joueur | Onglets « Défis ouverts » / « Mes défis », filtres |
| `/joueur/defis/nouveau` | `NouveauDefiEcran` | Joueur (e-mail confirmé) | Création + récapitulatif d'enjeu |
| `/joueur/defis/:id` | `DetailDefiEcran` | Joueur | Fiche du défi, rejoindre ou annuler |
| `/joueur/matchs` | `MatchsEcran` | Joueur | Mes matchs, filtre par statut |
| `/joueur/matchs/:id` | `DetailMatchEcran` | Joueur | Déclaration, confirmation, nul, preuve, litige, résultat |
| `/joueur/portefeuille` | `PortefeuilleEcran` | Joueur | Soldes, dépôt, retrait, historique paginé |
| `/joueur/litiges` | `LitigesEcran` | Joueur | Suivi de l'arbitrage |
| `/joueur/notifications` | `NotificationsEcran` | Joueur | Liste + marquage lu |
| `/joueur/classement` | `ClassementEcran` | Public (enrichi si connecté) | Général / mois / semaine, ligne « moi » épinglée |
| `/joueur/profil` | `ProfilEcran` | Joueur | Profil, mot de passe, comptes gamers |
| `/aide` | `AideEcran` | Public | FAQ + formulaire de contact |

---

## 6. Contrat d'API et Branchement Réel

### Base URL

`lib/config/environnement.dart` — une seule source, choisie à la compilation :

- Émulateur Android : `http://10.0.2.2:8080/api` (l'alias de la machine hôte).
- Simulateur iOS : `http://localhost:8080/api`.
- Appareil physique : `http://<IP_DU_POSTE>:8080/api`.
- Production : `https://…/api` — et `wss://…/api/temps-reel` pour le socket.

### Politique réseau : serveurs internes et certificats

L'application est aujourd'hui **permissive avec les serveurs internes**, dans les trois couches
qui peuvent couper une connexion. Sans elles, un serveur interne répond parfaitement mais
l'application affiche « connexion impossible », ce qui envoie chercher un bug d'API là où il n'y
en a pas.

| Couche | Fichier | Ce qu'elle autorise |
| --- | --- | --- |
| Dart | `lib/noyau/reseau.dart` (`ReseauPermissif`, installé en tête de `main()`) | Tout certificat TLS, pour le REST, le socket et les images — tout ce qui passe par `dart:io`. |
| Android | `android/app/src/main/res/xml/network_security_config.xml` | HTTP en clair vers n'importe quel hôte, et les autorités installées sur l'appareil (`user`). **Source set `main`** : vaut aussi en `release`, car la recette s'installe en APK release. |
| iOS | `ios/Runner/Info.plist` (`NSAppTransportSecurity`) | `NSAllowsArbitraryLoads` + `NSAllowsLocalNetworking`, plus `NSLocalNetworkUsageDescription`. |

La **WebView de paiement** est un composant natif : les overrides Dart ne s'y appliquent pas.
C'est `onSslAuthError: (e) => e.proceed()` dans `paiement_web.ecran.dart` qui la laisse charger
une page servie par un certificat auto-signé.

Interrupteur unique pour une version destinée aux joueurs :
`flutter build apk --release --dart-define=RESEAU_PERMISSIF=false` (le rappel `onSslAuthError`
n'est alors pas posé non plus). Retirer en plus l'attribut `networkSecurityConfig` du manifeste
et le bloc ATS de l'`Info.plist` pour revenir à une politique stricte de bout en bout.

Pour **prouver** que les certificats inconnus passent, `backend/tests/outils/proxy-tls` sert
l'API en HTTPS derrière un certificat auto-signé fabriqué à chaque démarrage :

```
go run ./tests/outils/proxy-tls -port 8443 -cible http://127.0.0.1:8080
flutter build apk --release --dart-define=API_BASE_URL=https://10.0.2.2:8443/api
```

### Charte API (rappel — détail complet dans `demarrage-backend.md` §1)

- **JSON en camelCase français** : `nomUtilisateur`, `montantMise`, `soldeDisponible`,
  `dateCreation`, `gagnantId`, `echeanceType`… Ne jamais renommer un champ côté mobile.
- **Énumérations en `snake_case`** : `en_cours`, `preuve_requise`, `nul_en_attente`, `termine`,
  `capture_ecran`, `mise_bloquee`, `ligdicash`, `fusionmoney`.
- **Les montants arrivent en chaîne décimale** (`"2000"`, `"1750.50"`) parce que le backend
  utilise `shopspring/decimal`. Ils sont **stockés en `String`** dans les modèles Dart et
  convertis en `num` **uniquement pour l'affichage**. Aucune addition, aucune commission,
  aucun gain n'est calculé côté mobile.
- **Erreurs** : `{ "erreur": "message" }`, plus `details` pour une erreur de validation. Le
  client traduit les codes en messages : `401` (session expirée → déconnexion),
  `403` (adresse e-mail non confirmée → écran de code), `422` (solde insuffisant),
  `429` (trop de tentatives), `413` (fichier trop volumineux).
- **Authentification** : `Authorization: Bearer <jwt>` posé par `client_api.dart` sur chaque
  requête. Le backend ne lit **que** cet en-tête (le cookie `HttpOnly` est propre au serveur
  web TanStack Start, il ne concerne pas le mobile).

### Routes consommées par le mobile

| Domaine | Routes |
| :--- | :--- |
| Auth | `POST /auth/inscription`, `/auth/connexion`, `/auth/mot-de-passe-oublie`, `/auth/reinitialisation-mot-de-passe`, `POST /auth/deconnexion`, `GET /auth/moi`, `POST /auth/changer-mot-de-passe`, `POST /auth/verification-email`, `POST /auth/verification-email/renvoyer` |
| Catalogue | `GET /jeux`, `GET /plateformes`, `GET /configurations-financieres` (public) |
| Profil | `PATCH /utilisateurs/:id`, `GET\|POST\|PATCH\|DELETE /comptes-gamers` |
| Défis | `GET /defis/ouverts` (public), `GET /defis` (`?mes=1`, filtres), `POST /defis`, `GET /defis/:id`, `POST /defis/:id/rejoindre`, `DELETE /defis/:id` |
| Matchs | `GET /matchs` (`?statut=`), `GET /matchs/:id`, `POST /matchs/:id/declaration`, `POST /matchs/:id/confirmation` (sans corps), `POST /matchs/:id/choix-nul` |
| Preuves | `POST /matchs/:id/preuves` (multipart `type` + `fichier`), `GET /matchs/:id/preuves`, `GET /preuves/:id/fichier` |
| Litiges | `POST /matchs/:id/litige`, `GET /litiges` |
| Argent | `GET /portefeuille`, `GET /portefeuille/transactions` (`?limite=20&decalage=`), `POST /paiements/depot`, `POST /paiements/retrait` |
| Notifications | `GET /notifications`, `POST /notifications/:id/lue`, `POST /notifications/jeton-fcm` (phase 2) |
| Classement | `GET /classement?periode=&limite=` (public, enrichi si connecté) |
| Contact | `POST /contact` |
| Temps réel | `POST /temps-reel/ticket`, `GET /temps-reel?ticket=…` |

### Envoi des preuves

`POST /api/matchs/:id/preuves` en `multipart/form-data`, champs **`type`**
(`capture_ecran` ou `video`) et **`fichier`**. Extensions acceptées : images
(`jpg`, `jpeg`, `png`, `webp`, `heic`) et vidéos (`mp4`, `mov`, `webm`, `mkv`), **50 Mo maximum**
(`UPLOAD_MAX_MO`, `413` au-delà). Le serveur calcule une empreinte SHA-256 : **une preuve déjà
utilisée pour un autre match est refusée**. Le fichier se lit via la route **authentifiée**
`GET /api/preuves/:id/fichier` — jamais par une URL statique.

### Paiement Mobile Money

`POST /api/paiements/depot` renvoie une `urlPaiement` quand le prestataire héberge la page :
elle s'ouvre avec `url_launcher` en `LaunchMode.externalApplication`, **jamais dans une iframe
ni dans une vue interne bricolée**. On ne fait ensuite **aucun sondage** : l'issue arrive par
l'événement `paiement.statut` sur le salon privé du joueur, et le solde par `portefeuille.maj`.

---

## 7. Temps Réel — « aucun polling », la même règle que le web

Le mobile ouvre **le même socket** que le web et parle **le même contrat** : noms d'événements,
salons et charges utiles sont ceux de
[`backend/tempsreel/evenements.go`](../../../backend/tempsreel/evenements.go), source de vérité
unique (miroir web : `frontend/src/temps-reel/evenements.ts`).

- **Authentification par ticket à usage unique** : `POST /api/temps-reel/ticket` avec le Bearer,
  puis ouverture de `wss://…/api/temps-reel?ticket=…`. Le ticket est **consommé à la
  connexion** : il faut en redemander un à **chaque** reconnexion. Un ticket invalide ne ferme
  pas le socket — la connexion bascule en « visiteur » (salons publics seulement) et le client
  doit redemander un ticket.
- **Salons** : `public:defis` (l'arène), `utilisateur:<id>` (argent, notifications — monté une
  seule fois pour tout l'espace joueur), `match:<id>` (les deux joueurs), `admin` (jamais côté
  mobile). Un salon interdit est **refusé explicitement**, jamais ignoré en silence.
- **Ping / pong** toutes les 30 s ; à la coupure, reconnexion avec **backoff 1 s → 30 s**, puis
  **une seule** resynchronisation des écrans concernés.
  La **première** connexion n'est pas une reconnexion : les écrans viennent de charger, il n'y a
  rien à rattraper. Le compteur `ClientTempsReel.reconnexions` ne compte donc que les
  **reprises** (`if (_dejaConnecte) _reconnexions++`). Le compter dès la première ouverture a
  coûté cher : les écrans se construisent avant que le socket ne soit ouvert, ils partaient donc
  de `reconnexions == 0`, voyaient le compteur passer à 1 une seconde plus tard et
  redemandaient portefeuille, notifications, matchs et défis **au démarrage** — cinq requêtes
  en double à chaque lancement, sur le réseau où elles coûtent le plus cher. Symptôme à
  reconnaître dans le journal du backend : deux vagues identiques d'appels espacées d'une
  seconde.
- **Aucun polling, jamais** : ni `Timer.periodic` de rafraîchissement, ni rechargement
  automatique d'une liste, ni bandeau « actualisé toutes les N secondes ». Les seules minuteries
  autorisées sont **d'affichage** : comptes à rebours calculés depuis une échéance fournie par
  le serveur, et animation de compteur. L'indicateur visible parle de l'état du direct
  (« en direct », « reconnexion… »), jamais d'un cycle de rafraîchissement.
- **Ce qui doit arriver poussé** : création / annulation / expiration / acceptation d'un défi,
  score proposé, confirmé ou divergent, match nul et choix des deux joueurs, rejeu, abandon,
  preuve déposée, litige ouvert ou résolu, fin de match et gain, solde, transaction, statut de
  paiement, notification, présence de l'adversaire.
- **Cycle de vie Android/iOS** : le socket se ferme proprement quand l'application passe en
  arrière-plan (`AppLifecycleState.paused`) et se rouvre — **avec un nouveau ticket** — au
  retour au premier plan, suivi d'une resynchronisation unique. Quitter un écran de match envoie
  un `desabonner` sur `match:<id>`, sans quoi la pastille « en ligne » de l'adversaire resterait
  allumée.

---

## 8. Points d'attention spécifiques au mobile

- **Jamais de calcul d'argent côté mobile.** Solde, commission, gain, frais de retrait, issue
  d'un match : le mobile **affiche ce que l'API renvoie**. Tout est calculé par le moteur
  d'escrow du backend (`demarrage-backend.md` §5).
- **Noms de classes qui entrent en collision avec Flutter/Dart** : `Match` (type des expressions
  régulières de `dart:core`) → **`MatchDefi`** ; `Notification` (classe de
  `package:flutter/widgets.dart`, base de `NotificationListener`) → **`NotificationJoueur`** ;
  `Route` et `Page` (Navigator) → ne jamais nommer ainsi un modèle.
- **Réseau instable — aucune reprise automatique d'une action financière.** Créer un défi,
  rejoindre, déclarer un score, déposer, retirer : en cas d'échec réseau, on informe et on laisse
  l'utilisateur **relancer manuellement**. Un rejeu automatique créerait un doublon d'argent.
  Corollaire : un bouton d'action est désactivé pendant l'envoi et montre son état de chargement.
- **Vidéo de preuve** : limiter la durée et la taille **avant** l'envoi (`image_picker` accepte
  `maxDuration`), afficher une barre de progression réelle et un état « envoi en cours »
  explicite — sur une connexion mobile faible, un envoi muet est perçu comme un plantage.
- **Permissions** : `INTERNET` seule dans le manifeste principal ; l'appareil photo et la
  galerie sont demandés **au moment** de l'envoi d'une preuve, avec une explication, et un refus
  n'empêche jamais d'accéder au reste de l'application.
- **`applicationId` / `namespace` = `com.quiperd.app`** (et `MainActivity.kt` sous
  `kotlin/com/quiperd/app/`) — plus aucun reste de `com.example.quiperd`.
- **Déconnexion et compte suspendu** : un `401` sur n'importe quelle requête efface le jeton,
  vide l'état local, ferme le socket et ramène à `/connexion` avec un message clair.
- **Accessibilité** : chaque bouton d'icône porte un `tooltip`/`semanticsLabel`, les contrastes
  sont ceux du web (les couleurs ont été choisies pour être AA sur blanc), et les tailles de
  police suivent le réglage système (`MediaQuery.textScaler`) sans casser la mise en page.

---

## 9. Pièges connus (leçons payées en séance)

Chacun de ces points a réellement coûté un écran rouge ou un parcours bloqué pendant
la recette de l'application ; ils sont vérifiés, pas théoriques.

- **`context.read` dans `dispose()` fait planter l'écran.** Lire un `InheritedWidget`
  pendant le démontage lève `'_dependents.isEmpty': is not true` et l'écran devient rouge.
  On capture la référence (`ClientTempsReel`, providers…) dans `initState` — `late final
  _direct = context.read<ClientTempsReel>()` — et `dispose()` n'utilise que ce champ.
- **`pushReplacement` depuis un écran servi par `home` détruit l'aiguillage.** L'écran de
  connexion est le CONTENU de la route racine, pas une route empilée : le remplacer retire
  la route `/`, donc le widget qui bascule vers l'espace joueur. Symptôme : l'inscription
  réussit (201 côté serveur) mais l'écran reste figé sur le formulaire. Entre écrans
  d'entrée, on utilise `push`, et `pop()` pour revenir.
- **Un écran d'entrée POUSSÉ reste au-dessus après la connexion.** L'aiguillage racine
  change bien `home`, mais la route empilée le masque : il faut un
  `popUntil((r) => r.isFirst)` au passage « déconnecté → connecté », symétrique de celui de
  la déconnexion.
- **`DropdownButton` exige une valeur UNIQUE.** Un même pays figure à la fois dans « Pays
  fréquents » et dans « Tous les pays » : deux entrées de même valeur font échouer une
  assertion. La liste déroulante déduplique par valeur (première occurrence gardée) — un
  test de widget couvre ce cas précis.
- **`findAncestorStateOfType` ne traverse pas les routes.** Depuis un écran empilé, la
  coquille (barre basse, onglets) n'est pas un ancêtre : sans clé globale, « Confirmer mon
  adresse » et « Déposer des fonds » depuis « Nouveau défi » ne faisaient rien. D'où
  `cleCoquille`, une `GlobalKey<CoquilleEcranState>` en repli.
- **Une hauteur tendue étire un bloc informatif sur tout l'écran.** Un `Container` posé
  directement dans le corps d'un `Scaffold` reçoit la hauteur maximale. On le place dans une
  liste (`ListView`) pour qu'il reprenne la taille de son contenu.
- **`intl` sépare les milliers par une espace insécable ÉTROITE (U+202F)**, que Manrope ne
  possède pas : « 21600 FCFA » au lieu de « 21 600 FCFA » dans tout le texte courant. Le
  formateur la remplace par l'espace insécable ordinaire (U+00A0).
- **Sous 45 secondes, le sens d'un écart de date n'est que du décalage d'horloge** entre le
  serveur et le téléphone : « créé dans un instant » pour un défi qu'on vient de créer. Le
  format relatif dit « à l'instant » des deux côtés.
- **Un score non réglé n'est pas un score.** En cas de désaccord, le backend garde la
  DERNIÈRE déclaration reçue dans `scoreJoueur1/2` — la version de l'adversaire. L'afficher
  en grand ferait croire au joueur qu'il perd 1-3. Le tableau de score et la carte de match
  n'affichent des chiffres que lorsque `gagnantId` est renseigné.
- **Un match clos sans vainqueur n'est pas forcément un nul** : ce peut être un
  remboursement décidé par l'arbitre. Les deux ne se disent pas de la même façon.
- **Libellés trop longs pour une demi-largeur** : « Photographier » déborde sur 375 px ;
  les boutons côte à côte tiennent en un mot (« Photo », « Galerie »).
- **Onglets de la barre basse : un seul chemin pour changer d'onglet.** `IndexedStack` construit
  *tous* ses enfants — les cinq écrans lançaient leurs appels au démarrage, 19 requêtes avant le
  premier écran utile. La construction paresseuse passe par
  `composants/communs/pile_paresseuse.dart` : c'est **elle** qui tient le registre des onglets
  déjà vus, à partir de l'index qu'elle reçoit. Une première version confiait ce registre à la
  coquille ; la barre du bas changeait `_index` directement, sans passer par `allerA`, et
  l'onglet « Argent » s'ouvrait sur un écran **blanc**. Leçon générale : quand un état dérivé
  doit suivre une valeur, le faire suivre par le composant qui reçoit la valeur, pas par
  discipline aux points d'appel.
- **Pilotage de la recette** : `adb shell input tap` travaille en pixels de l'appareil
  (1080 × 2400 sur l'émulateur de référence), pas dans le repère de la capture. Le clavier
  déplace la mise en page : on enchaîne les champs par l'action « suivant » du clavier
  (`input keyevent 66`) plutôt que par des coordonnées absolues, et `keyevent 4` (retour)
  ferme l'application quand aucun clavier n'est ouvert.

---

## 10. Recette — la définition de « terminé »

Un écran n'est pas terminé parce qu'il compile. Dans l'ordre, et à 100 % :

1. `flutter analyze` — **zéro** avertissement, zéro `TODO` laissé dans un chemin d'exécution.
2. `flutter test` — tests de widgets des composants critiques (badge de statut, compte à rebours,
   tableau de score, formatage des montants).
3. `flutter build apk --debug` (et `flutter build ios --no-codesign` si la cible iOS est active).
4. **Recette sur émulateur/simulateur, tous les parcours, pas seulement ceux qu'on vient de
   toucher** : premier lancement et onboarding · inscription · confirmation de l'e-mail (code,
   renvoi, essais épuisés) · connexion · mot de passe oublié · dépôt Mobile Money et retour dans
   l'application · création d'un défi · annulation d'un défi · **un second compte** qui rejoint ·
   déclaration du résultat des deux côtés (accord immédiat) · déclaration divergente → preuve des
   deux côtés → litige · match nul → rejouer, puis match nul → partager · échéance dépassée
   (abandon) · retrait · notifications · classement · profil et comptes gamers · formulaire de
   contact · déconnexion.
5. **Vérifications transverses à chaque écran** : aucun défilement horizontal, cibles ≥ 48 px,
   textes lisibles sans zoom, états de chargement / vide / erreur présents, **aucun libellé
   « Se connecter » ou « Créer un compte » une fois connecté**, aucun dégradé, aucune couleur
   hors tokens, aucune minuterie de rafraîchissement.
6. **Vérification du direct** : deux appareils (ou un appareil + le web) sur le même match ; ce
   que fait l'un apparaît chez l'autre **sans aucune action de rafraîchissement**. Couper puis
   rétablir le réseau : l'indicateur passe en « reconnexion… », le socket revient avec un
   nouveau ticket et l'écran se resynchronise **une seule fois**.

### Commandes utiles

```bash
flutter pub get
flutter analyze
flutter test
flutter run -d emulator-5554
flutter build apk --debug
```

Le backend doit tourner en parallèle (Postgres et Redis compris) : `GET /api/sante` doit répondre
`{"statut":"en_ligne"}` avant de lancer la recette.

---

## 11. Poids et démarrage de l'application

Mesures faites sur cette base de code (émulateur x86_64, build release) :

| | Avant | Après |
|---|---|---|
| APK unique (3 ABI) | 55,5 Mo | — |
| APK par ABI (`--split-per-abi`) | — | **19,4 Mo** en arm64-v8a, 17,2 Mo en armeabi-v7a |
| Démarrage à froid | | 3,0 s (`am start -W`, TotalTime) |

- **Toujours livrer par ABI.** Un APK unique embarque `libflutter.so` et `libapp.so` en trois
  architectures : un téléphone en télécharge trois fois trop. Pour le Play Store,
  `flutter build appbundle` fait la découpe tout seul ; pour une distribution directe,
  `flutter build apk --release --split-per-abi` et l'on donne le fichier `arm64-v8a` (tous
  les téléphones vendus aujourd'hui) ou `armeabi-v7a` (appareils anciens).
- **Aucune dépendance décorative.** `cupertino_icons` était déclaré sans être utilisé nulle
  part : 257 Ko de police d'icônes iOS dans un APK Android. Vérifier avant d'ajouter, et
  retirer ce qui n'est plus appelé.
- Les polices de texte pèsent 1,1 Mo à elles seules (`Unbounded.ttf` : 778 Ko), et Flutter
  ne les élague pas — il n'élague que les polices d'ICÔNES (`--tree-shake-icons`, actif par
  défaut : MaterialIcons tombe de 1,6 Mo à 11 Ko). Les réduire au latin + français
  couperait environ 700 Ko :
  `pip install fonttools && pyftsubset Unbounded.ttf --unicodes="U+0000-00FF,U+0152-0153,U+20A0-20BF,U+2018-201D,U+2026,U+202F" --output-file=Unbounded.ttf`
- Le catalogue, le portefeuille et les notifications sont chargés **en parallèle** au
  montage de la coquille (`Future.wait`) : ne pas les enchaîner, chaque appel séquentiel
  s'ajoute au temps avant premier écran utile.

### Une seule horloge pour tous les comptes à rebours

`CompteARebours` s'abonne à `Horloge.instance` (`noyau/horloge.dart`) au lieu de créer son
propre `Timer.periodic`. Sur une liste de vingt défis, vingt minuteries provoquaient vingt
`setState` par seconde — autant de sous-arbres reconstruits, ce qui se sent au défilement
sur un téléphone modeste. L'horloge unique démarre au premier auditeur et s'arrête au
dernier : un écran sans compte à rebours ne fait tourner aucune minuterie.

### Photo de profil : un fichier, jamais une adresse

Le profil acceptait autrefois une URL. Trois défauts : la photo pouvait disparaître du
jour au lendemain, le navigateur des autres joueurs allait chercher une ressource chez un
tiers (traceur, contenu quelconque), et rien ne garantissait que c'était une image.

Le joueur **téléverse** désormais un fichier :

- `POST /api/utilisateurs/moi/photo` (multipart, champ `fichier`), `DELETE` pour retirer,
  `GET /api/utilisateurs/{id}/photo` pour lire — route **protégée**, jamais un dossier
  statique ouvert ;
- côté application, `image_picker` réduit l'image à 512 px avant l'envoi : une photo d'appareil récent pèse plusieurs mégaoctets pour finir dans un rond de 40 pixels ;
- le backend vérifie le contenu réel (pas seulement l'extension), plafonne à 3 Mo, range
  le fichier sous `STOCKAGE_PHOTOS_DIR/<id joueur>/<uuid>.<ext>` et efface l'ancienne ;
- `PATCH /api/utilisateurs/{id}` **n'accepte plus** `photoProfil` : laisser passer une
  adresse rouvrirait exactement la porte qu'on vient de fermer.

### Tout squelette passe par `SqueletteDiffere`

`composants/communs/squelette.dart` expose `SqueletteDiffere`, qui n'affiche son enfant
qu'au bout de 150 ms. Un squelette peint sans délai apparaît puis disparaît dès que la
donnée arrive vite, et c'est ce clignotement que les joueurs remarquent — pas l'attente.
Le widget n'étant monté que pendant le chargement, retarder son apparition suffit : quand
la réponse arrive avant le seuil, rien ne s'est jamais affiché.

Les treize squelettes des écrans (tableau de bord, défis, matchs, portefeuille, litiges,
notifications, profil, classement, détails) passent par lui, et un test de widget vérifie
qu'il ne peint rien avant le seuil. Côté web, le même rôle est tenu par le crochet
`useAttenteDouce`, qui ajoute en plus un plancher de 350 ms — possible là-bas parce que
l'état survit au retrait du squelette.
