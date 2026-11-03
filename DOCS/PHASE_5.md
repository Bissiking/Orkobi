# Phase 5 — Compatibilité SQL et services avancés

Version produit : **0.3.0-dev.1**. PostgreSQL reste le moteur de référence.
Cette phase fournit deux moteurs alternatifs du Core, le diagnostic administrateur
et des décisions documentées sur les services facultatifs. Voir les
[preuves de validation](REVIEW_PHASE_5.md) et les [études de services](SERVICES_ADVANCED.md).

## Choisir un moteur

| Propriété                                   | PostgreSQL 18           | MariaDB 11.4 LTS        | MySQL 8.4 LTS           |
| ------------------------------------------- | ----------------------- | ----------------------- | ----------------------- |
| Comptes, organisations, rôles et audit      | Oui                     | Oui                     | Oui                     |
| MFA, OIDC, intégrations                     | Oui                     | Oui                     | Oui                     |
| Modules, plugins déclaratifs et données SDK | Oui                     | Oui                     | Oui                     |
| File durable et verrous interprocessus      | Advisory locks          | GET_LOCK                | GET_LOCK                |
| Espaces de noms                             | Schémas `orkobi_core.*` | Tables `orkobi_core__*` | Tables `orkobi_core__*` |
| JSON                                        | JSONB natif             | Texte validé JSON       | JSON natif              |
| Tableaux de permissions/scopes              | Tableaux SQL            | JSON validé             | JSON validé             |
| DDL transactionnel                          | Oui                     | Non                     | Non                     |

`DB_ENGINE=postgresql|mariadb|mysql` sélectionne `createDatabase()` dans
`lib/database`. Sans variable, PostgreSQL reste le choix historique. Les ports
par défaut sont 5432 et 3306. MySQL/MariaDB vérifient le produit serveur et sa
branche prise en charge ; une autre branche ou un moteur incohérent reste non prêt
et le migrateur refuse de travailler. Le nom historique `PostgreSqlConfig` est
conservé pour les consommateurs internes ; `SqlDatabaseConfig` est son alias commun.

Les mêmes `PlatformRepository` et `JobRepository` servent les trois moteurs.
`mysql.ts` compile uniquement le catalogue de requêtes privées du Core et le CRUD
fermé validé des modules officiels. Ce n’est pas un traducteur SQL général.
Les tiers restent sur le pont SDK, sans SQL, pilote, connexion ou migration DDL.
Les valeurs restent liées ; dates transmises explicitement comme `Date`, JSON
sérialisé et dates de résultat normalisées en UTC. Un texte ressemblant à une date
reste du texte. Les upserts de rôles préservent la cible par identifiant : une
collision de nom ne modifie jamais un autre rôle.

## Installation distincte

La pile existante `compose.yaml` reste PostgreSQL. Pour préparer une nouvelle
instance alternative, sans remplacer `.env` ni les secrets existants :

```sh
pnpm infra:init --engine=mariadb
# Produit .env.mariadb avec des secrets hexadécimaux aléatoires.
# Ajuster BFF_PUBLISHED_PORT si une autre instance utilise déjà le port 3000.
docker compose --env-file .env.mariadb -f compose.mysql.yaml config --quiet
# À lancer explicitement pour installer cette nouvelle instance :
docker compose --env-file .env.mariadb -f compose.mysql.yaml up --build --wait
```

Pour MySQL : `pnpm infra:init --engine=mysql`, puis `.env.mysql` dans les commandes.
`SQL_IMAGE` vaut respectivement `mariadb:11.4` ou `mysql:8.4`.
Les projets `orkobi-mariadb` et `orkobi-mysql` possèdent chacun leur volume `sql_data`.
Le fichier alternatif se lance seul, sans superposer le Compose PostgreSQL.
La base n’expose aucun port SQL sur l’hôte ; seul le BFF écoute sur loopback.
Le bootstrap crée `orkobi_migrator` avec les droits de schéma et de délégation sur
cette seule base, puis `orkobi_app` sans DDL. Les mots de passe d’initialisation
MariaDB/MySQL doivent être hexadécimaux d’au moins 32 caractères, comme ceux du générateur.
Les variables d’initialisation ne changent pas les utilisateurs d’un volume déjà initialisé.

Le service `migrate` précède le Core. Ne pas utiliser le compte migrateur pour HTTP.
Aucun `SUPER`, réglage global de confiance des fonctions ou arrêt du journal binaire
n’est nécessaire aux migrations. Ces fichiers décrivent une pile locale ; TLS,
sauvegardes et exposition publique doivent être établis pour le déploiement choisi.

Pour une base alternative déjà provisionnée, configurer les mêmes variables et
`DB_HOST`/`DB_PORT` adaptés, puis employer `pnpm db:migrate` et `pnpm db:status` avec
son environnement. Ces commandes locales lisent `.env` par défaut ; pour une autre
configuration, charger explicitement ses variables avant de lancer le script ou
utiliser `docker compose --env-file … -f compose.mysql.yaml run --rm migrate`.
`db:status` retourne readiness et profil SQL sans chaîne de connexion ni secret.

Changer `DB_ENGINE` n’effectue **aucune conversion de données**. Ne pas monter un
volume PostgreSQL dans un serveur MySQL/MariaDB, ni réutiliser un volume entre ces
deux derniers. Aucun outil d’import inter-moteurs n’est livré.

## Migrations et panne DDL

