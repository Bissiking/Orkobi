# Phase 2 — modules, capabilities et données isolées

Version produit : **0.2.0-EXP**. Les sections 2.1 à 2.4 de la roadmap correspondent
à cette livraison locale ; ce n'est ni une publication stable ni une autorisation de
déploiement. La Phase 1 reste le socle : installation, identité, organisations,
délégation et administration (voir [PHASE_1.md](PHASE_1.md)).

## Ce qui change par rapport à la 0.1.0-EXP

- Un **Module Manager** décrit, synchronise et active des modules par organisation.
- Un **Capability Registry** décrit honnêtement ce que sait faire l'instance.
- Un **Data Access Manager** borne l'accès SQL des modules à leurs tables et à
  leur organisation.
- Un **premier module officiel**, `orkobi.demo`, illustre le cycle complet :
  manifeste → activation → données isolées → désactivation sans perte.

La version du Core (`apps/core/src/version.ts`) sert de référence de compatibilité
pour les manifestes. Le bundle produit suit la même version (`0.2.0-EXP`).

## Mise à niveau

Les migrations `0003_modules` et `0004_module_demo` s'ajoutent à l'historique
`0001_core_schema` et `0002_platform`, sans modifier leur SQL ni leur empreinte.
Elles créent :

- `orkobi_core.modules` et `orkobi_core.organization_modules` ;
- le schéma `orkobi_demo` et la table `orkobi_demo.notes` ;
- l'extension de la contrainte de permissions aux permissions de module ;
- les permissions `modules:read`/`modules:write` sur les rôles administrateurs
  existants, `modules:read` sur les rôles membres, et `demo:read`/`demo:write`
  sur les rôles administrateurs.

Comme pour la Phase 1 : sauvegarder les données avant une mise à niveau d'une
instance utilisée. Aucun downgrade ni réinitialisation automatique n'est fourni.

## Module Manager

Le manifeste standard (`lib/contracts/src/modules.ts`) décrit un module par son
identité (`id`, `version`, `name`, `description`), sa plage de compatibilité Core,
ses dépendances, ses capabilities, ses permissions et ses entités de données.
Le validateur `isModuleManifest` refuse tout manifeste invalide ; un manifeste
n'accorde aucun droit par lui-même.

Le registre (`orkobi_core.modules`) est synchronisé à la volée depuis les
manifestes officiels embarqués dans le Core (`officialModules`) à chaque
opération modules. L'upsert conserve l'état d'activation existant. La compatibilité
de version utilise une plage SemVer minimale (`>=X.Y.Z[-pre] <A.B.C`, voir
`apps/core/src/modules/range.ts`) ; une préversion est strictement inférieure à la
version finale correspondante.

L'activation se fait en deux niveaux :

1. **Plateforme** (`POST /platform/admin/modules/:id`, administrateurs plateforme
   uniquement) : rend le module utilisable. Désactivé par défaut. Un refus 409
   survient si une organisation l'utilise encore ou si un module dépendant est actif.
2. **Organisation** (`POST /platform/modules/:id/activate`, permission
   `modules:write`) : active le module pour l'organisation courante. Le Core refuse
   si le module est désactivé au niveau plateforme, si une capability obligatoire
   est indisponible, si la version du Core est incompatible ou si une dépendance
   n'est pas active dans l'organisation.

La désactivation d'une organisation refuse si un module actif en dépend. Les
données de module ne sont jamais supprimées par une désactivation, plateforme ou
organisation.

## Capability Registry

Une capability décrit une fonctionnalité réelle du Core ; ce n'est ni une
permission ni un droit. Le catalogue officiel (`GET /platform/capabilities`) :

| Capability           | Disponibilité | Description courte                                                                   |
| -------------------- | ------------- | ------------------------------------------------------------------------------------ |
| `core.identity`      | available     | Comptes, sessions et connexions locales                                              |
| `core.organizations` | available     | Organisations et appartenances                                                       |
| `core.permissions`   | available     | Rôles et autorisations par organisation                                              |
| `core.audit`         | available     | Journal des opérations sensibles                                                     |
| `core.modules`       | available     | Registre des modules et activation par organisation                                  |
| `core.data.sql`      | limited       | Accès SQL des modules, borné tables + organisation (isolation applicative, sans RLS) |
| `core.identity.oidc` | unavailable   | Connexions OIDC externes (modèle préparé)                                            |
| `core.events`        | unavailable   | Bus d'événements entre modules (non implémenté)                                      |

`available` et `limited` satisfont une exigence obligatoire de manifeste ;
`unavailable` la refuse. Les exigences facultatives n'empêchent jamais
l'activation. Sans base prête, tout devient `unavailable`.

## Data Access Manager

L'adaptateur `PostgreSqlModuleAdapter` (`lib/database/src/adapter.ts`) exécute les
requêtes d'un module dans une transaction PostgreSQL réelle avec :

