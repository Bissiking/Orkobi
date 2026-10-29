# Infrastructure — étape technique 0.4

La version produit reste **0.1.0-EXP**. Ce lot fournit PostgreSQL, les migrations,
la pile Docker Compose locale et des contrôles de disponibilité. Il ne fournit
pas encore l'assistant d'installation, les comptes utilisateurs, les données
métier ou l'isolation des organisations prévus dans les phases suivantes.

## Installer et démarrer

Prérequis : Docker Engine avec Compose v2 et conteneurs Linux (Docker Desktop
sous Windows), Node.js >= 22.22.2 et pnpm 12.16.1. Le premier build nécessite
un accès au registre pnpm et aux images officielles Docker.

Depuis la racine :

```sh
pnpm install --frozen-lockfile
pnpm infra:init
pnpm infra:up
```

`infra:init` crée `.env` à partir de `.env.example`, avec trois secrets aléatoires
distincts. Il refuse d'écraser un fichier existant. Si `.env` existe déjà, ajouter
les variables manquantes du modèle et générer chaque mot de passe séparément,
par exemple avec `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Ne pas commiter `.env`. Les secrets sont requis par Compose, sans mot de passe
partagé par défaut. Ne pas afficher `docker compose config` dans un journal partagé :
sa sortie complète contient l'environnement résolu.

Ouvrir **http://127.0.0.1:3000**. `BFF_PUBLISHED_PORT` permet de changer le port
local si nécessaire. Le BFF sert le build React, y compris les liens directs
comme `/settings`. Vite n'est pas démarré dans Compose.

```sh
docker compose ps -a
docker compose logs --tail=50 migrate core bff
pnpm infra:down
```

`infra:down` retire les conteneurs et le réseau en conservant le volume nommé.
Relancer `infra:up` reprend les données. `docker compose restart core bff`
redémarre les processus, mais n'applique pas de nouvelles migrations et ne
reconstruit pas les images. Après une mise à jour du code, utiliser `infra:up`.

## Services, réseau et stockage

| Service    | Fonction                                          | Condition de démarrage / santé      |
| ---------- | ------------------------------------------------- | ----------------------------------- |
| `postgres` | PostgreSQL 18, volume `postgres_data`             | `pg_isready`                        |
| `migrate`  | Migration ponctuelle, arrêt avec code 0 si succès | PostgreSQL sain                     |
| `core`     | Core NestJS, pool SQL fermé à l'arrêt             | Migration réussie ; `/health/ready` |
| `bff`      | BFF NestJS et React compilé                       | Core sain ; `/api/ready`            |

Seul le BFF est publié, sur loopback. Core et PostgreSQL restent accessibles
sur le réseau interne Compose. Aucun Redis, NoSQL, Store ou service cloud
n'est nécessaire. Le volume PostgreSQL 18 est monté sur `/var/lib/postgresql`,
conformément à [l'image officielle PostgreSQL](https://hub.docker.com/_/postgres).
Un changement de version majeure PostgreSQL nécessite une procédure de migration
explicite ; ne pas simplement modifier le tag d'image sur un volume existant.

Les applications sont exécutées par l'utilisateur `node`, avec un processus init
pour propager les signaux. Le Dockerfile compile dans une étape de build puis
copie le monorepo et ses liens workspace dans l'image d'exécution. Cette première
image locale contient encore les outils de développement installés au build.
Les tags de base suivent Node 22 et PostgreSQL 18 ; les dépendances pnpm sont
figées par le lockfile. Une publication immuable avec digests reste une étape
de distribution, selon [VERSIONING.md](VERSIONING.md).

## Configuration SQL et comptes

| Variable                | Défaut / obligation                  | Usage                                              |
| ----------------------- | ------------------------------------ | -------------------------------------------------- |
| `DB_ENABLED`            | `false` hors Compose                 | Active le pool SQL du Core ; Compose impose `true` |
| `DB_HOST`               | `127.0.0.1`                          | Compose impose `postgres`                          |
| `DB_PORT`               | `5432`                               | Port SQL, pas un port exposé par défaut            |
| `DB_NAME`               | `orkobi`                             | Nom de la base, commun à tous les services         |
| `DB_USER`               | `orkobi_app`                         | Compte d'exécution du Core                         |
| `DB_PASSWORD`           | Requis si SQL activé et dans Compose | Secret du compte Core                              |
| `MIGRATION_DB_USER`     | `orkobi_migrator`                    | Compte de migration                                |
| `MIGRATION_DB_PASSWORD` | Requis pour migrer et dans Compose   | Secret du compte migration                         |
| `POSTGRES_PASSWORD`     | Requis dans Compose                  | Secret du compte d'administration PostgreSQL       |

Compose fixe les deux noms de comptes `orkobi_app` et `orkobi_migrator`.
Le script `infra/postgres/init.sh` les crée uniquement lors de l'initialisation
d'un volume vide. Le Core ne reçoit ni le secret administrateur ni celui du
migrateur. Le compte Core peut lire le registre des migrations ; il ne peut
créer de schéma/table ni modifier ce registre. Le migrateur possède les schémas
qu'il crée et n'est ni superutilisateur, ni créateur de rôles ou de bases.

Changer les secrets dans `.env` ne change pas les mots de passe d'un volume déjà
initialisé. Effectuer une rotation SQL avec le compte administrateur puis adapter
`.env` et recréer les services concernés. Ne pas supprimer les données pour
contourner un problème d'identifiants. Les connexions de ce socle local utilisent
le réseau privé Docker ou loopback, sans TLS SQL ; un hôte distant exige une
extension de configuration TLS avant utilisation.

Pour utiliser Vite et les serveurs sur l'hôte avec PostgreSQL Docker :

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d --wait postgres
pnpm db:migrate
pnpm dev
```

