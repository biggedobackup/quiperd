# Intégration Firebase Cloud Messaging — `backend/utils/fcm.go` + `mobile/lib/services/push.service.dart`

Document de référence pour les notifications push de **Défis en Ligne**. Rédigé à partir de la
documentation officielle « FCM HTTP v1 » et de l'intégration réelle de septembre 2026, vérifiée
de bout en bout sur émulateur Android.

> **Règle absolue : le push ne remplace pas le socket, il le prolonge.**
> Le temps réel WebSocket couvre l'application **ouverte** — solde qui bouge, défi qui entre
> dans la liste, match qui change d'état — et il meurt avec le premier plan. FCM va chercher le
> joueur qui a rangé son téléphone, et **seulement là**. Brancher l'un sans l'autre, c'est un
> joueur prévenu la moitié du temps. Les deux se montent au même endroit :
> `SessionEtat._ouvrirLeDirect()`.

> **Règle absolue : seul le backend parle à FCM.**
> La clé privée du compte de service autorise l'envoi à **tous** les appareils du projet. Elle
> ne sort jamais du serveur. L'application ne fait que deux choses : donner son jeton d'appareil
> à l'API, et s'abonner à des topics.

---

## 1. Le projet Firebase et les deux fichiers

| | |
|---|---|
| Projet Firebase | **`defisenligne`** |
| Numéro de projet | `407203162180` |
| Application Android | `com.defisenligne.app` — « Défis en Ligne (Android) » |
| ID de l'application | `1:407203162180:android:954249527d73e9d5bcf411` |
| Compte de service | `firebase-adminsdk-fbsvc@defisenligne.iam.gserviceaccount.com` |
| Formule | Spark (gratuit) — FCM y est complet, aucune limite gênante |

Deux fichiers, **tous les deux ignorés par git**, et ils ne jouent pas le même rôle :

