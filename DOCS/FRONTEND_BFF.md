# Frontend et BFF — étape technique 0.3

> Ce guide conserve la description du shell livré en 0.3. La
> [Phase 1](PHASE_1.md) ajoute les parcours authentifiés, la délégation et
> l'administration ; la [Phase 2](PHASE_2.md) ajoute le registre de modules,
> l'activation par organisation et la page de démonstration. Ils prévalent pour
> les routes et contrats actuels. Le bootstrap est de schéma 2 et le BFF ne
> relaie les cookies Orkobi/CSRF que pour la liste fermée de routes
> `/api/platform/*`, y compris les routes modules et capabilities.

Livraison locale du 31 octobre 2026, version produit **0.2.0-EXP**.
La 0.3 désigne la section de la phase 0, pas une publication produit 0.3.0.

## Applications et démarrage

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Le lancement commun démarre :

- React/Vite sur `http://127.0.0.1:5173` ;
- le BFF NestJS sur `http://127.0.0.1:3000` ;
- le Core NestJS sur `http://127.0.0.1:3001`.

Le navigateur appelle seulement `/api` sur sa propre origine. En développement,
Vite relaie ces appels vers le BFF ; seul le BFF contacte le Core.
La page peut être affichée pendant le démarrage des serveurs : un échec de
connexion propose de réessayer et ne remplace pas l'interface par un écran vide.

Commandes séparées : `pnpm dev:core`, `pnpm dev:bff`, `pnpm dev:web`.
Le superviseur commun compile Core/BFF et leurs dépendances en une seule passe,
sans compilations concurrentes des contrats. Les sources backend et `.env`
déclenchent une recompilation puis un redémarrage des deux serveurs. Vite gère
les sources frontend. Un échec de compilation laisse la surveillance active.
Les modifications de manifests et de configuration TypeScript demandent un relancement.
Ctrl+C arrête les processus enfants ; aucun service n'est installé sur la machine.

Pour exécuter les artefacts compilés, dans deux terminaux :

```sh
pnpm build
pnpm start:core
```

```sh
pnpm start:bff
```

Le BFF sert alors `apps/web/dist` et les routes frontend sur son port, y compris
un accès direct ou un rechargement sur `/settings` ou `/modules`. Le packaging
actuel suppose le monorepo présent avec son manifeste racine et le build web.
Le [lot infrastructure 0.4](INFRASTRUCTURE.md) ajoute une image et une procédure
Compose locales ; aucun déploiement de production n'est annoncé.

## Configuration

Conserver son `.env` existant ; `.env.example` documente les valeurs publiques de
ce socle. Les variables déjà définies dans le processus ont priorité.

| Variable          | Défaut                  | Usage                                                                              |
| ----------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `BFF_HOST`        | `127.0.0.1`             | Écoute du BFF ; non vide, sans espaces ni chemin                                   |
| `BFF_PORT`        | `3000`                  | Port entier de 1 à 65535                                                           |
| `CORE_URL`        | `http://127.0.0.1:3001` | Origine HTTP(S), sans identifiants, chemin, query ou fragment ; serveur uniquement |
| `CORE_TIMEOUT_MS` | `2000`                  | Délai total de la sonde Core, de 100 à 10000 ms                                    |
| `WEB_PORT`        | `5173`                  | Port Vite/preview, entier de 1 à 65535, sans remplacement automatique si occupé    |

Le proxy Vite de développement cible le BFF local au port `BFF_PORT`.
En cas de changement de `CORE_PORT`, adapter aussi `CORE_URL`. Aucune variable
Core, cookie, jeton ou URL privée ne doit être préfixée `VITE_` pour l'exposer
au bundle. Les configurations serveur ne sont jamais envoyées au navigateur.

## Contrat navigateur ↔ BFF ↔ Core

Les types et validateurs runtime neutres sont dans `lib/contracts/src/http.ts` :

- `CoreHealth` et `isCoreHealth` pour `GET /health` du Core ;
- `BffBootstrap` et `isBffBootstrap` pour `GET /api/bootstrap` du BFF.

`GET /api/health` sonde uniquement la vitalité HTTP du BFF :

