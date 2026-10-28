<!-- DOCS/BOOTSTRAP.md -->
# Rapport de bootstrap — 28 octobre 2026

## Audit initial

- Dépôt déjà initialisé avec sept packages privés ESM à sources vides.
- Node.js 22.22.2, pnpm 12.16.1, TypeScript 7.0.2 détectés.
- `README.md` absent, roadmap présente dans `DOCS/ROADMAP.md`.
- `DOCS/Cahier_des_charges.md` vide et non suivi à l'arrivée ; laissé intact.
  La mission détaillée provient du texte joint à la demande.
- Configurations TypeScript strictes dupliquées, absence d'exports explicites
  et de dépendances internes, scripts lint/test sans commandes de packages.
- Artefacts `dist/` déjà suivis, lockfile incomplet par rapport aux manifests.
- Répertoires `apps/`, `modules/` et `packages/` présents mais vides ; les
  emplacements applicatifs et modules sont conservés, `packages/` reste inutilisé.

## Livraison

L'[arborescence](../README.md#organisation) est décrite dans le README.
Les sept points d'entrée sont complétés, leurs configurations mutualisées et
leurs dépendances `workspace:*` explicites. Les sorties compilées sont retirées
du suivi Git et ignorées. Les applications réservées sont conservées par `.gitkeep`.
Le [changelog](../CHANGELOG.md) détaille les modifications par fichier.

## Dépendances

Aucune dépendance d'exécution externe ajoutée. Dépendances de développement exactes :

| Outil | Version | Motif |
| --- | --- | --- |
| TypeScript | 6.0.3 | Compilation ; remplace 7.0.2 pour respecter les peers du linter |
| ESLint | 10.13.0 | Lint JavaScript et TypeScript |
| `@eslint/js` | 10.0.1 | Règles JavaScript recommandées |
| `typescript-eslint` | 8.72.1 | Analyse et règles TypeScript, support déclaré `>=4.8.4 <6.1.0` |

Les dépendances transitives exactes figurent dans `pnpm-lock.yaml`.
Le package privé `tests/types` sert uniquement à vérifier les contrats via les
vrais liens workspace, sans alias TypeScript vers les sources.

## Validations

- Installation des outils par pnpm : réussie après autorisation réseau hors sandbox.
- `pnpm install --frozen-lockfile --offline` : réussi avec accès au verrou du cache.
- `pnpm install --frozen-lockfile` : réussi, contrôle des 96 entrées du lockfile inclus.
- `pnpm check` : lint sans erreur ni avertissement, compilation des sept packages,
  tests des types publics et 14 tests Node.js réussis.
- `pnpm typecheck` : vérification sans émission des sept packages et du consommateur public réussie.
- `pnpm peers check` : aucun conflit de dépendances restant.
- `git diff --check` et sa variante `--cached` : aucune erreur d'espacement.
- Les tests vérifient refus par défaut, rôles et appartenances hors organisation,
  suspension, permissions absentes et absence d'interprétation des wildcards.
- Résolution des liens internes, déclarations publiques, imports ESM, `require()`
  sous Node 22.22.2 et refus des sous-chemins privés vérifiés pour les sept packages.
- Les tests de types vérifient aussi les erreurs attendues : confusion
  utilisateur/organisation, API SQL absente du SDK et sous-chemins privés.

Les premiers essais ont révélé des erreurs de lint corrigées et une incompatibilité
de peers TypeScript résolue. La sandbox interdisait initialement l'accès au registre
et au verrou du cache ; les commandes concernées ont été relancées avec autorisation.
Une revérification hors ligne a nécessité de rafraîchir en ligne les métadonnées
de contrôle de la chaîne d'approvisionnement pnpm. Un premier clone nécessite
un accès au registre ; le mode hors ligne suppose le cache et ces contrôles disponibles.

## Limites et suite

Les contrats de transactions et d'événements ne fournissent aucune implémentation
ni garantie runtime d'isolation. Aucun serveur, frontend, authentification,
adaptateur PostgreSQL, broker, Store ou chargement dynamique n'est implémenté.
La génération d'identifiants uniques, la validation des données externes et la
frontière d'exécution des plugins restent à concevoir.

Prochaines étapes : initialiser le Core NestJS et sa configuration, puis construire
l'identité réelle, l'adaptateur PostgreSQL et ses migrations. Tester ensuite
l'isolation multi-organisation sur une base réelle avant de fournir la façade SDK.
Poursuivre BFF et frontend selon la roadmap, sans ajouter de Store à ce stade.

Aucun commit ni push automatique ; le suivi de cette livraison est assuré par le changelog.
