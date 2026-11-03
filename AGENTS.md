# Consignes de développement Orkobi

Lire [DOCS/README.md](DOCS/README.md), [DOCS/ROADMAP.md](DOCS/ROADMAP.md),
le guide de la phase concernée et, pour l’interface, `PRODUCT.md` et `DESIGN.md`.
Les rapports historiques datent leurs preuves ; vérifier le code actuel.

## Interface et SDK

- Utiliser `@orkobi/sdk-ui` : Button, Field, Notice, AppIcon et styles CSS natifs.
- Ne pas ajouter de framework CSS externe, de CSS-in-JS ou de second kit UI.
- Lire [DOCS/UI_SDK.md](DOCS/UI_SDK.md) avant toute modification de composants.
- Les icônes d’applications utilisent AppIcon/Papicons ; préserver licence et provenance.
- Conserver FR/EN, clair/sombre, focus clavier, états chargement/vide/erreur et URL.
- Les composants du SDK ne dépendent ni du contexte plateforme ni de ses traductions.
- Les règles métier des formulaires restent applicatives ; déclarer `type="submit"`
  explicitement pour les boutons de soumission.

## Core et modules

- Le Core établit le contexte et contrôle les droits courants à chaque opération.
- Un module consomme les exports publics du SDK ; aucun import de `lib/*`, SQL brut
  ou contexte d’organisation fabriqué par le plugin.
- Les migrations sont append-only. Ne pas modifier un SQL ou checksum déjà appliqué.
- Lire [DOCS/JOB_ENGINE.md](DOCS/JOB_ENGINE.md) pour les tâches : signal d’arrêt,
  idempotence, permissions, verrou de concurrence et suspension explicite.
- Redis est facultatif. Ne pas cacher les décisions d’autorisation ou les sessions.
- Aucun message d’erreur public, log ou audit ne doit contenir de secrets.

## Vérification et livraison

Utiliser pnpm. Lancer `pnpm check`, `pnpm typecheck` et `git diff --check`.
Pour les changements SQL/jobs/cache/auth, utiliser `pnpm infra:test` : projet Docker
isolé, sans utiliser la base existante. La recette conserve ses volumes de test.
Pour l’UI, vérifier le rendu ordinateur/mobile. Chrome et Puppeteer sont disponibles ;
`tests/browser/phase3-sdk.mjs` fournit une recette avec API synthétiques et un mode Vite.

Consigner changements, preuves et limites dans DOCS et CHANGELOG. Distinguer tests
unitaires, navigateur synthétique, vrais services locaux et production. Ne pas
publier ni déployer sans demande explicite. Préserver les modifications utilisateur.

## Plugins tiers (Phase 4)

Lire [DOCS/PHASE_4.md](DOCS/PHASE_4.md). Les handlers tiers sont synchrones et
s’exécutent uniquement dans QuickJS/WASM, jamais par `import()`, `eval()` ou le
module `vm` de Node. Ne pas exposer de fonction ou objet hôte brut au moteur.
Les opérations passent par le pont SDK avec utilisateur/organisation/plugin
fixés par le Core et droits revérifiés. Conserver quotas, timeout et arrêt forcé.
Le frontend reste déclaratif, sans JS/CSS/HTML externe. Les tables du plugin sont
logiques ; aucun SQL arbitraire ou privilège DDL du serveur HTTP.
Vérifier `pnpm sdk:test`, `pnpm plugin:build`, `pnpm plugin:validate` et la suite
`plugins.integration.mjs` via `pnpm infra:test`. La distribution publique sur un
registre est distincte du packaging local.
