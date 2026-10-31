<!-- CHANGELOG.md -->

# Changelog

Chaque intervention doit ajouter une entrée datée avec les fichiers concernés,
les raisons des changements, les validations exécutées et les limites restantes.
Les modifications en cours restent dans « Non publié » jusqu'à une version décidée.

## Non publié — 0.2.0-EXP — 2026-10-31

### Phase 2 — Module Manager, capabilities et premier module officiel

- `lib/contracts/src/modules.ts` : contrats du manifeste standard de module
  (identité, plage de compatibilité Core, dépendances, capabilities, permissions,
  entités de données), validateur `isModuleManifest`, `ModuleSummary`,
  `RegisteredModule`, `CapabilityStatus`, `ModuleEntry` et motifs associés.
  `platform.ts` : permissions `modules:read`/`modules:write`, catalogue
  `modulePermissions` (`demo:read`/`demo:write`), `builtinAdminPermissions` et
  `InstallationStatus.modulesReady`. `http.ts` : `features.modules` variable.
- `lib/database` : migrations additive `0003_modules` (registre
  `orkobi_core.modules`, activations par organisation, contrainte de permissions
  étendue, rôles builtin) et `0004_module_demo` (schéma `orkobi_demo`, table
  `orkobi_demo.notes`, grant et permissions démo sur les rôles admin).
  Méthodes de registre et d'activation dans `platform.ts` ; `adapter.ts` :
  `PostgreSqlModuleAdapter` avec `validateModuleStatement` (instruction unique,
  tables détenues uniquement, schémas `orkobi_*` non-dtenus refusés,
  `organization_id` exigé, index de paramètres), `SET LOCAL lock_timeout` et
  contexte d'organisation via `set_config`. Migrations marquées par leur module
  propriétaire (`migrationsForModule`).
- `modules/demo` : premier module officiel `orkobi.demo` (notes de démonstration,
  permissions `demo:read`/`demo:write`, capabilities `core.identity`,
  `core.permissions`, `core.modules`, `core.data.sql` obligatoires et `core.audit`
  facultative, plage `>=0.2.0-EXP <0.3.0`).
- `apps/core` : version produit `0.2.0-EXP` ; `modules/range.ts` (SemVer minimal),
  `modules/capability-registry.ts` (catalogue honnête : available/limited/
  unavailable), `modules/manager.ts` (synchronisation des manifestes officiels,
  compatibilité, dépendances, activation plateforme et par organisation, audit),
  `modules/data.ts` (accès générique borné aux entités déclarées, validation des
  champs, audit par entité). Routes `capabilities`, `modules`,
  `modules/:id/activate|deactivate`, données de module et `admin/modules`.
  `modulesReady` dans le status, permissions builtin étendues à la création
  d'organisation.
- `apps/bff` : `features.modules: available` lorsque la base et le registre sont
  prêts ; relais des routes modules et capabilities, contrôle d'origine inchangé.
- `apps/web` : page `/modules` enrichie du registre réel et de l'activation par
  organisation, nouvelle page `/modules/demo` (CRUD de notes avec confirmation),
  permissions de module dans l'édition des rôles, audit et état des services
  complétés, copie FR/EN.
- `tests/modules.test.mjs` : plages de version, manifeste démo et
  `validateModuleStatement` (refus multi-instructions, tables étrangères, schémas
  non détenus, `organization_id` manquant, index de paramètres hors bornes, absence
  de fuite SQL dans le message public). Correction : le motif `$n` de l'adapter
  exigeait le flag `g` pour `matchAll`.
- `tests/modules.integration.mjs` : scénario complet sur PostgreSQL réel
  (capabilities, registre, activation plateforme puis organisation, CRUD de notes
  validé, isolation inter-organisations, refus membre, conservation des données
  après désactivation, blocage de désactivation plateforme, audit). Ajouté au
  service Compose `test-db`.
- `tests/platform.integration.mjs` : `modulesReady` attendu dans le status ;
  `tests/core.test.mjs` : version OpenAPI `0.2.0-EXP`. Bump de version `0.2.0-EXP`
  sur les treize manifests privés.
- Validations : `pnpm check` (format, lint, build, tests unitaires),
  `pnpm infra:test` (migrations 0001–0004, HTTP, panne SQL, redémarrage,
  persistance) et parcours modules en conditions réelles.
