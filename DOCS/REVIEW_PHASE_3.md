# Revue Phase 3 — 3 novembre 2026

## Périmètre et résultat

Implémentation de 3.3/3.4, revue des parcours 3.1/3.2/3.2-BIS et extraction du
kit UI/CSS vers le SDK. `AGENTS.md` fournit les consignes persistantes des prochaines IA. La roadmap est à jour. Le monorepo conserve
`0.2.0-EXP`, sans tag, publication, push ou déploiement de l’instance existante.
La Phase 4 (distribution et isolation de plugins externes) reste distincte.

Guides de référence : [Phase 3](PHASE_3.md), [Job Engine](JOB_ENGINE.md),
[UI SDK et consignes IA](UI_SDK.md), [index documentaire](README.md).

## Corrections vérifiables

| Problème ou manque                                                                   | Correction et référence                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Absence de cache facultatif et de file durable                                       | `apps/core/src/cache/service.ts`, `jobs/*`, migration append-only `0008_jobs`. Mémoire bornée, Redis facultatif et jobs persistés dans PostgreSQL.                                                                                                                                    |
| Risque de concurrence entre jobs de même tâche                                       | `lib/database/src/jobs.ts` : verrou de session par organisation/module/tâche, pool distinct du HTTP, conservation du verrou jusqu’à la fin du handler et contrôle lors d’une relance.                                                                                                 |
| Révocations et désactivations pendant l’attente ou l’exécution                       | Vérification des droits courants au lancement et pendant le run, accès aux données revérifié, suspension dans la transaction de désactivation. Reprise explicite.                                                                                                                     |
| Attribution administrative d’un rôle refusée après ajout des permissions d’un module | `apps/core/src/platform/service.ts` utilise le catalogue de permissions déclarées des manifestes valides, en plus des permissions système. Seul l’administrateur plateforme passe par cette branche. L’intégration attribue un rôle administrateur d’organisation contenant `demo:*`. |
| Primitives UI copiées dans l’application                                             | Package `sdk/ui`, exports publics, consommation réelle par le web et retrait des anciennes copies. Styles et thèmes natifs communs, aucun framework CSS externe.                                                                                                                      |
| Boutons soumettant implicitement un formulaire                                       | `Button` définit `type="button"` par défaut ; soumission explicite dans `TaskForm`.                                                                                                                                                                                                   |
| Liens désactivés encore activables                                                   | `aria-disabled`, retrait de la tabulation et blocage du clic.                                                                                                                                                                                                                         |
| Règles de mot de passe et de longueur enfermées dans un champ générique              | `Field` du SDK accepte les attributs natifs ; le wrapper plateforme conserve les règles métier existantes.                                                                                                                                                                            |
| Icônes d’applications réutilisables                                                  | `AppIcon`, sélection de sept SVG Papicons, licence MIT conservée et distribuée, catalogue et module officiel raccordés ; aucun runtime natif.                                                                                                                                         |
| Recette Docker laissant Redis actif                                                  | `scripts/test-infrastructure.mjs` inclut tous les profils pour `down`, sans suppression de volumes.                                                                                                                                                                                   |
| Test de rollback refusé avant même d’exécuter son SQL                                | Le numéro de migration de la sonde suit désormais les migrations existantes ; le DDL fautif est réellement exécuté puis annulé.                                                                                                                                                       |
| Modification des handlers officiels ignorée par le superviseur dev                   | `scripts/dev-core.mjs` observe aussi `modules/demo/src`.                                                                                                                                                                                                                              |
| Fichiers inutiles et documentation de composants périmée                             | Suppression des copies `apps/web/src/ui/*`, des anciennes pages HomePage/OrganizationsPage sans route et des `.DS_Store` locaux ; guides et liens mis à jour.                                                                                                                         |

Les échecs intermédiaires des nouvelles fixtures ont été corrigés : compte
opérateur correct, second administrateur d’organisation avant désactivation du
premier et nouvelle sélection d’organisation après reconnexion. Aucun contrôle
sur les derniers administrateurs ou les sessions révoquées n’a été assoupli.

## Vérifications exécutées

- `pnpm check` : formatage, lint, build, contrats TypeScript et **70 tests** Node.
- `pnpm typecheck` : compilation et typage de tous les workspaces.
- `pnpm peers check` et `git diff --check` : réussis.
- Installation avec lockfile figé dans le build Docker ; versions privées cohérentes.
- `pnpm infra:test` : **57 tests** (sous-tests compris), PostgreSQL et Redis jetables, compte runtime limité,
  migrations concurrentes, rollback et empreintes, phases 1 et 2, MFA, récupération,
  OIDC signé synthétique, secret BFF/Core, intégrations et scopes, puis jobs et cache.
