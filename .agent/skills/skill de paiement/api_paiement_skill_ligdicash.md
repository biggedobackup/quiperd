# Intégration LigdiCash — Module `paiements/` (Backend)

Document de référence pour l'intégration de la passerelle **LigdiCash** (Mobile Money
Orange/MTN/Moov/Wave, carte bancaire) dans le module `backend/paiements/` de la
plateforme **IKA DRIVE**.

> **Règle absolue : seul le backend Go parle à LigdiCash.**
> Le frontend Angular et l'application mobile Flutter n'appellent jamais l'API LigdiCash
> directement — ils appellent uniquement `/api/paiements` sur le backend, qui orchestre
> lui-même la création de transaction, le callback et la vérification. Les clés `Apikey`
> et `API_TOKEN` ne doivent jamais transiter par un client (navigateur ou app mobile) ;
> elles restent en variables d'environnement côté serveur (`.env`).

---

## 1. Authentification

Chaque requête vers l'API LigdiCash porte deux en-têtes obligatoires :

| En-tête | Valeur | Rôle |
| :--- | :--- | :--- |
| `Apikey` | Clé API du projet | Identifie le projet LigdiCash |
| `Authorization` | `Bearer {API_TOKEN}` | Authentifie la requête |

Une requête à laquelle il manque l'un des deux en-têtes est rejetée
(`response_code: "01"`, `response_text: "Echec (Code00)"`).

### Variables d'environnement (`.env` / `.env.example`)

```env
LIGDICASH_API_KEY=
LIGDICASH_API_TOKEN=
LIGDICASH_BASE_URL=https://app.ligdicash.com/pay/v01
LIGDICASH_CALLBACK_URL=http://localhost:8080/api/paiements/callback
```

Lues dans `config/config.go` au même endroit que les autres secrets (JWT, SMTP, MinIO).

---

## 2. Payin — encaisser un paiement client

Deux flux, selon l'UX voulue côté frontend/mobile. Dans les deux cas, l'appel HTTP part
de `paiements/services.go` (pas d'un SDK officiel Go — LigdiCash ne publie que des SDK
Dart/Node/PHP/Python ; le backend Go construit la requête `POST` directement avec
`net/http` et `encoding/json`).

### 2.1 Avec redirection (recommandé — WebView / nouvel onglet)

Le client crée la facture, LigdiCash renvoie une URL de paiement hébergée, le frontend
ouvre cette URL (navigateur : nouvel onglet ; mobile : WebView native, jamais une iframe
HTML — LigdiCash la bloque).

```
POST {LIGDICASH_BASE_URL}/redirect/checkout-invoice/create
```

> ⚠️ **Champ vérifié sur l'API réelle (intégration IKA DRIVE, août 2026)** : chaque
> item DOIT porter **`unit_price`** — avec `price` seul, l'API répond
> `response_code "01"`, `response_text "Echec (Code04)"`,
> `response_text_details "Undefined array key \"unit_price\""`. Envoyer
> `unit_price` + `total_price` (et conserver `price` par compatibilité documentaire).

```json
{
  "commande": {
    "invoice": {
      "items": [
        {
          "name": "Abonnement PRO",
          "unit_price": 5000,
          "total_price": 5000,
          "price": 5000,
          "quantity": 1
        }
      ],
      "total_amount": 5000,
      "devise": "XOF",
      "description": "Abonnement PRO — changement de plan",
      "customer": "",
      "customer_firstname": "Amadou",
      "customer_lastname": "Diallo",
      "customer_email": "amadou@exemple.com"
    },
    "store": { "name": "IKA DRIVE", "website_url": "https://ikadrive.example" },
    "actions": {
      "cancel_url": "http://localhost:4200/drive/paiements?statut=annule",
      "return_url": "http://localhost:4200/drive/paiements?statut=succes",
      "callback_url": "{LIGDICASH_CALLBACK_URL}"
    },
    "custom_data": { "transaction_id": "<id du paiement créé en base>" }
  }
}
```

Réponse en cas de succès :

```json
{
  "response_code": "00",
  "token": "eyJ0eXAiOiJKV1Qi...",
  "response_text": "https://app.ligdicash.com/pay/invoice/eyJ0eXAiOiJKV1Qi...",
  "wiki": "https://client.ligdicash.com/wiki/createInvoice"
}
```