- Limites assumées : isolation applicative sans RLS (`core.data.sql` en
  `limited`), modules tiers non supportés (manifestes embarqués uniquement),
  `core.events` et `core.identity.oidc` indisponibles.

## Non publié — 0.1.0-EXP — 2026-10-29

### Corrections d'exploitation — 2026-10-30

- `infra/postgres/init.sh` : mode exécutable `100755` versionné. Sous Docker
  Desktop/macOS, le montage en lecture seule rendait le script inéxécutable
  (`bad interpreter : Permission denied`) : les rôles `orkobi_app` et
  `orkobi_migrator` n'étaient jamais créés et PostgreSQL repartait sur un volume
  à moitié initialisé en restant « sain » au regard de `pg_isready`.
- `compose.yaml` : le healthcheck PostgreSQL exige maintenant la présence des
  deux rôles Orkobi en plus de `pg_isready`, pour refuser un volume dont l'initialisation
  a échoué au lieu de laisser `migrate` échouer plus tard sans contexte.
- `apps/bff/src/errors.ts`, `tests/bff.test.mjs` : table de codes d'erreur du
  filtre BFF alignée sur celle du Core (`401`, `403`, `409`, `429` manquants) ;
  un refus 403 relais retournait `internal_error` au lieu de `forbidden`.
  Test de non-régression ajouté sur l'écriture platform sans origine.
- Validations : `pnpm check` (format, lint, build, 48 tests), `pnpm typecheck`,
  `pnpm infra:test` (10 contrôles : migrations, rollback, concurrence, empreintes,
  rôles, HTTP, panne SQL, redémarrage, recréation des conteneurs, persistance du
  volume) et parcours navigateur réel (installation, connexion, reconnexion après
  `down`/`up` complet).

### Phase 1 — plateforme administrable et multi-organisation

- `lib/database/src/platform-migration.ts`, migrations et dépôt : migration
  additive `0002_platform` après la 0.4, sans changement de 0001. Utilisateurs,
  installation unique, organisations, rôles contextualisés, appartenances,
  sessions persistantes, modèle OIDC et audit. Requêtes paramétrées dans
  `lib/database`, FK rôle/organisation, transactions et sérialisation des
  changements de droits pour protéger les derniers administrateurs.
- `apps/core/src/platform/` : assistant protégé par jeton opérateur,
  authentification locale, scrypt avec sels individuels, sessions sous empreinte,
  délais absolu/inactif et révocation. Cookies HttpOnly/SameSite, Secure en HTTPS,
  protections CSRF, limite persistante de connexions par compte et borne de
  concurrence des dérivations. Validation des entrées et refus par défaut.
- Création des comptes et organisations par l'administrateur plateforme, selon
  le choix confirmé ; délégation de l'administration d'organisation avec des
  permissions exactes. Aucun accès membre implicite pour un administrateur
  plateforme, aucune attribution ou modification au-delà des droits du délégant.
  Désactivation et rétrogradation du dernier administrateur actif refusées,
  y compris sous concurrence. Mutations réussies et audit atomiques.
- `apps/core/src/services/` : raccord persistant identité/organisation/permissions
  au SDK, contexte relu à chaque appel. La factory ne certifie toujours pas une
  identité fournie par un appelant ; capabilities et SQL générique restent futurs.
- `apps/bff/src/platform.ts` : proxy de routes fermé, contrôle d'origine et JSON,
  cookies Orkobi/CSRF uniquement, délais et corps bornés, sans transfert des
  en-têtes d'autorisation/proxy arbitraires. Bootstrap de schéma 2 : disponibilité
  identité/organisations dérivée de l'état réel, modules toujours indisponibles.
- `apps/web/src/platform/`, App, entrée et traductions : installation, connexion,
  espace de travail réel, profil/sessions, administration, organisations,
  appartenances, rôles, audit, sélection serveur et récupération après expiration.
  FR/EN, thèmes, mobile, droits explicites et maintien du catalogue de présentation.
  État SQL ajouté à la page des services ; la version produit reste 0.1.0-EXP.
- Revue Impeccable indépendante : tableaux mobiles rendus lisibles par défilement
  local, formulaires de création vidés après succès (mot de passe compris),
  cibles de modification explicites et annulation. Vérification navigateur des
  corrections ; les trois constats sont résolus, disposition `ship` sur ces fixes.
