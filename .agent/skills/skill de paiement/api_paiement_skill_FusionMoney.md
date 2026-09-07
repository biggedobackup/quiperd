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
