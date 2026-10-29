# Core HTTP — 0.1.0-EXP

Livraison locale du 29 octobre 2026 : première application NestJS dans `apps/core`,
au-dessus des contrats ESM existants. Ce lot complète l'initialisation 0.1 de la
phase 0. La revue et les contrats applicatifs décrits ci-dessous terminent
l'étape technique 0.2 ; la version produit 0.1.0-EXP reste ouverte.

## Exécution

Depuis la racine, avec Node.js >= 22.22.2 et pnpm 12.16.1 :

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Conserver son `.env` s'il existe déjà. `pnpm dev` compile les dépendances workspace
et le Core, puis lance le serveur. Une modification des sources TypeScript dans
`apps/core/src`, `lib/*/src`, `sdk/*/src` ou de `.env` déclenche une recompilation
et un redémarrage. Les sorties `dist/` et `node_modules/` ne déclenchent rien.
Une erreur de compilation laisse la surveillance active jusqu'à correction.
Les changements de manifests ou de configuration TypeScript demandent de relancer
la commande. Ctrl+C arrête le serveur et la compilation en cours.

Pour lancer les artefacts déjà compilés :

```sh
pnpm build
pnpm start:core
```

Les deux commandes de démarrage chargent `.env` depuis la racine ; les variables
déjà définies dans l'environnement ont priorité. Le fichier reste facultatif.
Les décorateurs Nest sont compilés par `tsc` avec leurs métadonnées ; aucun
transpileur supplémentaire ni CLI globale n'est requis.

## Configuration

| Variable               | Valeur par défaut | Validation et usage                                |
| ---------------------- | ----------------- | -------------------------------------------------- |
| `NODE_ENV`             | `development`     | `development`, `test` ou `production`              |
| `CORE_HOST`            | `127.0.0.1`       | Hôte explicite, non vide et sans espaces ni chemin |
| `CORE_PORT`            | `3001`            | Entier de 1 à 65535                                |
| `CORE_OPENAPI_ENABLED` | `false`           | Chaîne exacte `true` ou `false`                    |

La configuration est validée avant l'écoute. Un échec produit un code de sortie 1
et un événement `core_start_failed`. Les erreurs de configuration indiquent le
nom de la variable attendue sans afficher sa valeur. Les autres échecs de démarrage
restent génériques pour ne pas exposer d'exception brute.

Le Core écoute uniquement sur l'interface locale par défaut. Il ne configure
aucun CORS et ne fait pas confiance aux en-têtes de proxy. Ouvrir l'interface ou
activer OpenAPI demande un choix explicite de l'opérateur ; aucune
authentification n'est encore disponible pour ces routes techniques.

