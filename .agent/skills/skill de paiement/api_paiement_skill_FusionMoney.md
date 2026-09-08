# Intégration MoneyFusion — Module `paiements/` (Backend)

Document de référence pour l'intégration de la passerelle **MoneyFusion**
(pay.moneyfusion.net — Mobile Money) comme moyen de paiement. Rédigé à partir de la
documentation officielle « API Web » et de l'intégration réelle AideDons (août 2026).

> **Règle absolue : seul le backend parle à MoneyFusion.**
> L'URL d'API du marchand (obtenue depuis le tableau de bord) tient lieu
> d'identifiant : elle ne doit jamais être exposée côté client. Le frontend
> appelle uniquement le backend, qui crée le paiement et renvoie l'URL de la
> page de paiement hébergée.

---

## 1. Configuration

Aucun en-tête d'authentification : **l'URL d'API du marchand est le secret**.
Elle se récupère dans le tableau de bord MoneyFusion (colonne « Lien » de
l'application approuvée), de la forme :

```
https://www.pay.moneyfusion.net/<NomApplication>/<identifiant>/pay/
```

### Variables d'environnement

```env
FUSIONMONEY_API_URL=https://www.pay.moneyfusion.net/MonApp/xxxxxxxxxxxx/pay/
```

### Compte marchand de QUI PERD

| | |
|---|---|
| Application | **AvisResto** |
| Statut d'approbation | **Approuvé** |
| Hôte | `www.pay.moneyfusion.net` → normalisé en `pay.moneyfusion.net` (§5, piège TLS) |
| Lien d'API | `https://www.pay.moneyfusion.net/AvisResto/<identifiant>/pay/` |
| Page hébergée servie | `https://payin.moneyfusion.net/payment/<token>/<montant>/AvisResto` |

**L'identifiant complet du lien ne figure pas ici : c'est le secret du compte, et ce
fichier est versionné.** Sa valeur vit dans `backend/.env` (`FUSIONMONEY_API_URL`, non
versionné) et dans la configuration de production. À noter pour l'exploitation : le nom
affiché au joueur sur la page de paiement est celui de l'application marchande —
« AvisResto » aujourd'hui, donc à renommer côté tableau de bord MoneyFusion si l'on veut
que les joueurs de QUI PERD lisent « QUI PERD » au moment de payer.

---

## 2. Payin — créer un paiement

```
POST {FUSIONMONEY_API_URL}
Content-Type: application/json
```

```json
{
  "totalPrice": 200,
  "article": [{ "don": 200 }],
  "personal_Info": [{ "reference": "AD-XXXX" }],
  "numeroSend": "0101010101",
  "nomclient": "John Doe",
  "return_url": "https://votre-domaine.ci/paiement/retour?ref=AD-XXXX",
  "webhook_url": "https://votre-domaine.ci/api/paiements/callback-fusion"
}
```

| Champ | Type | Obligatoire | Rôle |
| :--- | :--- | :--- | :--- |
| `totalPrice` | Number | Oui | Montant total à payer |
| `article` | Array\<Object\> | Oui | Détail libre `{libellé: prix}` — la somme doit valoir `totalPrice` |
| `numeroSend` | String | Oui | **Téléphone du client** — à collecter dans le formulaire de paiement |
| `nomclient` | String | Oui | Nom du client |
| `personal_Info` | Array\<Object\> | Non | Données libres renvoyées telles quelles — y placer **notre référence de transaction** (clé de rapprochement) |
| `return_url` | String | Non | Redirection après paiement |
| `webhook_url` | String | Non | URL POST des notifications |

Réponse :

```json
{
  "statut": true,
  "token": "5d58823b084564",
  "message": "paiement en cours",
  "url": "https://www.pay.moneyfusion.net/pay/6596aded36bd58823b084564"
}
```

- `statut: false` → refus (journaliser la réponse complète, message générique au client).
- **Stocker `token`** sur la transaction : c'est la clé de la vérification (§3).
- Rediriger le client vers `url` (page de paiement hébergée).

---

## 3. Vérification d'état — `paiementNotif`

**Jamais de mise à jour de statut sur la seule foi d'un webhook.** Toujours
revérifier auprès de l'API avec le token stocké à la création :

```
GET https://www.pay.moneyfusion.net/paiementNotif/{token}
```

```json
{
  "statut": true,
  "data": {
    "tokenPay": "0d1d8bc9b6d2819c",
    "numeroSend": "01010101",
    "nomclient": "John Doe",
    "personal_Info": [{ "reference": "AD-XXXX" }],
    "numeroTransaction": "0708889205",
    "Montant": 194,
    "frais": 5,
    "statut": "paid",
    "moyen": "orange",
    "createdAt": "2024-02-28T11:17:15.285Z"
  },
  "message": "details paiement"
}
```

### Statuts

| Statut | Signification | Transition côté application |
| :--- | :--- | :--- |
| `pending` | Paiement en cours de traitement | ne rien faire |
| `no paid` | Paiement non effectué (page ouverte, pas payé) | ne rien faire — peut encore être payé |
| `paid` | Paiement réussi — état final | confirmer (une seule fois) |
| `failure` | Échec du paiement — état final | marquer échoué |

### ⚠️ `Montant` est NET des frais

`Montant` (194) + `frais` (6) = `totalPrice` demandé (200). Pour le contrôle de
cohérence avant de créditer : vérifier `Montant + frais == montant attendu`
(tolérer aussi `Montant == montant attendu` par prudence si la politique de
frais change). En cas d'écart : ne PAS créditer, journaliser une alerte.

`moyen` (orange, mtn, moov, wave…) = opérateur Mobile Money — à stocker.

---

## 4. Webhook — notifications temps réel

`webhook_url` reçoit des POST JSON :

```json
{
  "event": "payin.session.completed",
  "personal_Info": [{ "reference": "AD-XXXX" }],
  "tokenPay": "Le4Cnmm1Ac9yTgZMKQbz",
  "numeroSend": "01010101",
  "nomclient": "Kwameson",
  "Montant": 194,
  "frais": 6,
  "createdAt": "2025-05-09T12:50:45.412Z"
}
```

| Événement | Signification |
| :--- | :--- |
| `payin.session.pending` | Paiement initié, en attente — **peut être répété plusieurs fois** |
| `payin.session.completed` | Paiement réussi |
| `payin.session.cancelled` | Paiement annulé ou échoué |

### Traitement recommandé (doc officielle + expérience)

- **MoneyFusion envoie des notifications multiples** pour une même transaction
  (pending répété, puis completed/cancelled). Idempotence obligatoire :
  identifier la transaction (notre référence dans `personal_Info`, sinon
  `tokenPay`), comparer au statut courant en base, ignorer ce qui n'est pas
  une évolution.
- Répondre 200 immédiatement, traiter en arrière-plan (goroutine/queue).
- **Ne jamais appliquer l'événement tel quel** : re-vérifier via
  `paiementNotif/{token}` (§3) puis appliquer le statut constaté.
- Journaliser chaque webhook brut en base (litiges).
- Webhook non garanti (localhost injoignable en dev, réseau) : doubler d'un
  polling de secours (tâche différée qui appelle `paiementNotif` — 1er contrôle
  à 2 min, puis toutes les 30 s, 10 tentatives max ; ne jamais clôturer une
  transaction `pending`/`no paid`, un paiement tardif reste valide).

---

## 5. Retour d'expérience — intégration AideDons (août 2026, Go/Fiber)

- **PIÈGE TLS — jamais de `www.`** : le tableau de bord MoneyFusion affiche
  l'URL d'API avec l'hôte `www.pay.moneyfusion.net`, mais ce sous-domaine sert
  un certificat auto-signé (« TRAEFIK DEFAULT CERT ») → tout client HTTP
  strict (Go, curl…) échoue avec `x509: certificate signed by unknown
  authority`. Seul `pay.moneyfusion.net` (sans `www.`) présente le vrai
  certificat Let's Encrypt. Utiliser l'URL sans `www.` et, par sécurité,
  normaliser au démarrage (`strings.Replace("://www.pay.moneyfusion.net",
  "://pay.moneyfusion.net")`) pour que l'URL copiée telle quelle du dashboard
  fonctionne quand même.
- Architecture **multi-prestataires** : un registre
  `dons.Checkouts[moyen] = func(don, titre) (url, error)` rempli au démarrage
  (`ActiverLigdicash()`, `ActiverFusionMoney()`) ; le formulaire de don propose
  le choix du moyen quand plusieurs sont actifs ; la colonne
  `dons.MoyenPaiement` mémorise le prestataire pour router la vérification
  (page de retour + polling) vers la bonne API.
- `numeroSend` est **obligatoire** : le formulaire de don doit collecter le
  téléphone quand MoneyFusion est choisi (validation front + back).
- `personal_Info` est le seul moyen fiable de retrouver NOTRE référence dans le
  webhook — toujours y mettre `{"reference": <ref>}` à la création. Prévoir le
  repli « retrouver le don par tokenPay » si `personal_Info` manque.
- Les clés de la réponse mélangent les casses (`Montant` avec majuscule,
  `statut`/`moyen` en minuscules) — mapper précisément.
- La réponse de création peut renvoyer `statut:false` avec un `message` en
  français : le journaliser tel quel côté serveur.
- Le token (`token` à la création, `tokenPay` ensuite) est court (hex) mais
  stocker large (512+) pour partager la colonne avec d'autres prestataires
  (LigdiCash utilise un JWT long).
- Testable de bout en bout sans clés avec un stub local reproduisant le
  contrat : POST pay → page hébergée → webhooks multiples (pending répété +
  completed) → `paiementNotif` à états + mode « payé sans webhook » pour
  éprouver le polling. Créer un paiement réel ne déplace aucun fonds tant que
  personne ne paie — ne jamais automatiser le paiement lui-même.

---

## 6. Retour d'expérience — intégration QUI PERD (septembre 2026, Go/Fiber + TanStack Start + Flutter)

### Le piège de la mise en production : la liste vide et le rappel injoignable

Vécu en production, et c'est le premier symptôme que le joueur remonte :
**« aucun moyen de paiement n'est disponible pour le moment »**. Ce message ne veut pas dire que
l'intégration est cassée — il veut dire que `GET /api/paiements/prestataires` a renvoyé `[]`,
c'est-à-dire qu'aucune passerelle n'était à la fois **annoncée** et **configurée**.

Le diagnostic tient en une commande, à faire avant toute autre chose :

```bash
curl -s https://<domaine>/api/paiements/prestataires   # [] = configuration, pas code
```

Trois réglages du `.env` de production étaient en cause, et ils cassent le parcours à trois
endroits différents :

| Réglage | Valeur trouvée | Ce que le joueur voit |
|---|---|---|
| `FUSIONMONEY_API_URL` | **vide** | « aucun moyen de paiement disponible » — la modale ne propose rien |
| `FUSIONMONEY_CALLBACK_URL` | `http://127.0.0.1:8082/...` | il paie **vraiment**, et le dépôt reste « en attente » pour toujours |
| `CORS_ORIGIN` (donc `SITE_URL`) | `http://127.0.0.1:8082` | après avoir payé, il est renvoyé vers une adresse morte |

Le deuxième est de loin le plus coûteux : l'argent part, la confirmation n'arrive jamais.
MoneyFusion appelle le webhook **depuis ses serveurs** — une adresse de bouclage ne peut
évidemment pas être jointe. Vérifier que le rappel répond depuis l'extérieur fait partie de la
mise en production, au même titre que le reste :

```bash
curl -o /dev/null -w "%{http_code}
" -X POST -H 'Content-Type: application/json'   -d '{}' https://<domaine>/api/paiements/callback-fusion    # doit répondre 200
```

**Ce qui a permis à cette configuration de passer**, et qui est corrigé : le contrôle de
démarrage `config.VerifierProduction()` cherchait le seul mot « localhost ». `127.0.0.1`
passait sans encombre. Il reconnaît maintenant toute adresse de bouclage, et surtout il **refuse
de démarrer** quand `PAIEMENT_PRESTATAIRES` annonce une passerelle sans identifiants, ou avec
une URL de rappel locale. Le raisonnement est le même que pour FCM : une panne bruyante au
démarrage vaut mieux qu'un joueur bloqué devant une modale vide, ou qu'un dépôt payé que rien ne
vient confirmer. `backend/config/config_test.go` fige les quatre cas.

Corollaire : **ne lister dans `PAIEMENT_PRESTATAIRES` que ce qu'on peut réellement servir.**
La production annonçait `ligdicash,fusionmoney` alors que les clés LigdiCash étaient vides —
sans effet visible tant que la route filtrait, mais c'est un mensonge dans la configuration, et
le nouveau contrôle le refuse.


Quatre écarts trouvés en branchant ce skill sur une plateforme d'argent réel, avec
le correctif retenu. Ils valent pour toute intégration à trois clients (API, web,
mobile).

- **Le client ne doit jamais deviner les passerelles disponibles.** Les deux
  frontends proposaient `ligdicash` et `fusionmoney` en dur : sans clés
  configurées, le joueur recevait un 400 « prestataire indisponible » après avoir
  rempli le formulaire. Correctif : une route publique
  `GET /api/paiements/prestataires` qui ne renvoie que les passerelles **activées
  (`PAIEMENT_PRESTATAIRES`) ET configurées** (clés LigdiCash présentes, URL
  marchand MoneyFusion présente), avec pour chacune `{code, libelle,
  numeroRequis}`. Le web et le mobile s'en servent pour bâtir la liste, masquer
  le sélecteur quand il n'y a qu'un choix, et afficher un message clair quand il
  n'y en a aucun. `numeroRequis` vient du serveur : ne pas rejouer côté client la
  règle « MoneyFusion exige le numéro ». La réponse ne contient évidemment aucun
  secret — surtout pas l'URL d'API du marchand.
- **`return_url` doit pointer le SITE, jamais l'API.** Les URL de retour et
  d'annulation étaient construites sur `APP_BASE_URL`, qui désigne le backend :
  le payeur atterrissait sur un 404 de l'API juste après avoir payé, au pire
  moment possible. Correctif : les fabriquer depuis l'adresse publique du
  frontend (`SITE_URL`, à défaut `CORS_ORIGIN`) et vers la **vraie route** du
  portefeuille (`/joueur/portefeuille`, pas `/portefeuille`), avec la référence
  encodée. Une seule fonction (`Config.URLRetourPortefeuille`) pour tous les
  prestataires, sinon l'erreur se répète au suivant.
- **Arrondir le montant ne suffit pas : refuser le fractionnaire.** MoneyFusion
  n'accepte qu'un `totalPrice` entier. Arrondir en silence à l'envoi tout en
  créditant le montant demandé fait payer 101 au joueur pour lui créditer 100,6.
  Le franc CFA n'ayant pas de subdivision en usage, la bonne réponse est de
  refuser le montant fractionnaire à l'entrée de l'API (400 avec
  `details.montant`), et de le valider aussi dans les formulaires.
- **L'échec doit clore le dépôt, pas le laisser en attente.** Seul le succès
  était traité : un `failure` (ou un `notcompleted` LigdiCash) laissait la ligne
  « en attente » pour toujours et le joueur guettait un solde qui n'arriverait
  jamais. Correctif : une transition idempotente `en_attente → echoue`
  (aucun mouvement d'argent, mais notification, audit et diffusion temps réel),
  partagée par les deux prestataires via une seule fonction qui traduit l'état
  constaté (`paid`/`completed` → réussite, `failure`/`notcompleted` → échec,
  `pending`/`no paid` → on ne conclut rien).

**Recette.** La doublure du §5 est écrite ici en Go
(`backend/tests/outils/stub-fusion`), pilotable par
`POST /_recette/<token>/<etat>` avec deux paramètres qui isolent les règles :
`?annonce=paid` envoie un webhook menteur sur une transaction restée `pending`
(rien ne doit être crédité), `?webhook=non` ne notifie pas du tout (seul le
polling de secours peut conclure). Le parcours
`backend/tests/parcours-paiement.ps1` déroule les deux, plus le crédit brut
(`Montant` NET + `frais`), l'idempotence du rejeu, l'échec, et vérifie que le
`return_url` reçu par le prestataire pointe bien le site.

**Deux constats faits contre la vraie passerelle** (compte marchand réel, paiements créés
puis laissés impayés — aucun fonds ne bouge tant que personne ne paie) :

- **Plancher de 200 F.** Sous 200, la création est refusée avec
  `{"statut": false, "message": "Montant doit etre supérieur a 200 F"}` ; 200 passe.
  Le plancher applicatif était à 100 : un dépôt de 100 F partait donc dans le vide, et le
  joueur restait avec une ligne « en attente » que rien ne confirmerait. Le plancher est
  désormais publié par prestataire dans `GET /api/paiements/prestataires`
  (`montantMinimum`) et vérifié côté API **avant** l'appel. Corollaire : quand la passerelle
  refuse malgré tout à la création, le dépôt est clos en échec et l'API répond 502 — jamais
  un 201 « en attente de confirmation » qui ferait patienter le joueur pour rien.
- **La page hébergée est encadrable.** Elle est servie par `payin.moneyfusion.net` (et non
  par l'hôte d'API) et n'envoie **ni `X-Frame-Options` ni `Content-Security-Policy`** : elle
  s'affiche donc dans une `<iframe>` sur le web et dans une `WebView` sur mobile. C'est ce
  qui permet de garder le joueur sur la plateforme au lieu de le rediriger, et surtout de
  refermer la fenêtre de paiement toute seule quand `paiement.statut` arrive par le socket —
  l'application reste vivante derrière. Prévoir malgré tout l'échappatoire « ouvrir dans le
  navigateur » : si le prestataire ajoutait un jour un en-tête d'encadrement, le cadre
  deviendrait blanc sans le moindre message d'erreur.

---

## 7. Garder le joueur sur la plateforme — WebView (mobile) et cadre (web)

Rediriger le joueur vers la page hébergée le fait **sortir** du produit : sur mobile il
atterrit dans le navigateur du système, sur le web il perd l'onglet de la plateforme. Dans
les deux cas il revient — ou pas — sans savoir où en est son dépôt, et l'application n'est
plus là pour lui annoncer l'issue. La page de MoneyFusion s'affiche donc **dans** le
produit, et c'est ce qui rend possible le comportement le plus utile de tout le parcours :
la fenêtre de paiement se referme d'elle-même quand `paiement.statut` arrive par le socket.

### Ce qui rend l'encadrement possible

La page hébergée est servie par **`payin.moneyfusion.net`** (et non par l'hôte d'API) et
n'envoie **ni `X-Frame-Options` ni `Content-Security-Policy`** — vérifié en interrogeant
directement une page de paiement réelle. Elle est donc encadrable. Ce fait dépend du
prestataire : le revérifier avant de reprendre ce montage ailleurs, et **toujours prévoir
l'échappatoire** (« ouvrir dans le navigateur » / « ouvrir dans un nouvel onglet »), car un
cadre interdit devient blanc, sans le moindre message d'erreur.

### Mobile — `webview_flutter`

Un écran plein, poussé sur une **route nommée** (`paiement-web`) pour pouvoir être refermé
depuis l'événement temps réel sans toucher aux écrans en dessous :

```dart
_controleur = WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)   // la page est une application Angular
  ..setBackgroundColor(Couleurs.papier)
  ..setNavigationDelegate(NavigationDelegate(
    onProgress: (p) => setState(() => _progression = p),
    onWebResourceError: (e) {
      // Une ressource secondaire qui échoue (police, pixel de suivi) ne doit pas faire
      // croire au joueur que le paiement est cassé.
      if (!e.isForMainFrame!) return;
      setState(() => _erreur = e.description);
    },
  ))
  ..loadRequest(Uri.parse(url));
```

Puis, dans le gestionnaire d'événement du portefeuille :

```dart
if (_paiementWebId != null && '${charge['paiementId']}' == _paiementWebId
    && statut != 'en_attente') {
  _paiementWebId = null;
  Navigator.of(context).popUntil((r) => r.settings.name != routePaiementWeb);
}
```

- `JavaScriptMode.unrestricted` est indispensable : la page est une application web.
- Barre de progression pendant le chargement, écran d'erreur avec « Réessayer » et
  « Ouvrir dans le navigateur » (`url_launcher` reste dans les dépendances pour cela).
- Une note fixe sous la vue : « Ne quittez pas cet écran avant d'avoir validé la demande
  sur votre téléphone. Votre solde se met à jour tout seul. »

### Web — cadre dans une modale

```tsx
<iframe
  src={url}
  title="Page de paiement sécurisée du prestataire"
  allow="payment *; clipboard-write"
  className="-mx-5 h-[68dvh] w-[calc(100%+2.5rem)] … sm:mx-0 sm:w-full"
/>
```

- Le portefeuille reste monté derrière : le socket ferme la modale dès que l'issue arrive
  (`setPaiementOuvert((o) => (o?.id === paiementId ? null : o))`).
- Sur téléphone, le cadre déborde volontairement le rembourrage de la modale (`-mx-5`)
  pour offrir toute la largeur utile — 348 px sur un écran de 375.
- Lien « ouvrir dans un nouvel onglet » toujours affiché sous le cadre.

### Ne pas condamner un paiement fermé par mégarde

L'URL hébergée est **mémorisée dans le paiement suivi**, et la carte « paiements en cours »
propose « **Reprendre le paiement** » tant que le dépôt est en attente. Sans cela, un clic
malheureux sur le fond de la modale oblige le joueur à refaire un dépôt, et laisse derrière
lui une transaction fantôme. Corollaire d'implémentation : la fusion du suivi doit préserver
l'URL, car les événements de statut ne la portent pas
(`{...ancien, ...nouveau, url: nouveau.url ?? ancien.url}`).

### Ce qu'on ne fait jamais

- Reconstruire le formulaire de paiement soi-même (numéro, choix de l'opérateur) : c'est la
  page du prestataire qui collecte ces données, et c'est ce qui garde QUI PERD hors du
  périmètre de conformité.
- Intercepter ou réécrire la navigation à l'intérieur de la vue : l'opérateur y redirige
  vers ses propres pages de confirmation.
- Conclure quoi que ce soit depuis la vue (URL de retour, titre de page…) : **seul
  `paiementNotif` fait foi**, comme partout ailleurs dans ce document.