- `SET LOCAL lock_timeout = '2s'` ;
- le contexte d'organisation posé par le Core via
  `set_config('orkobi.organization_id', …, true)`, jamais par le module.

Chaque instruction est validée applicativement (`validateModuleStatement`) dans
un sous-ensemble SQL fermé : SELECT, INSERT, UPDATE ou DELETE sur une seule table
détenue, avec valeurs liées et conditions d'égalité reliées par AND. Les jointures,
sous-requêtes, commentaires et expressions libres sont refusés. Le filtre
`organization_id` est obligatoire et sa valeur liée doit correspondre au contexte
fourni par le Core ; une mise à jour ne peut pas changer cette colonne. Les schémas
`orkobi_core` et `orkobi_infrastructure` sont toujours interdits. Un refus lève
`ModuleDataError` dont le message public ne contient aucun détail SQL.

Les routes de données réutilisent la transaction d'autorisation pour les notes et
leur audit : si l'audit échoue, toute l'écriture est annulée. Elles vérifient aussi
que l'organisation est toujours active, même pour une session déjà ouverte.

Les migrations d'un module sont déclarées avec leur identifiant de module
(`migrationsForModule`) ; elles suivent les mêmes règles append-only que les
migrations du Core. Les tables d'un module vivent dans un schéma préfixé
`orkobi_` qui lui appartient.

## Module officiel orkobi.demo

Le module `orkobi.demo` (`modules/demo`) est le premier module officiel, livré
pour démontrer le cycle complet. Il déclare :

- une entité `notes` (`orkobi_demo.notes`) avec les champs `title` (requis,
  120 caractères max) et `content` (4000 caractères max) ;
- les permissions `demo:read` et `demo:write` ;
- les capabilities obligatoires `core.identity`, `core.permissions`,
  `core.modules` et `core.data.sql`, et la capability facultative `core.audit` ;
- aucune dépendance.

Côté interface : la page `/modules` affiche le catalogue, l'état réel du registre
et l'activation par organisation (permission `modules:write`) ; la page
`/modules/demo` permet de consulter, créer, modifier et supprimer des notes
(`demo:read`/`demo:write`) pour l'organisation active.

## Routes ajoutées

| Route                                 | Méthode  | Droit requis                            |
| ------------------------------------- | -------- | --------------------------------------- |
| `/platform/capabilities`              | GET      | session                                 |
| `/platform/modules`                   | GET      | `modules:read`                          |
| `/platform/modules/:id/activate`      | POST     | `modules:write`                         |
| `/platform/modules/:id/deactivate`    | POST     | `modules:write`                         |
| `/platform/modules/:entity` (données) | GET/POST | `demo:read`/`demo:write` selon l'entité |
| `/platform/admin/modules`             | GET      | administrateur plateforme               |
| `/platform/admin/modules/:id`         | POST     | administrateur plateforme               |

Toutes exigent une organisation active sauf capabilities et administration.
Le BFF relaie ces routes selon le même modèle que la Phase 1 ; `features.modules`
du bootstrap n'est `available` que si la base et le registre sont prêts.

## Audit

Les opérations de module sont journalisées : `module.enabled`,
`module.disabled`, `module.organization_activated`,
`module.organization_deactivated`, et par entité
`module.<module>.<entité>.created|updated|deleted`. Aucun contenu de note ni
secret n'apparaît dans l'audit ni dans les journaux.

## Tests

- `tests/modules.test.mjs` : plages de version, manifeste démo,
  `validateModuleStatement` (refus multi-instructions, tables étrangères,
  schémas non détenus, `organization_id` manquant ou lié à une autre organisation,
  index de paramètres), capabilities facultatives et manifestes incohérents.
- `tests/modules.integration.mjs` (base PostgreSQL réelle, via
  `pnpm infra:test` ou le service Compose `test-db`) : catalogue de capabilities,
  registre administrateur, cycle d'activation plateforme → organisation, création
  /lecture/mise à jour de notes avec validation, isolation entre deux
  organisations, refus pour un rôle membre, conservation des données après
  désactivation, blocage de la désactivation plateforme tant qu'une organisation
  est active, suppression auditée, refus pour une organisation suspendue, rollback
  réel de l'adaptateur, lecture seule et annulation des écritures si l'audit échoue.

## Limites assumées

- L'isolation des données de module est **applicative** : contrôle des tables
  détenues, paramètres liés et filtre `organization_id`, sans RLS PostgreSQL.
  La capacité `core.data.sql` est donc annoncée `limited`.
- Les modules tiers ne sont pas encore supportés : seuls les manifestes
  embarqués dans le Core sont synchronisés (Phase 4 pour les plugins externes).
- Le bus d'événements entre modules (`core.events`) et l'OIDC
  (`core.identity.oidc`) restent indisponibles.
- Aucune interface d'installation de module depuis un fichier ou un dépôt ;
  l'activation se fait sur le registre embarqué.
