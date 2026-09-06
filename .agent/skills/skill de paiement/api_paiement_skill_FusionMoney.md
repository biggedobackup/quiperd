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
