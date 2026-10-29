<!-- README.md -->

# Orkobi — 0.1.0-EXP

**Orkobi s'adapte à vous.**

Fondations d'un ERP open source, modulaire et multi-organisation, indépendant de
LUMA et de Kyros. Les bibliothèques internes, les contrats du SDK et un premier
Core NestJS, un BFF et une interface React sont disponibles. Les étapes techniques
0.1 à 0.4 de la phase 0 sont terminées. PostgreSQL, les migrations et une pile
Docker Compose locale sont disponibles. L'installation applicative,
l'authentification et les fonctionnalités métier restent à construire.

## Démarrage

Prérequis : Node.js >= 22.22.2 et pnpm 12.16.1, indiqué dans `packageManager`.
Utiliser exclusivement pnpm. Les packages sont privés et ne doivent pas être publiés.

```sh
pnpm install --frozen-lockfile
pnpm check
cp .env.example .env
pnpm dev
```

| Commande            | Action réelle                                                                     |
| ------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`          | Lance Core, BFF et React/Vite avec recompilation backend et rechargement frontend |
| `pnpm dev:core`     | Lance uniquement le Core avec surveillance                                        |
| `pnpm dev:bff`      | Lance uniquement le BFF avec surveillance                                         |
| `pnpm dev:web`      | Lance uniquement Vite ; Core/BFF doivent être lancés séparément                   |
| `pnpm start:bff`    | Lance le BFF compilé et sert le frontend compilé                                  |
| `pnpm start:core`   | Lance le Core déjà compilé et charge le `.env` racine                             |
| `pnpm build`        | Compile les sept bibliothèques/SDK et les trois applications                      |
| `pnpm format`       | Formate les fichiers avec Prettier                                                |
| `pnpm format:check` | Vérifie le formatage sans modifier les fichiers                                   |
| `pnpm lint`         | Exécute ESLint, sans avertissement accepté                                        |
| `pnpm typecheck`    | Compile puis vérifie les packages et les contrats publics sans émission           |
| `pnpm test`         | Compile, vérifie les contrats TypeScript et lance les tests Node.js               |
| `pnpm check`        | Vérifie le formatage, le lint et les tests, compilation comprise                  |

Les sorties `dist/` sont générées ; il faut compiler avant de consommer les packages.
L'interface s'ouvre sur `http://127.0.0.1:5173` en développement, puis sur le port
du BFF (`3000`) avec `pnpm build` et `pnpm start:bff`.
Voir [le guide frontend/BFF](DOCS/FRONTEND_BFF.md) pour les routes et la configuration.
Le Core répond par défaut sur `http://127.0.0.1:3001/health`. Ce contrôle de
vitalité ne vérifie aucune base SQL. La documentation interne est désactivée par
défaut ; avec `CORE_OPENAPI_ENABLED=true`, Swagger est disponible sur
`/internal/docs` et le document JSON sur `/internal/openapi.json`.
Voir [le guide du Core](DOCS/CORE.md) pour la configuration et les limites.

Pour lancer toute la pile avec PostgreSQL et persistance :

```sh
pnpm infra:init
pnpm infra:up
```

Ouvrir `http://127.0.0.1:3000`. `infra:init` conserve tout `.env` existant :
dans ce cas, compléter les variables SQL manquantes. `pnpm infra:down` arrête
la pile en conservant les données. `pnpm infra:test` vérifie migrations,
redémarrage et persistance dans un projet Docker isolé.
Voir [l'installation et l'exploitation locales](DOCS/INFRASTRUCTURE.md).

## Organisation

```text
apps/core/             Core NestJS, services internes, vitalité, erreurs et OpenAPI
apps/bff/              BFF NestJS, contrat HTTP et service des fichiers web compilés
apps/web/              React/Vite, routage, thèmes et traductions FR/EN
lib/contracts/         Identifiants, contexte, erreurs et résultats
lib/database/          Contrats SQL, pool PostgreSQL et migrations internes
lib/security/          Rôles, permissions et refus par défaut
lib/identity/          Utilisateurs, organisations, appartenances, références OIDC
lib/events/            Contrats de publication et d'abonnement
sdk/types/             Types publics destinés aux modules
sdk/core/              Façade des futurs services du Core
modules/               Emplacement réservé aux fonctionnalités métier
tests/                 Tests exécutables et tests de contrats TypeScript
scripts/               Supervision locale de la compilation et du Core
infra/postgres/        Initialisation des comptes SQL locaux
DOCS/                  Roadmap, architecture, conventions SDK et rapport initial
CHANGELOG.md           Historique des modifications et validations
```

Le Core décide et orchestre ; `lib/` contient les mécanismes internes ; `sdk/`
définit l'accès public contrôlé ; les modules apportent les fonctionnalités métier.
Le SDK TypeScript ne constitue pas une isolation de sécurité des extensions.

Voir [l'architecture](DOCS/ARCHITECTURE.md), les [conventions SDK](DOCS/SDK.md),
le [rapport du bootstrap](DOCS/BOOTSTRAP.md), la [roadmap](DOCS/ROADMAP.md)
et le [changelog](CHANGELOG.md).
La [revue des étapes 0.1/0.2](DOCS/REVIEW_PHASE_0.md) détaille les corrections
et les preuves locales ; la version produit 0.1.0-EXP reste à construire.

La [stratégie Git et de versioning](DOCS/VERSIONING.md) définit les branches,
les Pull Requests et le cycle de publication. Le [diagnostic d'initialisation](DOCS/GIT_BOOTSTRAP.md)
consigne la base retenue et les actions distantes restant à valider.
