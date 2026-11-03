<!-- DOCS/SDK.md -->

# Conventions SDK — 0.2.0-EXP

Le SDK est expérimental, privé et susceptible d'évoluer. Il est indépendant de
NestJS et de PostgreSQL. Le SDK ne fournit pas de client HTTP distant. Le Core applicatif fonctionne
avec PostgreSQL, MariaDB ou MySQL ; ses points d’entrée autorisés créent les contextes.
Voir [PHASE_5.md](PHASE_5.md) pour les versions prises en charge, limitations
et capabilities moteur. Les plugins tiers gardent le même pont SDK sans SQL brut.

## Surface publique

`@orkobi/sdk-types` ne contient que des types : identifiants publics, contexte,
résultats, erreurs, résumés d'identité, besoins en capabilities et déclarations
de permissions. Il ne contient pas de constructeur d'identifiants.

`@orkobi/sdk-core` définit `CoreSdk`, `IdentityService`, `PermissionService` et
`CapabilityService`. Le Core fournira une instance liée à l'utilisateur et à
l'organisation autorisés. Un module ne doit pas fabriquer son propre contexte
pour choisir une autre organisation.

```ts
// Exemple de consommation, sans implémentation fictive du Core.
import type { CoreSdk } from '@orkobi/sdk-core';
import type { Result, UserSummary } from '@orkobi/sdk-types';

export async function displayCurrentUser(sdk: CoreSdk): Promise<Result<UserSummary>> {
  return sdk.identity.currentUser();
}
```

Les imports de types emploient `import type`. Les imports internes `src/` et
`dist/` ne font pas partie de l'API ; les exports de packages les refusent.
Les services renvoient `Result<T>` : `{ ok: true, value }` ou
`{ ok: false, error: { code, message, correlationId? } }`.
Les erreurs publiques ne doivent contenir ni jetons, ni SQL, ni secrets.
Les erreurs de transport ou de programmation peuvent encore rejeter la promesse ;
la traduction des erreurs d'infrastructure incombera à l'implémentation du Core.

## Capabilities et permissions

| Notion     | Convention                                      | Sens                                                  |
| ---------- | ----------------------------------------------- | ----------------------------------------------------- |
| Capability | `namespace.nom`, par exemple `core.identity`    | Service technique disponible                          |
| Exigence   | `{ key, required }`                             | Besoin obligatoire ou facultatif d'un module          |
| Permission | `ressource:action`, par exemple `contacts:read` | Droit soumis à une autorisation dans une organisation |

Ces noms sont des conventions devenus contrats en Phase 2. La validation runtime
du manifeste (`isModuleManifest`) vérifie identité, dépendances, capabilities,
permissions et entités. Déclarer une permission ne l'accorde pas. La disponibilité
d'une capability ne confère aucun droit. Le Capability Registry du Core refuse
l'activation d'un module dont une exigence obligatoire est `unavailable` ;
une exigence facultative peut réduire ses fonctionnalités.

`sdk.permissions.can()` aide à adapter l'interface. Le Core revérifie les
droits lors de chaque opération pour gérer changements de rôle et révocations.
La façade actuelle propose des lectures d'identité, de permissions et de
capabilities ; elle n'expose aucun chargeur de module. L'accès SQL des modules
passe par le Data Access Manager du Core (`lib/database`), borné aux tables
détenues et à l'organisation (voir [PHASE_2.md](PHASE_2.md)).

## Raccord applicatif du Core

`apps/core/src/services/contracts.ts` définit les interfaces internes contextualisées
`CoreIdentityService`, `CoreOrganizationService`, `CorePermissionService` et
`CoreCapabilityService`, avec des jetons d'injection NestJS séparés du SDK public.
Le module autonome `CoreServicesModule` conserve des fournisseurs `unavailable`.
Dans l'application, `CoreServicesModule.register()` raccorde depuis la Phase 1
les fournisseurs persistants d'identité, d'organisation et de permissions, et
depuis la Phase 2 le registre de capabilities. Ils vérifient le compte,
l'organisation, l'appartenance et le rôle actuels à chaque appel ; sans SQL
prêt ils renvoient `unavailable`.