Les réponses incluent CSP (`script-src 'self'`), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN` et `Referrer-Policy: no-referrer` via
[`useSecurityHeaders()` de NestJS](https://docs.nestjs.com/techniques/security/cors).
Ces protections s'appliquent aussi aux erreurs et à Swagger. Ce socle fonctionne
en HTTP local : HSTS et `upgrade-insecure-requests` ne sont pas activés ;
la politique HTTPS du futur déploiement reste à définir.

## Contrat HTTP

`GET /health` renvoie HTTP 200 :

```json
{ "status": "ok", "service": "orkobi-core" }
```

C'est une sonde de vitalité du processus HTTP. Aucune base SQL, migration,
authentification ou préparation métier n'est vérifiée.

Chaque requête reçoit un UUID créé par le serveur dans `x-request-id` et
`Cache-Control: no-store`. Un identifiant envoyé par le client n'est pas repris.
Le middleware précède le parseur JSON, limité à 100 Ko : les erreurs de parsing
et de taille ont aussi un identifiant de corrélation.

Le filtre global utilise les types `CoreError` et `ErrorCode` de `lib/contracts` :

```json
{
  "error": {
    "code": "not_found",
    "message": "Ressource introuvable.",
    "correlationId": "identifiant de cette requête"
  }
}
```

Les codes sont normalisés pour 400, 401, 403, 404, 405, 409, 413, 415, 422, 429 et 503. Une erreur inattendue renvoie 500 avec `internal_error`. Les messages
d'exception, piles et détails internes ne sont pas renvoyés. Les codes
`unauthenticated`, `rate_limited` et `internal_error` complètent le contrat public ;
ils ne signifient pas qu'une authentification ou une limitation de débit existe.

## Journalisation et OpenAPI

Le serveur écrit des lignes JSON avec horodatage UTC, niveau et événement :

- `core_listening` : hôte, port et environnement effectivement utilisés ;
- `http_request` : méthode, statut, durée en millisecondes et corrélation ;
- `http_error` : statut, code public et corrélation ;
- `core_start_failed` : motif de configuration sûr ou message générique ;
- `framework` / `framework_error` : niveau des événements Nest, sans message brut.

L'URL, ses paramètres, les corps, les en-têtes et les exceptions brutes ne sont
pas transmis au logger. Ce choix réduit les détails de diagnostic disponibles
pour cette première étape. Ce journal technique ne remplace pas le futur audit
des opérations sensibles.

Avec `CORE_OPENAPI_ENABLED=true`, Swagger est servi sur `/internal/docs` et le
document JSON sur `/internal/openapi.json`. Il décrit la réponse réelle de
`/health`. Quand le drapeau est désactivé, l'interface, ses ressources et les
descriptions ne sont pas enregistrées. Le YAML n'est pas exposé.

L'intégration suit la [documentation NestJS](https://docs.nestjs.com/first-steps)
et celle de [SwaggerModule](https://docs.nestjs.com/openapi/introduction).
Les versions sont exactes dans le manifest et le lockfile. Le script de
télémétrie transitif `@scarf/scarf` est explicitement refusé avec `allowBuilds`,
selon la [configuration des builds pnpm](https://github.com/pnpm/pnpm.io/blob/main/docs/settings/build.md).

## Interfaces des services applicatifs

`apps/core/src/services/contracts.ts` prépare les lectures d'identité et
d'organisation, les vérifications de permissions et les capabilities. Chaque
méthode interne reçoit un `OrganizationContext` explicite et retourne `Result<T>`.
Les interfaces restent distinctes des objets publics du SDK, dont les méthodes
sont déjà liées à un contexte.

`CoreServicesModule` exporte les jetons `CORE_IDENTITY`, `CORE_ORGANIZATIONS`,
`CORE_PERMISSIONS`, `CORE_CAPABILITIES` et `CoreSdkFactory`.
Il utilise les [providers personnalisés NestJS](https://docs.nestjs.com/fundamentals/custom-providers).
Ses fournisseurs initiaux retournent exclusivement `unavailable`, avec la
corrélation éventuelle. Ils n'accordent aucun droit et ne créent aucune donnée.
Les futurs managers devront remplacer ces fournisseurs par leurs implémentations.

`CoreSdkFactory.forAuthorizedContext(context)` construit une façade `CoreSdk`
gelée, liée à une copie du contexte. Tous les appels délèguent aux services
injectés ; les permissions ne sont pas mises en cache. La factory n'établit
aucune identité et ne vérifie aucune appartenance : elle doit uniquement être
appelée par le Core après autorisation. Les services devront revérifier les
droits et l'état des appartenances à chaque opération. Cette adaptation ne
constitue ni une authentification ni une isolation des extensions.

SQL, transactions, autorisation interne et événements conservent leurs contrats
dans `lib/database`, `lib/security` et `lib/events`. Ce lot ne les expose pas
au SDK et n'ajoute aucun endpoint métier.

## Validation et limites

Les tests `tests/core.test.mjs` ouvrent de vrais ports HTTP éphémères sur loopback :
vitalité, corrélation, routes absentes, OpenAPI activé/désactivé, JSON invalide,
corps trop volumineux et exception inattendue du contrôleur. Ils vérifient aussi
les codes d'erreur, l'absence de données sentinelles sensibles dans les réponses
et logs, la configuration invalide et l'échec d'un processus sur port occupé.
Les tests `tests/core-services.test.mjs` vérifient l'injection Nest, les résultats
d'indisponibilité, l'adaptation SDK, l'immuabilité du contexte et la propagation
des erreurs. Les contextes de ces tests sont synthétiques : aucune session ou
isolation SQL réelle n'est validée. `tests/types/core-services.ts` vérifie les
contraintes des consommateurs TypeScript.

Le [changelog](../CHANGELOG.md) et la [revue 0.1/0.2](REVIEW_PHASE_0.md)
consignent les commandes et contrôles de ce lot.
Aucune connexion PostgreSQL, persistance, identité réelle, façade métier,
installation initiale, isolation multi-organisation, BFF ou interface React n'est
livré. Aucune publication ou validation de production n'est revendiquée.
