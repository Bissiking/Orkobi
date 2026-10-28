<!-- README.md -->
# Orkobi — 0.1.0-EXP

**Orkobi s'adapte à vous.**

Fondations d'un ERP open source, modulaire et multi-organisation, indépendant de
LUMA et de Kyros. Cette étape initialise les bibliothèques internes et le SDK.
Les applications NestJS/React et la connexion PostgreSQL restent à construire.

## Démarrage

Prérequis : Node.js >= 22.22.2 et pnpm 12.16.1, indiqué dans `packageManager`.
Utiliser exclusivement pnpm. Les packages sont privés et ne doivent pas être publiés.

```sh
pnpm install --frozen-lockfile
pnpm check
```

| Commande | Action réelle |
| --- | --- |
| `pnpm build` | Compile les sept packages dans l'ordre de leurs dépendances |
| `pnpm lint` | Exécute ESLint, sans avertissement accepté |
| `pnpm typecheck` | Compile puis vérifie les packages et les contrats publics sans émission |
| `pnpm test` | Compile, vérifie les contrats TypeScript et lance les tests Node.js |
| `pnpm check` | Lance lint et tests, compilation comprise |

Les sorties `dist/` sont générées ; il faut compiler avant de consommer les packages.
Aucun script `dev` n'est fourni tant que les applications n'existent pas.

## Organisation

```text
apps/{core,bff,web}/     Emplacements réservés aux applications
lib/contracts/         Identifiants, contexte, erreurs et résultats
lib/database/          Contrats SQL et transactions internes
lib/security/          Rôles, permissions et refus par défaut
lib/identity/          Utilisateurs, organisations, appartenances, références OIDC
lib/events/            Contrats de publication et d'abonnement
sdk/types/             Types publics destinés aux modules
sdk/core/              Façade des futurs services du Core
modules/               Emplacement réservé aux fonctionnalités métier
tests/                 Tests exécutables et tests de contrats TypeScript
DOCS/                  Roadmap, architecture, conventions SDK et rapport initial
CHANGELOG.md           Historique des modifications et validations
```

Le Core décide et orchestre ; `lib/` contient les mécanismes internes ; `sdk/`
définit l'accès public contrôlé ; les modules apportent les fonctionnalités métier.
Le SDK TypeScript ne constitue pas une isolation de sécurité des extensions.

Voir [l'architecture](DOCS/ARCHITECTURE.md), les [conventions SDK](DOCS/SDK.md),
le [rapport du bootstrap](DOCS/BOOTSTRAP.md), la [roadmap](DOCS/ROADMAP.md)
et le [changelog](CHANGELOG.md).