Le `controllers.go` de `paiements/` renvoie `response_text` (l'URL de paiement) au
frontend/mobile, qui l'ouvre ; le `token` est stocké sur l'enregistrement `Paiement` en
base (colonne `ligdicashToken`) pour la vérification à l'étape 4.

**Laissez toujours `customer` vide** dans ce flux : passer un numéro filtre la page de
paiement pour ne montrer que les opérateurs de ce numéro.

### 2.2 Sans redirection (numéro + OTP, saisi dans l'UI IKA DRIVE)

Le client saisit son numéro (et son OTP selon l'opérateur) directement dans un formulaire
IKA DRIVE ; le backend transmet à LigdiCash sans redirection externe.

```
POST {LIGDICASH_BASE_URL}/campaign/pay
```

Champs clés : `customer` (numéro sans `+` ni espaces), `otp` (vide `""` pour un opérateur
en mode approbation comme Moov Africa — le client valide alors dans son app mobile money).
Le mode OTP varie par opérateur ; consulter la page opérateur LigdiCash correspondante
avant d'exposer ce flux pour un nouvel opérateur.

---

## 3. Payout — reverser de l'argent (remboursement)

Utilisé par `PATCH /api/paiements/:id/statut` côté admin quand le statut passe à
`rembourse`.

| Type | Endpoint | Usage |
| :--- | :--- | :--- |
| `client` (vers wallet LigdiCash) | `POST /withdrawal/create` | Le client retire ensuite vers son mobile money |
| `merchant` (direct mobile money) | `POST /straight/payout` | Virement direct, plus lent, sans wallet intermédiaire |

---

## 4. Vérification de statut (`confirm`)

**Jamais de mise à jour de statut sur la seule foi d'un callback.** Le backend appelle
toujours `confirm` avec le `token` stocké à la création (pas le token du callback, qui
est différent) avant de valider un paiement ou de livrer ce qu'il débloque (changement de
plan, déblocage de quota).

```
GET {LIGDICASH_BASE_URL}/redirect/checkout-invoice/confirm/?invoiceToken={token}
```

| Champ | Type | Description |
| :--- | :--- | :--- |
| `status` | string | `pending`, `completed`, `notcompleted` |
| `responseCode` | string | `"00"` succès, `"01"` échec |
| `amount` | float | Montant de la transaction |
| `operatorId` / `operatorName` | string | Opérateur Mobile Money détecté (Orange, Moov, Wave…) — à stocker sur `Paiement.operateur` |
| `customer` | string | Numéro du client |
| `token` | string | Token de la transaction |
| `customData` | objet | Données personnalisées envoyées à la création (`transaction_id`) |

---

## 5. Cycle de vie d'une transaction

| Statut | Signification |
| :--- | :--- |
| `pending` | État par défaut à la création. Peut durer indéfiniment — un client peut réclamer auprès de son opérateur des jours après, LigdiCash attend l'issue définitive. |
| `completed` | Paiement confirmé — état final. |
| `notcompleted` | Paiement échoué ou annulé — état final, rare. |

`pending` **n'est pas une erreur et ne doit jamais être recréé automatiquement**. Des
tentatives d'OTP échouées ne font pas passer la transaction à `notcompleted` — elle reste
`pending` jusqu'à décision définitive de l'opérateur.

---

## 6. Callback (webhook) — réception et sécurisation

### Exigences côté route `POST /api/paiements/callback`

| Critère | Valeur |
| :--- | :--- |
| Accessibilité | Publiquement accessible (pas `localhost` — utiliser `ngrok` en développement) |
| Authentification | Aucune (ni basic auth, ni token dans l'URL) |
| Formats acceptés | `application/json` **et** `application/x-www-form-urlencoded` (LigdiCash envoie les deux, voir idempotence ci-dessous) |
| Réponse | Toujours `200`, immédiatement, avant tout traitement métier |

### Idempotence — LigdiCash envoie deux requêtes par événement

Une en `application/x-www-form-urlencoded`, une en `application/json`, avec les mêmes
données. Sans déduplication, un paiement serait traité deux fois (double crédit,
changement de plan appliqué deux fois).

Déduplication via contrainte unique GORM sur le paiement, dans `paiements/services.go` :

```go
// transactionID extrait de custom_data (clé "transaction_id")
result := db.Where("id = ? AND traite = false", transactionID).
    Model(&Paiement{}).
    Update("traite", true)

if result.RowsAffected == 0 {
    // Déjà traité — deuxième requête du doublon LigdiCash, ou transaction inconnue
    return c.SendStatus(fiber.StatusOK)
}

// Première réception : revérifier avec confirm (jamais confiance au seul payload)
// puis appliquer l'effet métier (changement de plan, déblocage de quota) et
// journaliser dans activites/.
```

L'atomicité du `UPDATE ... WHERE traite = false` évite la race condition si les deux
requêtes du doublon arrivent simultanément — un simple `SELECT` puis `INSERT` ne suffit
pas.

---

## 7. Stratégie de vérification — callback + fallback Asynq

Le callback est le mécanisme principal, mais n'est pas garanti (réseau, timeout). Le
backend s'appuie sur le worker Asynq déjà en place (`jobs/`) pour un polling de secours,
au lieu d'un cron/queue worker générique :

1. Création de la transaction → `Paiement.statut = "en_attente"`, `ligdicashToken` stocké.
2. Si le callback n'arrive pas sous 2 minutes → enfiler une tâche Asynq
   `paiement:reverification` (délai `ProcessIn`), même mécanisme que
   `corbeille:purge` ou `quota:alerte`.
3. La tâche appelle `confirm` avec le token stocké ; si toujours `pending`, elle se
   replanifie (jusqu'à 10 tentatives, intervalle 5 s pour un payin — 30-60 s pour un
   payout, qui est traité par batch côté opérateur).
4. Au-delà du nombre max de tentatives, marquer `Paiement.statut = "expire"`
   (statut applicatif interne, pas un statut LigdiCash) mais continuer à traiter le
   callback s'il arrive tard — une transaction `pending` chez LigdiCash n'est jamais
   annulée par un timeout côté IKA DRIVE.

Ne jamais descendre sous 3 secondes entre deux appels `confirm` — un polling trop
agressif déclenche des limites de débit côté LigdiCash.

---

## 8. Gestion des erreurs

Vérifier `response_code` après **chaque** appel : `"00"` = succès, `"01"` = échec. Le
champ `wiki` de chaque réponse pointe vers la documentation des sous-codes spécifique à
l'endpoint appelé — s'y référer plutôt que de deviner la cause depuis `response_text`.

**Vérifié sur l'API réelle :** en cas d'échec, la réponse contient aussi
`response_text_details` avec la cause précise (ex. `Undefined array key "unit_price"`).
**Toujours journaliser la réponse complète côté serveur** lors d'un refus — c'est ce
champ qui permet de corriger le payload sans deviner. Côté client, ne renvoyer qu'un
message générique (jamais les détails techniques ni le `wiki`).

## 8 bis. Retour d'expérience — intégration réelle IKA DRIVE (août 2026)

Comportements **constatés** sur l'API de production, à connaître pour les prochains
projets :

- **`unit_price` obligatoire** dans les items (voir §2.1) — écart entre la
  documentation et l'API réelle.
- L'URL de paiement renvoyée dans `response_text` est de la forme
  `https://client.ligdicash.com/directpayment/invoice/{jwt}` (et non
  `app.ligdicash.com/pay/invoice/...` comme documenté) : ne jamais coder en dur le
  motif de l'URL, ouvrir telle quelle.
- La page de facture hébergée porte son propre `Transaction ID` (ex. `P2805111260832`),
  différent du `token` : seuls le `token` stocké à la création et le
  `transaction_id` de `custom_data` servent au rapprochement.
- Une transaction non payée reste `pending` indéfiniment côté `confirm` — l'UI doit
  le présenter comme un état normal (« finalisez le paiement puis vérifiez »), jamais
  comme une erreur.

### Intégration frontend (leçons UX validées en test navigateur)

- **Bloqueurs de popups** : `window.open(url)` appelé après l'`await` de la création
  de facture est bloqué. Ouvrir l'onglet de façon **synchrone dans le geste de clic**
  (`const onglet = window.open('about:blank', '_blank')`) puis rediriger
  `onglet.location.href = urlPaiement` à la réponse ; si `onglet` est nul, replier sur
  `window.location.href = urlPaiement` (le `return_url` ramène l'utilisateur).
- **Issue du retour de paiement** : afficher un **bandeau persistant refermable** dans
  la page (`?paiement=retour&id=…` → vérification `confirm` → succès/attente/échec ;
  `?paiement=annule` → annulation). Un toast émis pendant la navigation initiale peut
  se perdre : le bandeau est la source fiable, le toast un complément.
- **Nettoyer l'URL** (`router.navigate([], { queryParams: {}, replaceUrl: true })`)
  après traitement du retour pour éviter tout rejeu au rafraîchissement.
- Le montant est **toujours calculé côté serveur** depuis le plan visé — le client
  n'envoie que `{ planId, cycle }`.

---

## 8 ter. Retour d'expérience — intégration AideDons (août 2026, backend Go/Fiber)

Deuxième intégration réelle de ce skill. Leçons **vérifiées en conditions réelles**
(stub local reproduisant le contrat complet, puis clés de production) :

### Callback
- **Répondre 200 immédiatement, traiter en arrière-plan** : extraire la référence et
  le corps AVANT de lancer une goroutine de traitement, puis renvoyer 200. Ne jamais
  faire l'appel `confirm` (jusqu'à 15 s de timeout) dans le handler du callback.
- **Le callback form-urlencoded aplatit les clés imbriquées** : `custom_data` arrive
  sous la forme `custom_data[transaction_id]=...`. Chercher la référence dans les DEUX
  formats : champs de formulaire (`transaction_id`, `custom_data[transaction_id]`) puis
  JSON (`custom_data.transaction_id`, champs à plat).
- **Journaliser chaque callback brut en base** (table d'événements de paiement) avant
  tout traitement : c'est la seule trace exploitable en cas de litige.
- L'idempotence par transition de statut atomique (`en_attente → confirme`, rejeu →
  erreur « déjà traité » avalée) suffit — vérifiée avec le double callback réel
  JSON + form : le montant n'est compté qu'une fois.

### Vérification `confirm`
- **Comparer le montant confirmé au montant attendu** avant de créditer : en cas
  d'écart, ne PAS créditer, journaliser une alerte. (Un `confirm` ne prouve pas que le
  bon montant a été payé si la facture a été altérée.)
- Prévoir les deux casses de champs dans la réponse (`status`/`Status`,
  `operator_name`/`operatorName`) — la doc et l'API divergent selon les endpoints.
- Stocker l'opérateur détecté à la confirmation (utile support/compta).

### Colonnes en base
- Le token de facture est un **JWT long** : prévoir 512–1024 caractères, pas 255.
- Ne jamais confirmer avec le token d'un callback (différent) : toujours celui stocké
  à la création — d'où l'importance de le stocker AVANT de rediriger le client.

### Dev local sans callback public
- LigdiCash ne peut pas joindre `localhost` : **le polling de secours (worker différé
  qui appelle `confirm`) suffit à confirmer les paiements en dev** — vérifié : paiement
  confirmé automatiquement à +2 min sans qu'aucun callback ne soit reçu. La page de
  retour (`return_url`) qui re-vérifie via `confirm` au chargement couvre le reste.

### Sécurité
- **Désactiver les points d'entrée du mode mock** (webhook générique signé, simulateur)
  quand le prestataire réel est actif : sinon un secret de dev faible permettrait de
  créditer des paiements sans argent réel.
- Créer une facture ne déplace aucun fonds : on peut tester la création + `confirm`
  (`pending`) avec les clés de production sans risque. Ne jamais automatiser le
  paiement lui-même.

### Architecture Go (imports circulaires)
- `paiements/` importe `dons/` (ou `commandes/`), jamais l'inverse : exposer un hook
  `dons.CreerCheckout func(...)` (variable de fonction) branché au démarrage par
  `paiements.ActiverLigdicash()` quand `PAYMENT_PROVIDER=ligdicash`.

### Tester sans clés : stub local
Un petit serveur Go (~150 lignes) reproduisant le contrat — `create` (avec le refus
`Code04` si `unit_price` manque), page de facture hébergée, **double** callback
JSON + form avec un token de callback différent, `confirm` à états, et un mode
« payé sans callback » pour éprouver le polling de secours — permet de valider TOUTE
l'intégration au navigateur avant d'avoir les clés. À refaire sur chaque projet.

---

## 9. Références officielles

- [Guide — Intégration mobile Flutter](https://developers.ligdicash.com)
- [Payin avec redirection](https://developers.ligdicash.com)
- [Payout — Introduction](https://developers.ligdicash.com)
- [Sécurisation du callback](https://developers.ligdicash.com)
- Point d'entrée général : https://developers.ligdicash.com/essentials/introduction