- `apps/web/build.mjs` : build frontend explicitement en production, indépendant
  du `NODE_ENV=development` du `.env` backend. La première tentative de séparation
  par une constante Vite créait un mélange jsxDEV/runtime production ; remplacée
  par un lancement Vite cohérent et revalidée dans Chrome.
- `scripts/prepare-installation.mjs`, `.env.example`, Compose et scripts racine :
  ajout non destructif du jeton opérateur à un environnement 0.4, configuration
  des cookies/origine et intégration de la suite Phase 1 à la recette Docker.
- `tests/platform.test.mjs`, `tests/platform.integration.mjs` et suites existantes :
  cryptographie/configuration, installation concurrente, identités persistantes,
  CSRF, deux organisations, accès croisés refusés, délégation bornée, expiration,
  révocation étrangère refusée, audit sans secrets et protection concurrente du
  dernier administrateur. `tests/browser/phase1*.mjs` : parcours réels et correctifs
  de revue avec captures desktop/mobile, sans secrets opérateur versionnés.
- README, PRODUCT et `DOCS/` : guide d'installation/exploitation Phase 1,
  contrôles et preuves de sécurité, architecture, SDK, guides historiques et
  roadmap synchronisés. La prochaine phase est la modularité 2.1.

Validation locale : 48 tests Node.js, 18 tests SQL/HTTP sur PostgreSQL réel,
contrats TypeScript, lint et formatage. Mise à niveau 0.4, panne/reprise SQL,
redémarrage des applications et recréation complète des conteneurs vérifiés.
Preuve de recette : `output/infrastructure/c6b49f6c1be6/result.json`.
Chrome headless : installation jusqu'à la délégation, profil, persistance,
FR/EN, thèmes, mobile et corrections ; captures `output/playwright/phase1-*.png`.
Les premiers passages navigateur ont corrigé des sélecteurs de test trop stricts
et un nom de champ mêlé à son aide. Les scénarios ont été poursuivis après
correction ; les résultats ne sont pas présentés comme une publication distante.

Limites : listes bornées sans pagination (200 entrées, sessions 100), isolation
applicative sans RLS, TLS et authentification interservices de production non
validés, pas de MFA/récupération de mot de passe/OIDC actif/activation de modules
ou isolation de plugins. Les volumes de recette sont conservés. Aucun compte
réel précréé, commit, push, tag ou déploiement de production effectué par ce lot.

### Étape technique 0.4 — Infrastructure

- `compose.yaml`, `compose.dev.yaml`, `Dockerfile`, `.dockerignore` et
  `infra/postgres/init.sh` : pile locale PostgreSQL 18 → migration ponctuelle →
  Core → BFF/React compilé. Seul le BFF est exposé sur loopback ; exposition SQL
  locale facultative pour Vite. Applications exécutées sous `node`, signaux via
  init, volume nommé sur `/var/lib/postgresql` et santé de chaque service durable.
- Comptes SQL séparés : administrateur pour l'initialisation, migrateur sans
  privilèges superutilisateur et compte Core limité à la lecture du registre.
  Les secrets sont requis, distincts et absents des sources/images.
- `lib/database/src/{config,migrations,postgres}.ts` : pilote `pg` 8.23.1,
  configuration validée, pool borné et fermé à l'arrêt, première migration du
  schéma technique. Registre avec SHA-256, ordre contrôlé, verrou transactionnel,
  rejeu sans changement, rollback atomique et refus d'historique incompatible.
  `pnpm-lock.yaml` mis à jour sans exemption de politique pnpm.
- `apps/core/src/database.service.ts`, configuration, module et contrôleur :
  injection du pool et `/health/ready`, HTTP 503 si SQL désactivé, inaccessible
  ou migrations incompatibles. `apps/bff/src/{application,core-client}.ts` :
  `/api/ready` vérifie cette chaîne avec le client HTTP borné existant. Les sondes
  de vitalité et le bootstrap frontend conservent leur contrat.
- `scripts/{database,setup-env,healthcheck,test-infrastructure}.mjs` et scripts
  racine : initialisation de `.env` sans écrasement avec secrets aléatoires,
  migrations/état SQL, démarrage/arrêt Compose et recette isolée reproductible.
  Les conteneurs et secrets temporaires sont retirés après recette, les volumes
  de test sont conservés. Les résultats locaux sont ignorés par Git.