```json
{ "status": "ok", "service": "orkobi-bff" }
```

`GET /api/bootstrap` agrège des informations encore utiles si le Core ne répond
pas ; il retourne donc HTTP 200 avec un état Core explicite :

```json
{
  "schemaVersion": 2,
  "product": { "name": "Orkobi", "version": "0.2.0-EXP" },
  "core": { "status": "ok" },
  "features": {
    "identity": "unavailable",
    "organizations": "unavailable",
    "modules": "unavailable"
  },
  "checkedAt": "2026-10-31T09:00:00.000Z"
}
```

La date de cet exemple est illustrative. En cas d'échec, `core` vaut
`{ status: 'unavailable', reason }`, avec `timeout`, `unreachable` ou
`invalid_response`. Les trois features passent à `available` lorsque la base et
le registre de modules sont prêts (`initialized`, `databaseReady` et
`modulesReady` tous vrais dans le status du Core). Le frontend distingue l'indisponibilité du Core de celle
du BFF, affiche la récupération possible et conserve les pages de découverte.
Un schéma BFF incohérent est rejeté, sans afficher un faux état disponible.
Le futur contrat métier demandera une évolution explicite de ce schéma.

La sonde amont utilise exclusivement `/health` sur l'origine configurée, un
signal d'annulation, une limite de corps de 4 Ko et une validation JSON du
service attendu. Les redirections sont refusées. Aucun en-tête d'autorisation,
cookie ou origine du navigateur n'est relayé ; aucune cible fournie par le
navigateur ne pilote une requête serveur. Les identifiants de corrélation sont
créés par les serveurs ; le Core garde son propre UUID.

Le BFF applique le même format public `{ error: CoreError }` pour les erreurs
HTTP, des messages fixes, un UUID de corrélation et des logs JSON sans corps,
URL, en-tête ou exception brute. Les routes `/api/*` inconnues restent des 404
JSON. Les ressources statiques absentes restent des erreurs, pas une réponse
HTML de substitution. Le fallback HTML concerne uniquement les routes de page.
Les deux sondes HTTP ne vérifient aucune base SQL ni préparation métier.

Depuis la 0.4, `/api/ready` vérifie distinctement `/health/ready` du Core, qui
contrôle PostgreSQL et les migrations. Cette sonde renvoie 200 avec
`{ status: 'ok', service: 'orkobi-bff' }` si la chaîne est disponible, sinon 503.
`/api/health` et le bootstrap conservent leur comportement de vitalité décrit ici.

## Routes et interactions

| Route               | Comportement actuel                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `/`                 | Accueil centré sur les organisations et les accès modules                                                 |
| `/organizations`    | État de préparation, présentation des usages entreprise/association, création explicitement désactivée    |
| `/modules`          | Catalogue de présentation, registre réel des modules, activation par organisation (droit `modules:write`) |
| `/modules/demo`     | Notes de démonstration du module `orkobi.demo` (`demo:read`/`demo:write`) pour l'organisation active      |
| `/settings`         | Thème clair/sombre/système, langue FR/EN, enregistrement local automatique                                |
| `/system`           | État réel BFF/Core/registre, vérification manuelle et reprise après panne                                 |
| Autre route de page | Écran 404 localisé avec retour à l'accueil                                                                |

Les filtres `audience=business|association` et `q=...` restent dans l'URL ;
rechargement, lien direct et retour navigateur conservent le contexte.
Le catalogue de présentation reste distinct du registre réel : sans session ou
organisation active, seule la présentation s'affiche ; le registre, l'activation
et les données de module exigent les permissions correspondantes et sont relais
vers le Core (voir [PHASE_2.md](PHASE_2.md)).

La navigation mobile utilise un `<dialog>` natif : focus contraint au tiroir,
fermeture par Échap et restitution du focus. Un lien d'évitement, un focus visible,
des libellés explicites et la réduction des animations sont prévus.
Les thèmes suivent les changements du système lorsque le mode « Système » est
sélectionné. La langue met aussi à jour le titre de page et `html[lang]`.