`CoreSdkFactory.forAuthorizedContext(context)` adapte ces interfaces vers `CoreSdk`.
La façade et sa copie explicite du contexte sont gelées. Chaque appel transmet
le même utilisateur, la même organisation et la corrélation éventuelle au service
concerné, sans mettre en cache les décisions de permission. La factory est interne :
elle ne vérifie ni session ni appartenance. Le futur point d'entrée du Core devra
établir et autoriser le contexte, et les implémentations persistantes contrôlent
son état et ses droits courants. Aucun endpoint de création de façade n'est exposé.

Ces contrats préparent les services métier. Le registre de capabilities et le
raccord des modules sont décrits en [Phase 2](PHASE_2.md) ; voir aussi
[CORE.md](CORE.md).

## Organisation et compatibilité

Tous les services d'une façade sont liés au même contexte. La sélection d'une
autre organisation devra passer par le Core et produire une nouvelle façade
autorisée. Les détails OIDC et les rôles internes ne sont pas exposés.

Compiler les packages avant de les importer. Les exports produisent un module ESM
et des déclarations TypeScript. Pour un consommateur CommonJS, `import()` permet
de charger le module ; `require()` a aussi été vérifié sous Node 22.22.2 pour les
artefacts actuels, sans fournir un second build CommonJS.

Les types ne constituent pas une frontière de sécurité. La [Phase 4](PHASE_4.md)
exécute le code tiers dans QuickJS/WASM, dans un worker jetable, avec un pont SDK
contrôlé et des limites. Un plugin n’est jamais importé dans le moteur JS du Core.

## UI et tâches des modules (Phase 3)

`@orkobi/sdk-ui` expose `Button`, `Field`, `Notice`, `AppIcon` et une seule feuille
CSS native. Il est consommé par l’application ; le [guide UI](UI_SDK.md) décrit les
règles pour les développeurs, plugins et IA, les thèmes et les icônes Papicons.
Aucun framework CSS externe n’est utilisé.

`@orkobi/sdk-types` exporte aussi `ModuleManifest`, `ModuleEntry`,
`ModuleTaskDeclaration`, `ScheduleJob`, `JobSummary` et les états de tâche.
`@orkobi/sdk-core` expose `ModuleTaskHandler`, `ModuleTaskExecution`, `TaskSignal`
et le contrat `ModuleJobService`. Les handlers officiels conservent leur contrat
asynchrone `ModuleTaskHandler`. Les extensions externes utilisent le contrat
**synchrone** `PluginHandler`/`PluginSdk`, implémenté par le pont isolé de Phase 4 :
identité, permissions, CRUD et jobs bornés au plugin et au contexte autorisé.
Voir [PHASE_4.md](PHASE_4.md) pour les signatures, l’installation et l’exemple externe.
Les plugins importent uniquement les types du SDK ; leurs imports runtime ne sont
pas résolus dans le moteur isolé. Le frontend est déclaratif, rendu par l’hôte.

`pnpm sdk:pack` fournit les quatre archives versionnées et leurs empreintes,
`pnpm sdk:test` vérifie leur consommation hors workspace. Aucune publication
sur un registre externe n’est effectuée. Les packages restent privés et expérimentaux.

## Distribution par le Store (Phase 6)

Le [Store](PHASE_6.md) distribue les mêmes paquets API 1 depuis des catalogues signés.
Le SDK guest garde son périmètre sans réseau, fichiers, SQL ou API administrateur.
Les nouveaux DTO de catalogue/revue et les comparateurs de version sont dans les
contrats publics ; ils n'accordent aucun accès Store au plugin. Les archives locales
SDK restent distinctes d'une publication npm, et le Store ne les publie pas.
