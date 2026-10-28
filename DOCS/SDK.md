<!-- DOCS/SDK.md -->
# Conventions SDK — 0.1.0-EXP

Le SDK est expérimental, privé et susceptible d'évoluer. Il est indépendant de
NestJS et de PostgreSQL. Aucune API distante ni instance fonctionnelle du Core
n'est fournie par cette version.

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

| Notion | Convention | Sens |
| --- | --- | --- |
| Capability | `namespace.nom`, par exemple `core.identity` | Service technique disponible |
| Exigence | `{ key, required }` | Besoin obligatoire ou facultatif d'un module |
| Permission | `ressource:action`, par exemple `contacts:read` | Droit soumis à une autorisation dans une organisation |

Ces noms sont des conventions initiales. Les types vérifient la présence du
séparateur ; une validation runtime complète et le catalogue restent à construire.
Déclarer une permission ne l'accorde pas. La disponibilité d'une capability ne
confère aucun droit. Une exigence obligatoire absente devra empêcher l'activation
future du module, une exigence facultative pourra réduire ses fonctionnalités.

`sdk.permissions.can()` aide à adapter l'interface. Le Core devra revérifier les
droits lors de chaque opération pour gérer changements de rôle et révocations.
La façade actuelle propose des lectures d'identité, de permissions et de
capabilities ; elle n'expose aucun service SQL ou système et aucun chargeur de module.

## Organisation et compatibilité

Tous les services d'une façade sont liés au même contexte. La sélection d'une
autre organisation devra passer par le Core et produire une nouvelle façade
autorisée. Les détails OIDC et les rôles internes ne sont pas exposés.

Compiler les packages avant de les importer. Les exports produisent un module ESM
et des déclarations TypeScript. Pour un consommateur CommonJS, `import()` permet
de charger le module ; `require()` a aussi été vérifié sous Node 22.22.2 pour les
artefacts actuels, sans fournir un second build CommonJS.

Le SDK ne protège pas l'hôte contre du code tiers. Une frontière d'exécution
réelle sera nécessaire avant de promettre l'isolation des plugins externes.