- Jobs : deux Core concurrents, exclusion de deux jobs de même tâche, dates futures,
  récurrence, retries bornés, timeout, suspension et reprise, compte révoqué,
  idempotence après abandon d’un run et absence d’exceptions brutes dans l’historique.
  Désactivation et annulation en cours d’exécution sont aussi couvertes.
- Redis réel : partage de valeurs entre deux clients, invalidation et pause forcée
  du serveur pour vérifier timeout et repli mémoire. La pile normale est ensuite
  démarrée sans Redis ; panne SQL, redémarrages et recréation conservent la donnée témoin.
- Chrome for Testing headless avec Puppeteer : `tests/browser/phase3-sdk.mjs`,
  build compilé et Vite, FR/EN, clair/sombre, 1440×1000 et 390×844 ; création,
  annulation, relance, erreur/reprise, routes directes, profil, intégrations et icônes.
  API navigateur **synthétiques** ; aucune preuve d’un fournisseur externe ou
  d’un appareil physique n’est déduite de ces captures.
- Détecteur Impeccable : quatre remarques consultatives sur les tailles 13/14 px
  héritées du frontend et extraites dans le SDK ; aucun défaut bloquant signalé.
  Les tailles ont été conservées pour préserver le rendu. Le helper lancé depuis
  le sous-répertoire web a aussi signalé deux anciennes références de briefs :
  leurs fichiers sources existent ; la configuration historique n’a pas été réécrite.

Les captures sont sous `output/playwright/phase3*` (ignorées par Git).
Les résultats Docker sont sous `output/infrastructure/<identifiant>/result.json`.
Le dernier passage complet est `output/infrastructure/0230ce37a97c/result.json` (`passed: true`).
Les conteneurs de recette sont arrêtés ; les volumes de test sont conservés
conformément au fonctionnement du script et ne sont pas des données de production.

## Mesures locales

Microbenchmark séquentiel Docker, Node 22, PostgreSQL 18 et Redis 8, après build :
1000 opérations de cache, 100 lectures SQL. Exemple du passage
`orkobi-verify-07928610d303` ; les valeurs varient selon la machine et sa charge.

| Opération                                    | p50 (ms) | p95 (ms) |
| -------------------------------------------- | -------- | -------- |
| Cache mémoire, écriture                      | 0,037    | 0,074    |
| Cache mémoire, lecture                       | 0,004    | 0,005    |
| Redis, écriture                              | 0,118    | 0,141    |
| Redis, lecture                               | 0,113    | 0,137    |
| Readiness SQL (passage mémoire)              | 0,211    | 0,528    |
| Transaction SQL en lecture (passage mémoire) | 0,222    | 0,475    |

Ces mesures valident un chemin technique, pas une capacité de production. Elles
ne justifient ni un cache de permissions ni Redis obligatoire. Points à mesurer
avec une charge métier réelle : attente du verrou global d’administration,
readiness répétées, nombre de workers et rétention des runs/audits. La commande
reproductible est `pnpm bench:services` ; la recette Docker mesure les deux modes.

## Limites explicites

- Le timeout des handlers est coopératif. Un handler qui ignore son signal peut
  retenir son worker ; il n’est pas tué. L’isolation du code tiers reste en Phase 4.
- Une perte de connexion SQL peut survenir après un effet externe : handlers
  idempotents requis, aucune garantie exactly-once. La reprise testée abandonne
  une connexion de job avant sa finalisation ; elle ne simule pas une partition
  réseau complète avec un prestataire externe.
- Les jobs récurrents utilisent un intervalle depuis la fin du run, sans cron,
  calendrier local ou rattrapage de toutes les occurrences manquées.
- Le repli mémoire est local au processus. Ne pas y mettre de droits, sessions,
  secrets ou données exigeant une invalidation cohérente immédiate entre nœuds.
- Les tâches terminées et audits restent conservés. Une politique opérateur
  de rétention doit précéder un usage prolongé.
- Le secret TOTP reste stocké sans chiffrement applicatif, comme dans 3.1 ;
  validation OIDC externe, HTTPS/proxy, sauvegardes et exploitation réelle restent
  propres au déploiement. Les preuves locales ne constituent pas une certification
  de sécurité ou une validation de production.
