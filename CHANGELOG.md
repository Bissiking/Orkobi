<!-- CHANGELOG.md -->
# Changelog

Chaque intervention doit ajouter une entrée datée avec les fichiers concernés,
les raisons des changements, les validations exécutées et les limites restantes.
Les modifications en cours restent dans « Non publié » jusqu'à une version décidée.

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