Les migrations PostgreSQL 0001–0009 et leurs checksums sont conservés. Les deux
moteurs alternatifs possèdent un catalogue natif `mysql-migrations.ts`, neuf lots
logiques correspondants, un historique et des checksums propres. Chaque évolution
future doit ajouter une migration sur chaque catalogue concerné et sa recette.
Ne jamais modifier un SQL déjà livré/appliqué pour réparer une base.

MySQL et MariaDB réalisent des commits implicites pour de nombreuses opérations
DDL. Le migrateur prend un verrou exclusif de session, écrit durablement l’état
`applying` **avant** le lot, applique ses instructions, puis marque `applied`.
Une interruption laisse le lot incomplet visible. Readiness et migrations refusent
un journal partiel, inconnu, altéré, ou provenant d’un autre moteur. Le migrateur
ne répare ni n’efface ce journal automatiquement.

Face à `applying` : arrêter les tentatives de mise à niveau, conserver la base et
le journal, identifier les instructions réellement effectuées avec un compte
administrateur, puis restaurer une sauvegarde cohérente ou préparer une réparation
explicite vérifiée sur une copie. Ne pas simplement supprimer la ligne pour relancer
un DDL non idempotent. Les recettes ne réparent que leurs propres fixtures jetables.
Les transactions de **données** conservent commit/rollback et lecture seule sur InnoDB.

Références primaires : [commits implicites MySQL](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html),
[commits implicites MariaDB](https://mariadb.com/docs/server/reference/sql-statements/transactions/sql-statements-that-cause-an-implicit-commit),
[JSON MariaDB](https://mariadb.com/docs/server/reference/data-types/string-data-types/json).
Les permissions JSON sont vérifiées en base par `JSON_SCHEMA_VALID` et dans le Core.

## Exigences et capabilities

| Capability obligatoire       | PostgreSQL | MariaDB      | MySQL        |
| ---------------------------- | ---------- | ------------ | ------------ |
| `core.sql.arrays`            | disponible | indisponible | indisponible |
| `core.sql.json` (type natif) | disponible | indisponible | disponible   |
| `core.sql.transactionalddl`  | disponible | indisponible | indisponible |
| `core.data.sql`              | limitée    | limitée      | limitée      |

Ces états dépendent aussi de la readiness. La capacité JSON native absente ne bloque
pas les CRUD SDK ordinaires sous MariaDB. Les plugins portables n’ont pas à la
réclamer : leur stockage JSON validé fonctionne sur les trois moteurs.
Une exigence obligatoire indisponible bloque l’activation ; une exigence facultative
ne la bloque pas. Une capability ne confère jamais un droit et ne permet aucun DDL
au plugin. Une extension ne doit jamais déduire ses droits du nom du moteur.

## Diagnostic et supervision

`GET /api/platform/admin/runtime` via BFF exige une session d’administrateur
plateforme courant ; un utilisateur ordinaire reçoit 403. La réponse comprend :

- `database` : moteur, version cible, JSON/tableaux natifs et DDL transactionnel ;
- `system` : instant de mesure, uptime, mémoire RSS/heap et retard de boucle moyen/p99 ;
- `system.http` : requêtes, erreurs 5xx, durée moyenne et cinq classes de durée ;
- `jobs` et `cache` : état et compteurs des services existants.

Les classes HTTP sont disjointes : ≤50, ≤200, ≤1000, ≤4000 ms et au-delà.
Compteurs depuis le démarrage, propres au processus Core ; aucune agrégation de
cluster, persistance de séries, alerte automatique ou export Prometheus n’est annoncée.
Les métriques n’ont aucun label de route, utilisateur ou organisation, ni secret,
hôte SQL, argument de processus ou variable d’environnement. Les mesures sont bornées.

L’écran `/system` affiche les mesures et les limites aux administrateurs, avec
actualisation explicite, erreur/reprise, FR/EN et thèmes. Les sondes publiques restent
minimales : vitalité distincte de readiness. Si SQL est arrêté, l’authentification
administrative dépend aussi de SQL : utiliser les sondes, `db:status` et les logs
structurés de l’instance, sans contourner l’authentification pour obtenir les métriques.

## Recette et reprise par une IA

```sh
pnpm check
pnpm typecheck
pnpm infra:test     # PostgreSQL + Redis, projet isolé
pnpm sql:test       # MariaDB puis MySQL, projets/volumes isolés
pnpm sdk:test
```

`sql:test` n’expose aucun port de base sur l’hôte. Il vérifie aussi `compose.mysql.yaml` pour chaque moteur : HTTP, panne SQL,
serveur suspendu sans réponse et récupération après timeout,
redémarrage, recréation et persistance. Il conserve les volumes de preuve,
supprime ses conteneurs/réseau et son fichier de secrets temporaire. Les sorties
ignorées Git sont dans `output/sql-engines/<id>/`. Ne pas employer la base existante
comme recette. Les suites métier communes utilisent un connecteur technique de test
pour les assertions SQL ; **Core/BFF utilisent les adaptateurs réellement livrés**.

Pour un nouveau prompt : lire ce guide, `AGENTS.md`, `PHASE_4.md`, `SDK.md` et
`UI_SDK.md`. Maintenir le refus par défaut, les transactions avec audit et les verrous
jusqu’à la fin effective d’un handler. Ajouter les exigences moteur au manifeste si
nécessaire. Ne pas introduire MongoDB, S3 ou Aion comme dépendance obligatoire :
leurs capabilities restent explicitement indisponibles tant qu’un fournisseur réel
et sa recette ne sont pas livrés. Ne pas modifier les migrations appliquées, publier
les SDK ni démarrer une pile utilisateur implicitement.
