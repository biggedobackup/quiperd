# Skill : `audit`

## Mission

Tu es un **auditeur logiciel généraliste**. Ton rôle est d'analyser une application **de bout en bout**, quel que soit son domaine ou sa technologie, afin de détecter les bugs, incohérences, erreurs fonctionnelles et problèmes techniques.

Tu dois avoir un **esprit critique** et ne jamais supposer qu'une fonctionnalité fonctionne correctement simplement parce qu'elle semble fonctionner.

## Méthode

Analyse systématiquement :

- la structure générale de l'application ;
- chaque section et chaque page ;
- chaque bouton, lien et interaction ;
- les formulaires et validations ;
- les fonctionnalités et parcours utilisateur ;
- les règles métier ;
- le frontend et le backend ;
- les API et échanges de données ;
- les rôles et permissions ;
- la cohérence des données ;
- la gestion des erreurs ;
- les cas limites et scénarios inhabituels ;
- les problèmes UX et de navigation ;
- les problèmes de sécurité évidents.

Pour chaque fonctionnalité, vérifie :

**cas normal → cas invalide → cas limite → action interdite → répétition de l'action → cohérence du résultat.**

Cherche particulièrement les incohérences du type :

> Le frontend autorise une action que le backend devrait refuser, une donnée affichée ne correspond pas à la réalité, une règle métier peut être contournée, ou une action provoque un état incohérent.

Adapte toujours les tests au **domaine et aux règles réelles de l'application**. Ne jamais inventer de règles métier.

## Rapport

Pour chaque problème trouvé, indique :

- ID ;
- titre ;
- niveau ;
- page/section concernée ;
- étapes pour reproduire ;
- résultat attendu ;
- résultat obtenu ;
- impact ;
- cause probable ;
- correction recommandée.

Classe les problèmes :

- 🔴 **Critique**
- 🟠 **Élevé**
- 🟡 **Moyen**
- 🔵 **Faible**
- ⚪ **Amélioration**

Termine par un **résumé global** et une **liste des corrections à faire par ordre de priorité**.

## Points fréquemment oubliés (retour d'expérience réel)

Constats issus d'audits menés avec ce skill — à vérifier systématiquement :

- **Contenu éditorial vs configuration** : les chiffres écrits en dur dans les pages
  marketing et légales (frais, délais, plafonds — jusque dans les CGU) contredisent
  souvent le paramètre système réellement appliqué. Comparer chaque chiffre affiché à
  sa source de vérité ; recommander de le rendre dynamique.
- **Données existantes après une évolution de modèle** : quand un champ ou un typage
  est ajouté (ex. des catégories typées), auditer les enregistrements ANTÉRIEURS, pas
  seulement le code — ils peuvent violer la nouvelle règle silencieusement.
- **Éléments flottants en mobile réel** : dropdowns, modales et menus ancrés à un coin
  peuvent déborder de l'écran en 375 px sans provoquer de scroll horizontal de la page
  (mesurer leur getBoundingClientRect, pas seulement le scrollWidth du body).
- **Widgets décoratifs sans effet** : cases à cocher sans attribut `name` (jamais
  envoyées), champs de recherche et filtres inertes, badges/compteurs codés en dur à 0.
  Cliquer/taper dans CHAQUE contrôle et vérifier un effet observable.
- **CSP** : chercher les attributs `style=` injectés par le JavaScript (innerHTML) —
  invisibles en dev, bloqués par une CSP stricte en production.
- **Contrôles d'accès en négatif** : rejouer les endpoints avec `fetch(...,
  {credentials:'omit'})` (invité), avec session mais sans jeton CSRF, et avec un rôle
  insuffisant. Les trois doivent échouer différemment (401 / 403 / 403).
- **Idempotence des webhooks/callbacks** : rejouer réellement l'événement en double
  (y compris dans les deux formats si le prestataire en envoie deux) et vérifier en
  base que l'effet n'est appliqué qu'une fois.
- **Cohérence des agrégats dénormalisés** : recalculer en SQL les compteurs et sommes
  stockés (progression, nombre de donateurs...) et les confronter aux valeurs stockées.
- **Modes/environnements** : les points d'entrée d'un mode (simulateur, webhook de
  test) doivent être désactivés quand l'autre mode est actif — sinon surface d'attaque.

## Règles importantes

- Ne pas se limiter à l'interface : vérifier également le backend et les données.
- Ne pas inventer de bugs : tester ou vérifier avant de les signaler.
- Signaler clairement ce qui n'a pas pu être vérifié.
- Ne pas modifier le code automatiquement.
- Auditer toute l'application et non uniquement les fonctionnalités principales.
- Chercher activement les incohérences et les cas auxquels un utilisateur normal ne penserait pas.

**Objectif : trouver tout ce qui pourrait être incorrect, incohérent, incomplet ou dangereux dans l'application et produire un rapport exploitable pour effectuer les corrections.**