Dans `.env`, renseigner les secrets, `DB_ENABLED=true`, `DB_HOST=127.0.0.1`,
`DB_PORT=5432` (ou le port local choisi), les noms de comptes indiqués ci-dessus.
L'override publie SQL uniquement sur loopback. Ne pas lancer en même temps le
BFF Compose et le BFF de développement sur le même port.

## Migrations

`lib/database/src/migrations.ts` contient la liste ordonnée des migrations SQL
internes, distincte de la version produit. La première crée seulement le schéma
`orkobi_core` ; elle ne crée pas de faux utilisateur ou d'organisation.
Le registre `orkobi_infrastructure.schema_migrations` conserve l'identifiant,
l'empreinte SHA-256 du SQL et la date d'application.

- Ajouter une migration avec un nouvel identifiant croissant `NNNN_nom`.
- Ne jamais modifier ou retirer une migration appliquée. Une empreinte modifiée,
  une migration manquante ou un historique plus récent bloque le runner.
- Le runner verrouille la transaction avec `pg_advisory_xact_lock` et applique
  tout le lot dans la même transaction. Le DDL et les entrées du registre sont
  annulés ensemble si une instruction échoue. Relancer un lot réussi ne rejoue
  aucune migration.
- Les migrations doivent être transactionnelles et ne doivent contenir ni
  contrôle de transaction explicite ni opération PostgreSQL incompatible avec
  une transaction, comme `CREATE INDEX CONCURRENTLY`.
- Le verrou attend au maximum 10 secondes et une instruction au maximum
  15 secondes. Une migration plus longue exige une évolution explicite du runner.
- Aucun rollback destructeur ou downgrade automatique n'est fourni. Préférer
  une migration corrective additive ; sauvegarder avant une évolution des données.

Le service `migrate` s'exécute avant le Core. Une erreur le fait sortir avec
un code non nul et bloque le démarrage des applications. Le Core ne migre jamais
implicitement avec son compte d'exécution.

```sh
# Pile Compose existante
docker compose run --rm migrate
docker compose exec core node scripts/database.mjs status

# SQL accessible depuis l'hôte, après configuration du .env
pnpm db:migrate
pnpm db:status
```

Les erreurs CLI sont expurgées : elles ne montrent pas les secrets, les chaînes
de connexion ou les exceptions brutes. Examiner séparément l'état PostgreSQL,
les droits et l'historique en cas d'échec. Ne pas corriger une empreinte à la main
sur une base utilisée pour faire passer un contrôle.

## Vitalité et disponibilité

