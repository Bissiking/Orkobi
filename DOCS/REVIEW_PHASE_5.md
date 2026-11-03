# Revue de Phase 5 — 3 novembre 2026

Périmètre : Orkobi **0.2.0-EXP**, compatibilité SQL et services avancés.
Les études NoSQL/S3/Aion sont des décisions documentées, distinctes de fournisseurs
opérationnels. Guides : [Phase 5](PHASE_5.md), [services avancés](SERVICES_ADVANCED.md).

## Changements revus

- `lib/database` : interface interne de connexion commune, factory selon `DB_ENGINE`,
  pilote mysql2 exact, dépôts plateforme/jobs partagés et migrations natives alternatives.
  Les migrations PostgreSQL 0001–0009 ne changent pas.
- Valeurs liées, UTC, JSON, booléens et résultats normalisés. Les textes ressemblant
  à des dates sont préservés. Le CRUD des modules reste un sous-ensemble validé et
  les plugins tiers gardent leur pont SDK sans SQL.
- Cible des upserts de rôles préservée face aux autres clés uniques. Contraintes
  de permissions JSON validées en base sans privilège global `SUPER`.
- Transactions de données, rollback si audit impossible et lecture seule réels.
  Sur MySQL, les commandes de transaction utilisent le protocole adapté ; les
  requêtes métier conservent les paramètres préparés.
- File durable partagée ; verrous de session jusqu’à fin réelle du handler,
  cancellation, reprise, retries et idempotence conservés.
- DDL non transactionnel explicitement journalisé avant application. Refus des
  lots partiels, checksums altérés, historiques et produits serveur incompatibles.
  Les sondes SQL et l’initialisation de connexion sont bornées ; une connexion
  échouée est détruite avant réutilisation.
- Capabilities propres aux moteurs et refus des exigences obligatoires absentes.
- Diagnostic administrateur : mémoire, boucle événementielle, HTTP, cache/jobs et
  profil moteur, sans secret ni label d’identité. UI FR/EN clair/sombre responsive.
- Préparation de secrets séparés par moteur, sans écrasement, pile alternative et
  recettes isolées. Sorties générées de preuve exclues de Git et des outils de style.

## Preuves locales

| Vérification               | Résultat                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`               | Format, lint, contrats et **80 tests unitaires** réussis                                                                               |
| `pnpm typecheck`           | Compilation et typage de tous les workspaces réussis                                                                                   |
| `pnpm infra:test`          | **66 tests** PostgreSQL/Redis, puis HTTP, panne SQL, serveur suspendu, redémarrage, recréation et persistance réussis                  |
| `pnpm sql:test`            | **66 tests par moteur**, puis piles alternatives HTTP, panne SQL, serveur suspendu, redémarrage, recréation et persistance réussis     |
| `pnpm sdk:test`            | Quatre archives produites ; imports ESM et types consommés hors workspace                                                              |
| `tests/browser/phase5.mjs` | Chrome headless réel, API synthétiques : diagnostic, moteurs, erreur/reprise, visibilité administrateur, FR/EN, clair/sombre et mobile |
| `git diff --check`         | Réussi                                                                                                                                 |

La recette SQL finale est conservée dans
`output/sql-engines/dd826004cb45/result.json`, avec les sorties `mariadb.log` et
`mysql.log` des suites métier. Les piles réelles utilisent les images MariaDB 11.4
et MySQL 8.4, sans désactiver le journal binaire pour obtenir les migrations.
Le script a terminé avec code 0 ; ses conteneurs/réseaux et fichier de secrets
temporaire ont été supprimés, ses quatre volumes dédiés conservés.

La recette PostgreSQL est conservée dans
`output/infrastructure/0ee981800688/result.json`. Les suites SQL communes vérifient
installation concurrente, sessions persistantes, isolation et droits, MFA et
récupération, OIDC avec fournisseur local synthétique signé, intégrations, CRUD et
rollback d’audit, plugins QuickJS/WASM, jobs concurrents et reprise.
Les nombres de tests comprennent les sous-tests et leurs groupes Node.

Pour les moteurs alternatifs, le même Core/BFF utilise le pilote livré. Seul le
connecteur des assertions SQL de test est adapté au moteur. La panne d’audit est
provoquée par retrait temporaire d’INSERT sur la table d’audit, uniquement dans la
base de recette, sans donner de privilège global au migrateur.
Les tests natifs vérifient aussi migration concurrente, changement de moteur,
collision de rôle, permission JSON invalide, checksum et DDL partiel.

Les suites complètes MariaDB et MySQL ont aussi passé dans
`output/sql-engines/0c4374bea8f3/result.json` avant extension de la recette aux
piles Compose réelles. La recette finale ajoute les sondes HTTP, une panne SQL,
un serveur SQL suspendu sans réponse (timeout/readiness puis récupération),
un redémarrage Core/BFF, une recréation des conteneurs et une donnée témoin persistée.
Ses volumes sont propres au projet aléatoire ; aucun volume utilisateur n’est réutilisé.

## Revue visuelle

Captures dans `output/playwright/phase5-*` : ordinateur 1440×1050 FR clair,
mobile 390×844 EN sombre et FR clair, avec trois profils SQL synthétiques.
Première inspection puis confirmation après correction de l’espacement du panneau
et des anciens libellés exclusivement PostgreSQL. Aucun débordement horizontal ni
erreur JavaScript constaté ; actualisation, erreur et reprise exercées.
Les composants utilisent le SDK UI et les tokens existants, sans bibliothèque CSS ajoutée.

Le détecteur Impeccable a émis douze avis de typographie dans les règles CSS
préexistantes, sans défaut bloquant sur l’ajout. La hiérarchie visuelle existante
est conservée ; aucune refonte typographique hors périmètre n’a été lancée.

## Limites explicites

- Validation locale Docker et Chrome ; aucun déploiement utilisateur, LXC, preuve
  de production, fournisseur OIDC réel ou publication de package.
- PostgreSQL reste la référence. MariaDB 11.4 et MySQL 8.4 sont les branches
  alternatives vérifiées ; aucune promesse pour d’autres versions/forks/clusters.
- Pas de conversion de données entre moteurs ; volumes et historiques distincts.
- DDL MySQL/MariaDB sans rollback global : un lot incomplet exige une restauration
  ou réparation explicite. Les transactions métier utilisent InnoDB.
- Isolation organisationnelle applicative dans le Core, sans promesse de RLS SQL.
- Le compilateur de requêtes internes n’est pas une compatibilité SQL générale.
- Métriques du processus courant depuis démarrage ; pas d’historique de séries,
  export Prometheus, agrégation interinstances ou alertes automatiques.
- Sans SQL, l’authentification administrateur et son diagnostic deviennent
  indisponibles ; les sondes publiques minimales restent le premier outil.
- NoSQL, S3 et Aion ont été étudiés. Aucun fournisseur/connecteur exécuté :
  leurs capabilities restent indisponibles et le Core ne dépend pas de ces services.