- `tests/database.test.mjs` : configuration, erreurs expurgées et HTTP réel
  distinguant vitalité/disponibilité. `tests/database.integration.mjs` : tests
  PostgreSQL réels de concurrence, rejeu, rollback DDL/registre, dérive/futur de
  l'historique et refus des écritures/DDL sous le compte Core. Le contrôle des
  packages accepte le pilote externe tout en vérifiant les liens workspace.
- `.prettierrc.json` accepte les fins de ligne de la plateforme ; `.gitattributes`
  impose LF aux scripts shell pour Docker sous Windows. Aucun changement de
  contenu des fichiers sans rapport n'est nécessaire pour ce réglage.
- `DOCS/INFRASTRUCTURE.md`, README, architecture, guides Core/BFF et roadmap :
  installation, fonctionnement local, comptes, migrations, reprise, sauvegarde
  et limites. Version commune des douze manifests conservée en `0.1.0-EXP`.

Validation locale sous Windows, Node.js 22.22.2 et Docker Desktop Linux :
`pnpm check` (formatage, lint, compilation, contrats et 46 tests),
`pnpm typecheck`, `pnpm install --frozen-lockfile` et `pnpm peers check` réussis.
`pnpm infra:test` : cinq tests SQL, échanges HTTP, route React directe, panne et
reprise PostgreSQL, redémarrage Core/BFF, recréation complète des conteneurs et
conservation d'une donnée témoin vérifiés. Le premier passage a identifié un port
hôte aléatoire réattribué au redémarrage ; la recette relit désormais ce port et
le passage complet suivant a réussi. Preuve locale :
`output/infrastructure/efb9ab1b21be/result.json` (ignorée par Git).

Limites : environnement local HTTP/SQL sans TLS, image contenant encore les
outils de build, sans restauration de sauvegarde éprouvée ni déploiement de
production. Aucun utilisateur, installation applicative, transaction métier,
adaptateur SQL contextualisé ou isolation réelle des organisations/plugins
n'est ajouté. Aucun commit, push ou publication ; prochaine étape : 1.1.

### Étape technique 0.3 — Frontend et BFF

- `apps/web/` : application React 19.3.1/Vite 8.3.5/TypeScript, React Router 8.5.1,
  police Manrope auto-hébergée et icônes SVG Lucide. Accueil centré sur les
  organisations et modules, selon le choix utilisateur ; tableau de bord classique
  avec Odoo et Business Central comme repères de clarté, sans copie de marque.
- Cinq routes : accueil, organisations, modules, préférences, état des services ;
  404 localisée, navigation mobile par dialog natif, focus visible et réduction
  des mouvements. Recherche et filtres de modules dans l'URL, retour/rechargement
  conservés ; catalogue de présentation explicitement non installable.
- Thèmes clair/sombre/système et traductions FR/EN typées. Préférences locales
  persistantes, suivi du thème système, titre et langue du document mis à jour,
  fonctionnement dégradé si le stockage est indisponible. Script de thème initial
  externe, compatible avec la CSP sans script inline.
- `apps/bff/` : BFF NestJS 12.3.2, configuration validée, `/api/health`, bootstrap
  versionné et fichiers React compilés avec fallback des routes de page.
  JSON d'erreur corrélé, logs structurés expurgés, en-têtes navigateur, aucun CORS
  permissif ou transfert des cookies/jetons du navigateur.
- `lib/contracts/src/http.ts` et contrôleur de vitalité Core : contrats HTTP
  partagés et validateurs runtime. Sonde Core bornée (délai et 4 Ko), redirections
  refusées et états distincts timeout/réseau/réponse invalide. Le bootstrap reste
  utile en mode dégradé et n'annonce jamais les services métier comme disponibles.
- `scripts/dev.mjs`, `scripts/dev-core.mjs`, scripts racine et `.env.example` :
  lancement commun et commandes séparées, compilation backend sérialisée,
  surveillance et arrêt des processus enfants. `pnpm dev:core` conserve le
  lancement du Core seul ; `pnpm dev` lance désormais toute la pile locale.
- Le contrôle Vite a révélé une incompatibilité Fast Refresh due aux exports
  mixtes Provider/hook. Contextes/hooks séparés des composants et ErrorBoundary
  isolée de l'entrée ; règle `react-refresh/only-export-components` ajoutée.
  Le scénario de recompilation des contrats a ensuite passé sans erreur React,
  en conservant route, langue, thème et récupération des services.