Les préférences sont conservées sous `orkobi.preferences` dans `localStorage`.
Si le stockage est indisponible ou invalide, l'interface reste utilisable et
indique lorsque les préférences ne peuvent être conservées. Les préférences de thème
sont appliquées avant React par un script local externe, compatible avec la CSP
sans script inline autorisé. Aucune synchronisation de préférences utilisateur
côté serveur n'existe encore.

## Frontières et limites

Le BFF est un point d'entrée technique public, sans authentification à ce stade.
Il n'offre aucune opération métier ni administration. Pas de CORS permissif,
de confiance implicite dans les proxies, de session fictive ou d'accès SQL.
Les en-têtes de protection navigateur sont actifs sur le BFF et ses ressources,
avec scripts et fontes de même origine. Le transport du socle local est HTTP ;
TLS, authentification BFF/Core, CSRF des futures opérations authentifiées,
limitation de débit et exposition en production restent à concevoir dans leurs lots.

Les produits cités par l'utilisateur (Odoo et Business Central) servent de
repères de clarté du shell, sans reprise de marque ou promesse de fonctionnalités.
La vérité produit figure dans `PRODUCT.md`, les règles visuelles dans `DESIGN.md`.

## Preuves locales

- `pnpm check` : formatage, lint, dix compilations et 43 tests Node.js (sous-tests compris).
- `pnpm typecheck`, installation avec lockfile figé, contrôle de peers : réussis.
- Audit des dépendances d'exécution : aucun avis connu signalé lors du contrôle.
- `tests/bff.test.mjs` : vrais ports HTTP, véritable Core/BFF pour le chemin nominal,
  serveurs jetables pour les pannes, timeout de réponse et de corps, redirection,
  mauvais service, JSON invalide/trop gros, panne réseau et récupération ;
  routes React directes, ressources statiques, CSP, erreurs JSON et absence de secrets relayés.
- `tests/browser/phase03.mjs` exécuté avec `playwright-cli run-code --filename` :
  Chrome headless, 1440 × 1000 et 390 × 844, dix captures, navigation, URL,
  filtres/recherche, FR/EN, thèmes et persistance, système, 404, tiroir/Échap/focus,
  reprise et absence de débordement. Le chemin nominal utilise les vrais serveurs ;
  les pannes affichées dans ce parcours navigateur sont simulées par interception HTTP.
- `tests/browser/dev-smoke.mjs` et `tests/browser/hmr.mjs` : parcours Vite et
  rechargement à chaud pendant recompilation des contrats. Le premier contrôle
  a révélé un mélange Provider/hook incompatible avec Fast Refresh ; les contextes
  et hooks sont séparés des composants pour corriger ce cas, puis retestés sans reload de secours.
- `pnpm dev` exécuté avec trois ports de test : HTTP avant/après recompilation,
  HMR React et arrêt des processus avec vérification de libération des ports.
- Détecteur Impeccable : aucun défaut déterministe signalé. Revue visuelle séparée
  des dix captures : disposition `ship`, aucun correctif matériel requis ;
  textes secondaires compacts et scrollbar native signalés comme notes non bloquantes.

Les captures locales sont sous `.impeccable/review/` (ignorées par Git).
Le parcours navigateur se lance sur une session Playwright ouverte à l'origine
à tester : `playwright-cli -s=<session> run-code --filename tests/browser/phase03.mjs`.
Le contrôle HMR attend une modification du mtime de `apps/core/src/health.controller.ts`
pendant son exécution, pour reproduire la recompilation des contrats.
Ces tests ne sont pas une CI navigateur déjà installée ; la CLI est fournie par
le skill local ou peut être lancée ponctuellement avec pnpm.

Aucune preuve de production, de persistance SQL, d'authentification, d'isolation
multi-organisation réelle ou d'activation de module n'est revendiquée.
Aucun commit, push, tag, publication ou déploiement n'est effectué dans ce lot.

Références techniques primaires : [Vite](https://vite.dev/guide/),
[React Router BrowserRouter](https://reactrouter.com/api/declarative-routers/BrowserRouter),
[NestJS](https://docs.nestjs.com/fundamentals/custom-providers),
[Fast Refresh et exports cohérents](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports).
