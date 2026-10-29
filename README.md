<!-- README.md -->

# Orkobi — 0.1.0-EXP

**Orkobi s'adapte à vous.**

Fondations d'un ERP open source, modulaire et multi-organisation, indépendant de
LUMA et de Kyros. Les bibliothèques internes, les contrats du SDK et un premier
Core NestJS démarrable avec ses interfaces de services sont disponibles.
Les étapes techniques 0.1 et 0.2 de la phase 0 sont terminées. Le BFF, React, PostgreSQL et
l'authentification restent à construire.

## Démarrage

Prérequis : Node.js >= 22.22.2 et pnpm 12.16.1, indiqué dans `packageManager`.
Utiliser exclusivement pnpm. Les packages sont privés et ne doivent pas être publiés.

```sh
pnpm install --frozen-lockfile
pnpm check
cp .env.example .env
pnpm dev
```

| Commande            | Action réelle                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Compile puis lance le Core ; recompile et redémarre après changement des sources ou de `.env` |
| `pnpm start:core`   | Lance le Core déjà compilé et charge le `.env` racine                                         |
| `pnpm build`        | Compile les sept bibliothèques/SDK et le Core dans l'ordre de leurs dépendances               |
| `pnpm format`       | Formate les fichiers avec Prettier                                                            |
| `pnpm format:check` | Vérifie le formatage sans modifier les fichiers                                               |
| `pnpm lint`         | Exécute ESLint, sans avertissement accepté                                                    |
| `pnpm typecheck`    | Compile puis vérifie les packages et les contrats publics sans émission                       |
| `pnpm test`         | Compile, vérifie les contrats TypeScript et lance les tests Node.js                           |
| `pnpm check`        | Vérifie le formatage, le lint et les tests, compilation comprise                              |

Les sorties `dist/` sont générées ; il faut compiler avant de consommer les packages.
Le Core répond par défaut sur `http://127.0.0.1:3001/health`. Ce contrôle de
vitalité ne vérifie aucune base SQL. La documentation interne est désactivée par
défaut ; avec `CORE_OPENAPI_ENABLED=true`, Swagger est disponible sur
`/internal/docs` et le document JSON sur `/internal/openapi.json`.
Voir [le guide du Core](DOCS/CORE.md) pour la configuration et les limites.

## Organisation

```text
apps/core/             Core NestJS, services internes, vitalité, erreurs et OpenAPI
apps/{bff,web}/         Emplacements réservés au BFF et à React
lib/contracts/         Identifiants, contexte, erreurs et résultats
lib/database/          Contrats SQL et transactions internes
lib/security/          Rôles, permissions et refus par défaut
lib/identity/          Utilisateurs, organisations, appartenances, références OIDC
lib/events/            Contrats de publication et d'abonnement
sdk/types/             Types publics destinés aux modules
sdk/core/              Façade des futurs services du Core
modules/               Emplacement réservé aux fonctionnalités métier
tests/                 Tests exécutables et tests de contrats TypeScript
scripts/               Supervision locale de la compilation et du Core
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