- `tests/bff.test.mjs` : 8 tests principaux et 8 sous-tests couvrant vrais échanges
  HTTP, configuration, pannes, timeouts, taille, redirection, absence d'en-têtes
  sensibles, ressources et contrats invalides. `tests/browser/` : parcours
  Playwright de production, Vite et rechargement à chaud reproductibles via la CLI.
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/{config,design}.json` et brief du shell :
  contexte confirmé et système visuel documenté avec le skill Impeccable.
  Revue visuelle indépendante des dix captures : disposition `ship` ; aucun
  correctif matériel requis. Captures et planches temporaires ignorées par Git.
- `DOCS/FRONTEND_BFF.md`, guides existants, README et roadmap synchronisés.
  Douze manifests privés restent en `0.1.0-EXP` ; version BFF/web dérivée de la
  racine, règles de synchronisation actualisées. Retrait des emplacements réservés
  `.gitkeep` du BFF et du frontend.
- La résolution initiale de Lucide 1.64.0 ajoutait une exemption d'âge de publication.
  Elle a été remplacée par 1.63.0 et le lockfile régénéré puis vérifié sans exemption.
  Les scripts de dépendances restent soumis à la politique existante.

Validation locale : `pnpm check` (formatage, lint, dix compilations, contrats
TypeScript et 43 tests, sous-tests compris), `pnpm typecheck`, installation avec
lockfile figé et contrôle de peers réussis. Audit d'exécution sans avis connu
signalé. Chrome headless : cinq routes, URL, filtres/recherche, FR/EN, thèmes,
persistance, mode système, 404, reprise d'erreurs et tiroir mobile au clavier ;
captures 1440 × 1000 et 390 × 844, sans débordement. Pannes UI simulées par
interception, pannes BFF/Core éprouvées par serveurs HTTP jetables. Contrôle
Vite/HMR distinct du build de production, arrêt et libération des ports vérifiés.

Limites : aucun compte utilisateur, création réelle d'organisation, installation
ou activation de module, PostgreSQL, migration, isolation SQL ou sécurité de
production n'est fourni par ce lot. Aucune publication, opération de production,
commit ou push effectué ; prochaine étape technique : infrastructure 0.4.

### Initialisation de la stratégie Git

- Diagnostic après fetch : `main` et `origin/main` au même commit `bc1ada4`,
  seule branche distante existante ; lot 0.1/0.2 encore non commité au départ.
- Dix manifests privés vérifiés en `0.1.0-EXP`, numéro conservé. Les versions
  OpenAPI et des guides sont recensées ; aucun mécanisme de publication ajouté.
- `DOCS/{VERSIONING,GIT_BOOTSTRAP,RELEASE_CHECKLIST}.md` : plan local, bases de
  `develop`, `matheo`, `devops`, PR, proposition de protection de `main`,
  synchronisation par merge sans réécriture, releases et hotfixes, contrôles de
  cohérence de versions et autorisations de publication. Aucun workflow CI
  imaginaire n'est annoncé comme actif.
- `DOCS/ORKOBI_VERSIONING.md`, `README.md` : renvois vers les règles opérationnelles
  issues du diagnostic ; la proposition générale de distribution reste distincte.
- `.gitignore` : fichiers macOS `.DS_Store` exclus sans les supprimer.
- Validation locale avant commit : `pnpm check` (formatage, lint, compilation,
  contrats TypeScript et 27 tests), `pnpm typecheck`, dix versions contrôlées
  et `git diff --check` réussis.
- Le commit local regroupe les fondations et leur suivi documentaire. Les
  commandes locales de pull/création des branches sont décrites dans le plan ;
  leurs SHA effectifs sont vérifiables dans Git et dans le compte rendu.
- Les pushes, la PR distante et l'activation des protections restent en attente
  de validation explicite. Aucun tag, déploiement, suppression de branche,
  rebase, reset, amend ou push forcé n'est demandé ou effectué.

### Revue de la phase 0 et clôture technique 0.2

- Revue des étapes « 0.1 — Initialisation » et « 0.2 — Backend Core » avec les
  skills `security-best-practices` (guide Express) et `playwright`. Le périmètre
  correspond aux étapes de la roadmap, sans incrémenter la version produit.
- `apps/core/src/services/{contracts.ts,services.module.ts}` : contrats applicatifs
  contextualisés d'identité, d'organisation, de permissions et de capabilities,
  jetons d'injection NestJS et exports pour les futurs managers du Core.
- `apps/core/src/services/{unavailable-services.ts,sdk-factory.ts}` : fournisseurs
  qui renvoient explicitement `unavailable`, et adaptation vers `CoreSdk` avec
  copie gelée du contexte. Chaque appel délègue au service ; aucun résultat de
  permission n'est mis en cache. Aucun faux utilisateur ni droit n'est créé.
  La factory ne valide pas l'identité : le Core devra lui fournir un contexte
  préalablement autorisé et revérifier les droits dans chaque service métier.
- `apps/core/{package.json,src/app.module.ts}`, `pnpm-lock.yaml` : raccord du module
  de services, dépendances explicites au SDK existant ; aucun paquet externe ajouté.
- `apps/core/src/application.ts` : activation des en-têtes de sécurité intégrés à
  NestJS 12.3.2, dont CSP, nosniff, protection de cadrage et politique de referrer.
  HSTS et upgrade automatique vers HTTPS restent désactivés pour ce socle HTTP local.
- `tests/core-services.test.mjs`, `tests/types/core-services.ts` : trois tests
  exécutables et contrats de types ; injection Nest, indisponibilité, délégation,
  immuabilité, contextes synthétiques distincts et propagation des erreurs.
  `tests/core.test.mjs` contrôle aussi les en-têtes sur vitalité, erreurs et Swagger.
- `.gitignore`, `.prettierignore`, `eslint.config.mjs` : exclusion des artefacts
  temporaires Playwright, capture locale sous `output/playwright/`.
- `DOCS/REVIEW_PHASE_0.md` : constats, corrections, preuves et limites de la revue.
  `DOCS/{CORE,SDK,ARCHITECTURE,ROADMAP}.md`, `README.md` : documentation synchronisée ;
  dernier point de la section technique 0.2 coché.
- `DOCS/ORKOBI_VERSIONING.md`, brouillon apparu pendant la revue : formatage
  Prettier uniquement pour le contrôle global ; aucune politique de release
  adoptée ou automatisation ajoutée dans ce lot.

Validation de cette revue :

- `pnpm check` avant changements : 24 tests réussis ; après changements :
  formatage, lint, huit compilations, contrats TypeScript et 27 tests réussis.
- `pnpm typecheck`, `pnpm install --frozen-lockfile`, `pnpm peers check` : réussis.
- `pnpm audit --prod` : aucune vulnérabilité connue signalée à la date du contrôle.
- `pnpm dev` : HTTP 200 avant et après modification du mtime d'une nouvelle source,
  recompilation et redémarrage sans boucle, arrêt Ctrl+C et port libéré.
- Chrome headless via Playwright : Swagger affiché avec la CSP active, puis
  « Try it out » / « Execute » sur `/health`, réponse réelle HTTP 200 et capture
  `output/playwright/orkobi-core-swagger.png` (ignorée par Git).
- `git diff --check` : réussi. Aucun commit, push, déploiement ou publication.

Les sections suivantes décrivent le lot HTTP antérieur à cette revue. Leurs
comptes de tests et limites correspondent à ce premier état. Les sections
techniques 0.1/0.2 sont désormais terminées ; la version produit 0.1.0-EXP,
les managers métier, l'authentification, PostgreSQL et l'isolation réelle
multi-organisation restent ouverts.

### Core HTTP et outillage

- `apps/core/{package.json,tsconfig.json,src/*}` : première application NestJS ESM,
  compilée avec les métadonnées des décorateurs. Configuration immuable et validée
  avant écoute, interface locale par défaut, fermeture sur SIGINT/SIGTERM.
- `GET /health` : sonde de vitalité du processus HTTP ; aucun accès SQL implicite.
- Middleware de corrélation avant parsing JSON, UUID émis par le serveur,
  en-tête `x-request-id`, absence de cache et limite JSON de 100 Ko.
- Filtre global : réponses selon `CoreError`, messages publics fixes et erreurs
  inattendues masquées. `lib/contracts/src/index.ts` ajoute les codes
  `unauthenticated`, `rate_limited` et `internal_error` sans changer `Result`.
- Logger JSON : démarrage, requêtes, erreurs et événements Nest sans URL, corps,
  en-têtes ou détail brut d'exception. Ce journal technique n'est pas un audit métier.
- OpenAPI interne et Swagger sur activation explicite ; toutes leurs routes sont
  absentes par défaut. Aucune API d'intégration externe n'est créée.
- `scripts/dev-core.mjs` et `package.json` : compilation puis démarrage, surveillance
  explicite des sources et de `.env`, redémarrages sérialisés et arrêt des processus
  enfants. Le premier essai avec le watch natif Node réagissait aux fichiers générés ;
  remplacé après observation de la boucle de recompilation sur cette machine.
- `.env.example`, `.prettierrc.json`, `.prettierignore` : configuration locale
  documentée et formatage contrôlé par `pnpm check`. Les bibliothèques et tests
  préexistants ont reçu le formatage initial ; leurs changements hors `contracts`
  sont uniquement typographiques. Le rapport historique de bootstrap reste intact.
- NestJS et adaptateur Express 12.3.2, Swagger 12.0.5, reflect-metadata 0.2.2,
  RxJS 7.8.2 ; types Node 24.19.2/Express 5.0.6 et Prettier 3.9.10.
  Versions exactes et lockfile actualisé. `pnpm-workspace.yaml` refuse explicitement
  le script transitif de télémétrie `@scarf/scarf` via `allowBuilds` ; aucune
  autorisation globale des scripts de dépendances.
- `README.md`, `DOCS/CORE.md`, `DOCS/ARCHITECTURE.md`, `DOCS/ROADMAP.md` : démarrage,
  configuration, contrats, preuves et périmètre restant. Retrait du `.gitkeep` du Core.

### Validation locale

- Environnement : macOS, Node.js 24.19.0, pnpm 12.16.1.
- `pnpm install --frozen-lockfile` : réussi avec la politique de builds explicite.
- `pnpm check` : formatage, lint sans avertissement, huit compilations, contrats
  TypeScript et 24 tests Node.js réussis, dont 10 tests du Core.
- `pnpm typecheck` et `pnpm peers check` : réussis, aucun conflit de peers.
- Tests Core sur de vrais ports HTTP éphémères : vitalité, UUID, absence de détails
  sensibles, OpenAPI activé/désactivé, 404, JSON invalide, corps trop gros et 500.
  Tests des erreurs communes et processus avec configuration invalide ou port occupé.
- `pnpm dev` exécuté sur loopback : HTTP 200 avant et après modification du mtime
  d'une source, une recompilation sans boucle, arrêt Ctrl+C et port libéré.
- `pnpm start:core` exécuté sur loopback avec OpenAPI activé : document JSON reçu
  avec le schéma de `/health`, puis arrêt Ctrl+C. Aucun test navigateur revendiqué.
- `git diff --check` : réussi. Aucun commit, push, déploiement ou publication.

### Limites restantes

- La section d'initialisation 0.1 de la phase 0 est terminée ; la version
  0.1.0-EXP complète reste ouverte. Les interfaces applicatives des services métier,
  BFF, React, PostgreSQL, migrations, installation, identité et administration
  restent à construire ; aucune isolation multi-organisation réelle n'est prouvée.
- Les logs masquent volontairement les messages arbitraires de Nest ; les échecs
  de démarrage hors configuration sont génériques. Aucun test de production,
  de navigateur ou de compatibilité Windows n'a été effectué.

## Non publié — 0.1.0-EXP — 2026-10-28

### Fondations internes

- `lib/contracts/src/index.ts` : identifiants opaques par catégorie, validation
  minimale des chaînes existantes, contexte d'organisation, conventions de noms,
  erreurs communes et résultat discriminé. Aucun générateur ni accès aux données.
- `lib/identity/src/index.ts` : utilisateurs, organisations, appartenances avec
  rôles et statut, liaison OIDC par issuer/subject sans authentification.
- `lib/security/src/index.ts` : contrats de rôles et d'autorisation ; évaluation
  avec refus par défaut, appartenance active et permission explicite dans la même
  organisation. Aucun privilège implicite ou wildcard.
- `lib/database/src/index.ts` : requêtes paramétrées, résultats, transactions
  contextualisées, options d'isolation et point d'extension PostgreSQL sans pilote.
- `lib/events/src/index.ts` : enveloppes versionnées par organisation, publication,
  abonnement et désabonnement ; aucune dépendance à un broker.

### SDK public

- `sdk/types/src/index.ts` : exports publics sélectionnés, résumés d'identité,
  déclarations de permissions et exigences de capabilities. Aucun export SQL/OIDC.
- `sdk/core/src/index.ts` : façade liée au contexte, interfaces de lecture de
  l'identité, de vérification des permissions et des capabilities, sans implémentation.

### Configuration et suivi des fichiers

- `tsconfig.base.json` ajouté et les sept `lib/*/tsconfig.json` et
  `sdk/*/tsconfig.json` mutualisés : NodeNext/ES2022, mode strict, accès indexés,
  propriétés optionnelles exactes, imports de types et compilation sans émission
  en présence d'erreurs.
- Les sept `lib/*/package.json` et `sdk/*/package.json` conservent leur nom et leur
  caractère privé, passent en `0.1.0-EXP`, déclarent leurs exports JS/types, fichiers
  distribuables, scripts build/typecheck et dépendances internes `workspace:*`.
- `package.json` : scripts réels build, lint, typecheck, test, test:types et check ;
  retrait du script dev sans application ; Node >=22.22.2 déclaré.
- Ajout d'ESLint 10.13.0, `@eslint/js` 10.0.1 et `typescript-eslint` 8.72.1 en
  développement. TypeScript 7.0.2 remplacé par 6.0.3, compatible avec les peers
  déclarés du linter. Aucune dépendance d'exécution externe ajoutée.
- `eslint.config.mjs` ajouté : règles recommandées JS/TS, imports de types et
  explication obligatoire des erreurs TypeScript attendues.
- `pnpm-workspace.yaml` étendu à `tests/types` ; `pnpm-lock.yaml` régénéré avec
  les vrais importers, liens internes et versions exactes des outils.
- `.gitignore` complété : dist, couverture, caches TypeScript, variantes `.env`,
  logs et lockfile Yarn ; exception pour `.env.example`.
- Retrait du suivi Git des quatorze sorties générées `lib/*/dist/index.{js,d.ts}`
  et `sdk/*/dist/index.{js,d.ts}` ; elles sont régénérées par `pnpm build`.
- `apps/{core,bff,web}/.gitkeep` et `modules/.gitkeep` ajoutés pour conserver les
  emplacements réservés dans un clone.

### Documentation et tests

- `README.md` ajouté : présentation, démarrage reproductible, commandes et arborescence.
- `DOCS/ARCHITECTURE.md` ajouté : responsabilités, dépendances, décisions ESM,
  contrats d'isolation et limites de sécurité.
- `DOCS/SDK.md` ajouté : surface publique, conventions et exemple de consommation.
- `DOCS/BOOTSTRAP.md` ajouté : audit initial, dépendances, validations, limites et suite.
- `DOCS/ROADMAP.md` actualisé pour refléter les fondations terminées sans déclarer
  les applications, Prettier ou l'infrastructure comme réalisés.
- `tests/security.test.mjs` ajouté : six tests d'autorisation et de refus.
- `tests/packages.test.mjs` ajouté : huit tests de résolution/exports/identifiants,
  dont imports ESM et chargement require des sept packages.
- `tests/types/{package.json,tsconfig.json,contracts.ts}` ajoutés : compilation de
  consommateurs publics et vérification des usages interdits via `@ts-expect-error`.

### Validation et limites

- `pnpm install --frozen-lockfile --offline` : réussi après accès au cache autorisé.
- `pnpm install --frozen-lockfile` : réussi, contrôle des 96 entrées du lockfile inclus ;
  les métadonnées pnpm de ce contrôle ont dû être rafraîchies en ligne lors d'une
  revérification hors ligne.
- `pnpm check` : réussi ; lint, sept compilations, contrats TypeScript et 14 tests.
- `pnpm typecheck` : réussi ; `pnpm peers check` : aucun conflit restant ;
  vérifications d'espacement Git réussies.
- Aucun ERP complet, accès PostgreSQL réel, authentification, broker, Store,
  chargeur dynamique ou isolation de plugins n'est fourni.
- `DOCS/Cahier_des_charges.md`, vide à l'arrivée, laissé intact ; mission issue du
  texte joint. Dossier `DOCS/` existant conservé pour éviter un doublon de casse.
- Aucun commit ou push automatique effectué.
