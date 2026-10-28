<!-- DOCS/ARCHITECTURE.md -->
# Architecture des fondations

## Responsabilités

Le futur **Core** sera l'autorité : identité vérifiée, organisation active,
permissions, orchestration et accès aux ressources. NestJS est prévu pour son
implémentation, sans dépendance NestJS dans les contrats.

**`lib/`** regroupe les mécanismes internes. Le package `contracts` n'accède à
aucune base. `identity` décrit les appartenances et la paire OIDC `issuer/subject`,
sans authentification. `security` évalue des rôles fournis par une source de
confiance. `database` décrit le travail transactionnel futur. `events` décrit un
transport futur, sans imposer de broker.

**`sdk/`** expose des types sélectionnés et les interfaces d'une façade liée à
une organisation. Il ne réexporte ni SQL, ni transaction, ni données OIDC internes.
La façade n'a pas encore d'implémentation : le futur Core la fournira aux modules.

Les **modules** porteront les fonctionnalités métier. Aucun chargeur dynamique,
registre de capabilities ou Store n'est construit par ce bootstrap.

## Dépendances

```text
contracts ← identity ← security
    ↑──────────────────────┘
    ├──── database
    ├──── events
    └──── sdk-types ← sdk-core
```

Les flèches vont du consommateur vers sa dépendance. Toutes les dépendances internes
utilisent `workspace:*`. Les packages applicatifs futurs peuvent consommer `lib/` ;
les modules doivent consommer les contrats publics du SDK.
Le SDK dépend des types neutres de `contracts`, jamais d'un pilote ou framework.

## Organisation et autorisation

`OrganizationContext` porte un utilisateur et une organisation ; le futur Core
doit établir ce contexte à partir de son authentification. Un objet TypeScript
fourni par un appelant ne prouve aucune identité ni autorisation.

`evaluateAuthorization` exige une appartenance active pour cet utilisateur dans
cette organisation, puis un rôle attribué de cette même organisation et une
permission exactement égale. Aucun wildcard ou rôle administrateur implicite.
Les utilisateurs et organisations désactivés devront être rejetés par le Core
avant cette évaluation. Les rôles et appartenances ne doivent jamais provenir
directement d'un module ou d'un client non fiable.

Les identifiants sont des chaînes marquées par catégorie pour éviter les confusions
à la compilation. `createId` valide seulement une valeur non vide sans espaces
périphériques. Le futur émetteur d'identifiants devra garantir leur unicité et les
contraintes en base ; aucun générateur ou stockage n'est simulé.

## Données et événements

L'accès SQL brut appartient exclusivement à `lib/database`. Une transaction reçoit
obligatoirement un contexte et fournit des requêtes paramétrées. L'adaptateur devra
appliquer réellement l'isolation par organisation, les commits et les rollbacks.
L'interface `PostgreSqlAdapter` prépare ce point d'extension sans ouvrir de connexion.
Le type générique des lignes ne remplace pas une validation des résultats SQL.

Les événements portent un identifiant, une version, une organisation, un module
source et une date. Le futur transport devra vérifier le contexte, les droits et
la correspondance d'organisation à la publication comme à la réception. Livraison,
ordre, retries, outbox et persistance restent à définir.

## Choix techniques

ESM est conservé avec `type: module`, `NodeNext` et une cible explicite ES2022.
Les exports n'autorisent que le point d'entrée public. Un seul artefact ESM est
produit ; `import()` et le chargement synchrone `require()` des modules actuels
ont été vérifiés sous Node 22.22.2. Il n'y a pas de compilation CommonJS distincte.
L'ajout futur d'un await au niveau module imposerait de réexaminer `require()`.

La configuration stricte commune ajoute les vérifications d'accès indexés, des
propriétés optionnelles et des imports de types. Le compilateur vérifie aussi les
déclarations des dépendances (`skipLibCheck` n'est pas activé).

TypeScript 6.0.3 remplace 7.0.2, incompatible avec les peer dependencies du linter
disponible. Les versions des outils sont exactes et le lockfile est versionné.
Les tests reposent sur `node:test`, sans framework ni dépendance d'exécution externe.

Références : [packages et exports Node.js](https://nodejs.org/api/packages.html)
et [mode NodeNext de TypeScript](https://www.typescriptlang.org/tsconfig/module.html).

## Frontières réelles

Les interfaces et les exports de packages organisent le code mais ne constituent
pas une frontière d'exécution. Un module exécuté dans le même processus peut
accéder aux ressources du processus. L'isolation des plugins tiers, la validation
des entrées, l'authentification et les contrôles aux points d'accès restent à réaliser.