`/health` du Core et `/api/health` du BFF restent des sondes de vitalité HTTP.
Elles restent vertes pendant une panne SQL. Le bootstrap frontend conserve ce
contrat et n'annonce toujours aucun service métier disponible.

`/health/ready` du Core retourne 200 uniquement si PostgreSQL répond et si le
registre correspond exactement aux migrations attendues ; sinon 503 avec le
contrat d'erreur public habituel. SQL désactivé signifie également 503.
Le pool attend au maximum deux secondes une connexion et PostgreSQL limite les
instructions de readiness à deux secondes. `/api/ready` du BFF vérifie cette
sonde Core avec le client HTTP borné existant ; il renvoie également 503 en cas
d'indisponibilité. Aucune sonde n'expose d'identifiant SQL ou de détail d'erreur.

Les healthchecks Compose utilisent ces sondes de disponibilité et le BFF teste
donc la chaîne BFF → Core → SQL. Les dépendances Compose ordonnent le démarrage ;
un état `unhealthy` ultérieur ne redémarre pas automatiquement un conteneur.
Après le retour de PostgreSQL, les pools se reconnectent à la requête suivante.
La politique `unless-stopped` couvre les processus qui quittent et le redémarrage
du moteur Docker, sous réserve qu'ils n'aient pas été arrêtés explicitement.

## Sauvegarde et restauration

Créer un répertoire privé de sauvegarde hors Git. Pour éviter les transformations
de flux binaires selon le shell Windows, produire le dump dans le conteneur puis
le copier sur l'hôte :

```sh
docker compose exec -T postgres pg_dump -U postgres -d orkobi -Fc -f /tmp/orkobi.dump
docker compose cp postgres:/tmp/orkobi.dump ./orkobi.dump
```

Adapter le nom de base à `DB_NAME`, protéger le dump et le déplacer vers un
stockage de sauvegarde privé. Le dump peut contenir des données sensibles.
Une restauration doit d'abord être vérifiée sur une base séparée : provisionner
les rôles nécessaires, copier le dump avec `docker compose cp`, puis utiliser
`pg_restore --exit-on-error` avec le compte administrateur et la base cible
explicitement choisie. Ne pas employer `--clean` sur une base utilisée sans
validation destructive. Les rôles et leurs secrets ne sont pas inclus dans
`pg_dump` et doivent être sauvegardés/provisionnés séparément.

Le test de persistance ci-dessous ne remplace pas une restauration de sauvegarde.
Une stratégie de sauvegarde/restauration de production reste à valider avant BETA/STABLE.

## Recette reproductible et limites

```sh
pnpm check
pnpm typecheck
pnpm infra:test
```

`infra:test` construit l'image et crée un projet Compose aléatoire
`orkobi-verify-<id>`, une base `orkobi_verify_<id>`, des secrets temporaires et un
port BFF libre. Il ne se connecte pas à une base opérateur. La suite SQL refuse
un nom de base ne correspondant pas à cette convention. Elle vérifie les
migrations concurrentes, le rejeu sans changement, le rollback DDL/registre,
la dérive d'empreinte, un historique futur et les droits du compte Core.

La recette exerce ensuite HTTP, les routes React directes, une panne et reprise
SQL, le redémarrage Core/BFF puis `down`/`up` complet avec une donnée témoin
persistante. Elle retire les conteneurs et le fichier de secrets après exécution.
Le résultat est enregistré dans `output/infrastructure/<id>/result.json`, ignoré
par Git. Le volume de test est conservé et son nom est affiché ; sa suppression
éventuelle est une opération destructive à décider explicitement.

La pile cible une installation locale de développement/évaluation. TLS public,
authentification, accès SQL métier contextualisé, RLS, isolation multi-organisation,
isolation des plugins, CI distante et déploiement de production restent hors de
ce lot. Les interfaces `DatabaseAdapter` et `PostgreSqlAdapter` ne sont pas
encore implémentées : aucun accès SQL métier n'est ajouté au SDK.

Références : [pool node-postgres](https://node-postgres.com/apis/pool),
[verrous PostgreSQL](https://www.postgresql.org/docs/18/explicit-locking.html),
[ordre de démarrage Compose](https://docs.docker.com/compose/how-tos/startup-order/).