| Fichier | Où | Comment l'obtenir | Ce qu'il contient |
|---|---|---|---|
| `google-services.json` | `mobile/android/app/` | Console Firebase › Paramètres du projet › Vos applications › Android › `google-services.json` | Identifiants **publics** du projet (numéro, app id, clé d'API restreinte par nom de paquet) |
| Compte de service | `backend/secrets/fcm-compte-service.json` | Console Firebase › Paramètres du projet › **Comptes de service** › « Générer une nouvelle clé privée » | Une **clé privée RSA**. C'est le secret. |

Le second est un vrai secret : `backend/secrets/` est dans le `.gitignore`, et sa valeur ne doit
jamais être recopiée dans un message, un ticket ou un journal. Google ne permet pas de le
retélécharger : une clé perdue se régénère, l'ancienne se révoque.

Le premier n'en est pas un au sens strict — Google le documente comme versionnable, la clé
d'API qu'il porte étant restreinte par nom de paquet et empreinte de signature. Il reste
néanmoins exclu par le `.gitignore` du dépôt. **Conséquence à connaître : sur une machine
neuve, il faut aller le rechercher dans la console, sinon `Firebase.initializeApp()` échoue au
démarrage de l'application.**

---

## 2. Configuration

### Variables d'environnement (backend)

```env
FCM_ACTIF=true
FCM_CREDENTIALS_FILE=secrets/fcm-compte-service.json
```

`FCM_ACTIF=false` **ne casse rien** : la notification est créée en base, la tâche est enfilée
dans Asynq, le worker la traite — seul l'envoi réel devient une ligne de journal
(« push FCM (simulé — inactif ou sans jeton) »). C'est ce qui permet à toute la recette de
tourner sur un poste sans compte Firebase.

À l'inverse, `FCM_ACTIF=true` avec un fichier absent ou illisible **arrête le démarrage**
(`utils.Log.Fatal` dans `main.go`). Ce n'est pas de la rigidité : un push muet qu'on croit
parti est bien pire qu'un push éteint qu'on sait éteint.

### Côté Android

- `mobile/android/settings.gradle.kts` : `id("com.google.gms.google-services") version "4.4.2" apply false`
- `mobile/android/app/build.gradle.kts` : `id("com.google.gms.google-services")`, plus
  `isCoreLibraryDesugaringEnabled = true` et
  `coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")`
- `pubspec.yaml` : `firebase_core`, `firebase_messaging`, `flutter_local_notifications`

Le plugin Gradle lit `google-services.json` et en fait des ressources Android. Sans lui, le SDK
démarre sans savoir à quel projet il parle.

---

## 3. La chaîne complète, du déclencheur à la bannière

```
métier (defis/, matchs/, litiges/, paiements/)
   │
   ├─ notifications.Creer(tx, userID, titre, message, type, tampon)
   │      ├─ INSERT notifications            (l'historique dans l'application)
   │      ├─ jobs.EnfilerPush(...)           → file Asynq « push », MaxRetry(3)
   │      └─ tampon.Ajouter(EvtNotificationNouvelle, …)   (le socket, après commit)
   │
   └─ jobs.EnfilerPushDefiCree(...)          → file Asynq « push »   [annonce publique]
          │
   worker/worker.go
   ├─ gererPush           → notifications.JetonFCMUtilisateur(db, id) → utils.EnvoyerPush
   └─ gererPushDiffusion  → utils.EnvoyerPushDefiCree
          │
   utils/notifications_push.go  → utils/fcm.go  → POST https://fcm.googleapis.com/v1/…
          │
   Appareil Android
```

**Tout envoi passe par Asynq, jamais en ligne dans la requête HTTP.** Un FCM lent ou
indisponible ne doit pas retarder la réponse du joueur qui vient de créer son défi. C'est la
même règle que pour les courriels (§ « jamais bloquant » du skill backend).

### Le jeton d'appareil

`POST /api/notifications/jeton-fcm` (authentifié) :

```json
{ "jetonFcm": "e7Kx…", "appareil": "Pixel 8 · Android 14" }
```

Il est écrit dans `sessions_utilisateurs.jeton_fcm`, sur la session **la plus récemment
utilisée** du joueur. Corollaire : un joueur n'a qu'un appareil poussé à la fois. C'est un choix
assumé tant qu'il n'y a pas de table `appareils` dédiée.

---

## 4. Envoi par jeton — API FCM HTTP v1

### Authentification : compte de service → jeton d'accès

L'API v1 n'accepte plus la « clé serveur » de l'ancienne API. Chaque appel porte un jeton
OAuth2 obtenu à partir du compte de service :

1. signer une assertion JWT **RS256** avec la clé privée du compte, revendications
   `iss` (client_email), `scope`, `aud` (token_uri), `iat`, `exp` (+1 h) ;
2. la poster sur `https://oauth2.googleapis.com/token` avec
   `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` ;
3. garder le jeton renvoyé en mémoire jusqu'à son expiration (marge de 60 s).

**L'échange est écrit à la main plutôt qu'avec `golang.org/x/oauth2/google` :** une trentaine de
lignes, une dépendance de moins à auditer sur un chemin qui touche à une clé privée, et le
projet signe déjà des JWT avec `golang-jwt`.

| | |
|---|---|
| Portée | `https://www.googleapis.com/auth/firebase.messaging` |
| Échange | `POST https://oauth2.googleapis.com/token` |
| Envoi | `POST https://fcm.googleapis.com/v1/projects/defisenligne/messages:send` |
| Délai HTTP | 10 s (client) — 15 s (contexte de l'appel) |

### La charge

```json
{
  "message": {
    "token": "<jeton de l'appareil>",
    "notification": { "title": "Défi accepté", "body": "Un joueur a rejoint votre défi…" },
    "data": { "type": "defi_rejoint", "cible": "<uuid>" },
    "android": {
      "priority": "high",
      "notification": { "channel_id": "defis_en_ligne_defaut", "sound": "default" }
    },
    "apns": { "payload": { "aps": { "sound": "default" } } }
  }
}
```

**`notification` ET `data` sont tous les deux nécessaires**, et pour des raisons différentes :

- sans `notification`, Android n'affiche **rien** quand l'application dort ;
- sans `data`, un appui sur la bannière ouvre l'accueil au lieu de l'écran concerné.

### Réponses et traitement

| Statut | Signification | Ce qu'on en fait |
|---|---|---|
| `200` | Accepté par FCM | Terminé. **Accepté ≠ affiché** : FCM ne garantit pas la remise. |
| `404` | `UNREGISTERED` — application désinstallée, données effacées | `ErrJetonFCMInvalide` → le jeton est **oublié** (`notifications.OublierJetonFCM`), tâche rendue pour faite |
| `400` avec `registration-token-not-registered` ou `"message.token"` | Jeton malformé | Idem : oublié |
| `400` autre | **Notre charge est mal formée** | Erreur normale, la tâche est réessayée |
| `401` / `403` | Clé révoquée, compte désactivé, horloge décalée | Erreur, à corriger côté serveur |

> **Le 400 ne se traduit en « jeton mort » que si Google désigne le champ du jeton.** Un 400
> peut aussi venir d'une charge mal formée de notre côté ; oublier le jeton dans ce cas ferait
> taire les notifications de **tout le monde** sans que rien ne le signale. C'est le genre de
> panne qu'on ne découvre que des semaines plus tard, par une plainte de joueur.

Réessayer trois fois un jeton mort ne remplirait que les journaux : d'où l'oubli plutôt que
l'échec.

---

## 5. Diffusion par topic — l'annonce d'un défi ouvert

Un défi qui vient de s'ouvrir n'est adressé à **personne en particulier**. L'annoncer joueur par
joueur voudrait dire parcourir la table des jetons et écrire un message par inscrit, plus une
ligne de notification par joueur et par défi. FCM sait diffuser à un abonnement.

| | |
|---|---|
| Topic public | `defis-ouverts` — tout appareil connecté s'y abonne |
| Topic personnel | `utilisateur-<id>` — **ne sert pas à parler au joueur** (son jeton suffit), mais à l'**exclure** d'une diffusion |
| Condition envoyée | `'defis-ouverts' in topics && !('utilisateur-<auteur>' in topics)` |

Annoncer à quelqu'un le défi qu'il vient lui-même de créer donnerait l'impression que
l'application est cassée — d'où l'exclusion.

**`defi_cree` n'est donc PAS une notification en base.** C'est une tâche Asynq
`notification:diffusion`, distincte de `notification:push`, et elle ne laisse aucune ligne dans
la table `notifications`.

### Le prix à payer : la latence

Mesuré en séance sur l'émulateur, backend et appareil au même endroit :

| Mode d'envoi | Délai observé entre le POST et la réception |
|---|---|
| Par **jeton** (`token`) | **moins d'une seconde** |
| Par **condition de topics** | **10 s à une minute** |

La distribution d'un topic est asynchrone chez Google, et un abonnement fraîchement créé met un
moment à devenir effectif. C'est acceptable pour « un défi vient de s'ouvrir ».

> **Ne jamais diffuser par topic un événement de match.** Un résultat déclaré, un litige, un
> gain crédité — ce sont des faits qui engagent de l'argent, et le joueur doit les apprendre
> dans la seconde. Ils passent par le jeton, toujours.

---

## 6. Côté application mobile — les quatre chemins de réception

Tout vit dans `mobile/lib/services/push.service.dart`. `Push.initialiser()` est appelée dans
`main()` **avant `runApp`** : c'est là qu'on récupère le message qui a lancé l'application, et
la session s'ouvre dès la première frame — trop tard pour poser les écoutes.

| Situation | Qui dessine la bannière | Où c'est câblé |
|---|---|---|
| Application **fermée** ou en arrière-plan | Android, à partir du bloc `notification` | `AndroidManifest.xml` (canal, icône, teinte). Aucun code Dart ne tourne. |
| Application **au premier plan** | `flutter_local_notifications` | `Push._surMessageAuPremierPlan` |
| Appui sur la bannière, application **morte** | — | `getInitialMessage()` |
| Appui sur la bannière, application **en veille** | — | `onMessageOpenedApp` |

Il faut traiter les quatre. En oublier un donne une panne qui ne se reproduit qu'une fois sur
trois, selon l'état de l'application au moment du message.

### Le canal Android

```
identifiant : defis_en_ligne_defaut
nom         : Défis et matchs
description : Défi rejoint, résultat déclaré, litige, paiement.
importance  : high
```

Il est déclaré à **trois endroits qui doivent s'accorder** :

1. `AndroidManifest.xml` → `com.google.firebase.messaging.default_notification_channel_id`
2. `Push._canal` (création réelle du canal, exigée depuis Android 8)
3. `backend/utils/fcm.go` → `"channel_id"` de la charge

S'ils divergent, Android fabrique **un second canal**, sans son ni vibration, et les
notifications tombent sans se faire remarquer.

### Cycle de vie du jeton

| Moment | Ce qui se passe |
|---|---|
| Ouverture de session (`_ouvrirLeDirect`) | `requestPermission()`, `getToken()`, `POST /notifications/jeton-fcm`, abonnement aux deux topics |
| En cours de route | `onTokenRefresh` → réenregistrement. Android renouvelle le jeton après une restauration, une mise à jour des services Google ou un effacement de données. Sans cette écoute, le serveur écrirait à une adresse morte. |
| Déconnexion (`_terminer`) | désabonnement des topics **puis** `deleteToken()`. Un téléphone prêté ne doit pas continuer de recevoir « votre défi a été rejoint » pour le compte précédent. |

> **L'ordre compte : désabonner AVANT `deleteToken()`.** Effacer le jeton coupe aussi les
> abonnements côté serveur ; les `unsubscribeFromTopic` qui suivraient échoueraient en silence.

---

## 7. Aiguillage au clic

Le message porte `data.type` et, quand c'est exploitable, `data.cible`.
`flutter_local_notifications` ne rend qu'une chaîne : les deux y sont recollés séparés par une
barre (`type|cible`).

| `type` | Où l'on emmène le joueur |
|---|---|
| `defi_cree` **avec** `cible` | La **fiche du défi** (`DetailDefiEcran`), onglet Défis dessous pour que le retour retombe sur la liste |
| `defi_cree` sans cible, `defi_expire` | Onglet **Défis** |
| `defi_rejoint`, `match_*`, `litige_*` | Onglet **Mes matchs** |
| `paiement_confirme`, `paiement_echoue` | Onglet **Portefeuille** |
| tout le reste | Écran des **notifications** |

On dépile d'abord jusqu'à la coquille (`popUntil(isFirst)`) : un écran empilé masquerait
l'onglet qu'on vient de choisir.

**Les notifications personnelles n'ont pas encore d'identifiant de cible** : le modèle
`Notification` ne porte que `{UtilisateurID, Titre, Message, Type, Lu}`. D'où le repli sur la
section. Ouvrir le match précis demanderait une colonne de plus, propagée jusqu'à
`ChargeNotificationPush`.

---

## 8. Retour d'expérience — intégration (septembre 2026)

- **L'icône de la barre d'état n'est pas le logo.** Depuis Android 5, seul l'alpha est conservé :
  une icône en couleur devient un carré blanc. `res/drawable-*/ic_notification.png` est une
  silhouette blanche, générée depuis `ic_launcher_foreground.png` en ne gardant que le canal
  alpha, recadrée sur le dessin réel (le premier plan adaptatif réserve de larges marges), en
  24/36/48/72/96 px. La teinte vient de `@color/couleur_notification` (`#FF15803D`, le vert
  d'identité).
- **`POST_NOTIFICATIONS` se DEMANDE.** Depuis Android 13, la déclarer au manifeste ne suffit
  pas : `requestPermission()` doit être appelé, et le système affiche sa propre boîte de
  dialogue. Un refus n'est pas une erreur — l'application marche sans.
- **`flutter_local_notifications` exige le désucrage.** Sans
  `isCoreLibraryDesugaringEnabled` et `desugar_jdk_libs`, la compilation Android s'arrête net
  sur les API de date de Java 8.
- **Le gestionnaire d'arrière-plan tourne dans un isolat séparé.** Il ne partage ni les
  providers, ni la session, ni le socket : on n'y touche à rien de l'application. Il doit
  malgré tout exister et porter `@pragma('vm:entry-point')`, sinon le compilateur AOT l'élague
  et FCM échoue au réveil.
- **Ne pas attendre `Push.activer()` à l'ouverture de session** (`unawaited`) : demander la
  permission ouvre une boîte de dialogue système, et la connexion ne doit pas rester suspendue
  à la réponse du joueur.
- **L'émulateur doit avoir les services Google Play.** Une image « AOSP » ne recevra jamais
  rien. Vérifier : `adb shell pm list packages | grep com.google.android.gms`.
- **`Firebase.initializeApp()` sans `firebase_options.dart`.** Sur Android, le plugin Gradle
  suffit : la configuration vient de `google-services.json`. Inutile de faire tourner
  `flutterfire configure`, qui demanderait le réseau et une CLI de plus.
- **`W FirebaseMessaging: Unable to log event: analytics library is missing`** dans logcat est
  bénin : c'est Firebase Analytics qui n'est pas installé, et on n'en veut pas.

---

## 9. Recette

`backend/tests/parcours-push.ps1`, en deux étapes parce qu'il faut une vraie application entre
les deux :

```powershell
pwsh -File tests/parcours-push.ps1 -Etape preparer
# crée deux joueurs (A = celui du téléphone, B = l'adversaire), confirme les adresses,
# approvisionne les portefeuilles, affiche les identifiants de A

# … se connecter sur l'émulateur avec A : c'est cette connexion qui enregistre le jeton …

pwsh -File tests/parcours-push.ps1 -Etape verifier
# vérifie le jeton en base, puis déclenche défi créé / défi rejoint / résultat déclaré
```

Ce que la recette ne peut pas voir, et qu'il faut donc regarder à la main :

```bash
# Les bannières réellement posées par le système
adb shell dumpsys notification --noredact | grep -A 40 "pkg=com.defisenligne.app" \
  | grep -E "android.title=String|android.text=String"

# La réception côté appareil (une ligne par message)
adb logcat -d | grep FLTFireMsgReceiver

# Le canal et la teinte effectivement utilisés
adb shell dumpsys notification --noredact | grep "channel=defis_en_ligne_defaut"
```

Le portefeuille est créé **à la demande**, pas à l'inscription : l'étape `preparer` lit
`GET /portefeuille` avant d'approvisionner, sans quoi l'`UPDATE` ne trouve aucune ligne et le
joueur reste à zéro — on ne s'en aperçoit qu'au premier « solde insuffisant », trois étapes plus
loin.

`backend/utils/fcm_test.go` vérifie que le compte de service est réellement accepté par Google
(PEM lisible, clé RSA valide, assertion signée, jeton obtenu). Il touche le réseau, donc il
s'ignore si le fichier est absent. Il attrape ce qu'aucune relecture ne voit : une clé révoquée,
un compte désactivé, une horloge locale décalée.

### État vérifié en septembre 2026

Sur émulateur Android 16 (services Google Play 26.32.34), les trois notifications demandées
arrivent réellement, application fermée puis ouverte :

| Titre | Corps |
|---|---|
| Nouveau défi ouvert | push_adv_165719 propose un défi sur Fall Guys pour 1500 F. |
| Défi accepté | Un joueur a rejoint votre défi. Le match peut commencer. |
| Résultat à confirmer | Votre adversaire se déclare vainqueur. Confirmez ou annoncez l'inverse avant 17:30… |

L'appui sur la première ouvre la fiche du défi visé, et le défi qu'on crée soi-même ne renvoie
pas sa propre annonce.

**La production ne l'a pas encore** : le VPS garde `FCM_ACTIF=false` et n'a pas le compte de
service. L'activer demande d'y copier `backend/secrets/fcm-compte-service.json` et de basculer
les deux lignes du `.env`.

---

## 10. Ce qu'on ne fait jamais

- **Envoyer un push depuis le contrôleur HTTP.** Tout passe par Asynq. Un FCM lent ne doit
  jamais retarder la réponse du joueur.
- **Se servir du push pour rafraîchir l'application ouverte.** C'est le rôle du socket, et
  l'utilisateur a explicitement refusé toute forme d'actualisation périodique. Le push
  s'adresse à un téléphone rangé.
- **Diffuser par topic un événement de match.** Voir §5 : la latence rend le procédé impropre
  à tout ce qui engage de l'argent.
- **Traduire un 400 générique en « jeton mort ».** Voir §4.
- **Mettre la clé du compte de service dans git, dans un journal, ou dans une réponse d'API.**
  Elle autorise l'envoi à tous les appareils du projet.
- **Faire diverger l'identifiant du canal** entre le manifeste, l'application et le serveur.
- **Conclure qu'un push est arrivé parce que FCM a répondu 200.** FCM accuse réception, il ne
  garantit pas la remise : batterie, mode économie d'énergie, appareil éteint. La notification
  en base et le socket restent la source de vérité de ce que le joueur a manqué.
