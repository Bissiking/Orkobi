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

## Compatibilité et diagnostic (Phase 5)

Lire [DOCS/PHASE_5.md](DOCS/PHASE_5.md) et [DOCS/SERVICES_ADVANCED.md](DOCS/SERVICES_ADVANCED.md).
Les modifications de dépôts SQL doivent passer `pnpm sql:test` en plus de
`pnpm infra:test` : mêmes parcours Core/BFF sur MariaDB/MySQL, sans base existante.
Conserver les requêtes liées, UTC, lecture seule et verrous interprocessus.
Ne pas remplacer la cible d'un upsert par une autre ligne partageant un nom unique.
Ajouter les migrations natives par moteur sans réécrire celles déjà livrées.
MySQL/MariaDB ne garantissent pas le rollback DDL : un journal `applying` bloque
la readiness et nécessite une réparation explicite, jamais un effacement automatique.
Ne pas exposer secrets, hôtes ou identités dans le diagnostic/les labels métriques.
NoSQL, S3 et Aion ont été étudiés, leurs fournisseurs restent indisponibles ; ne pas
les rendre obligatoires ni simuler leur disponibilité dans les futurs prompts.

## Store et distribution (Phase 6)

Lire [DOCS/PHASE_6.md](DOCS/PHASE_6.md). Les catalogues et paquets viennent de
sources épinglées côté serveur ; ne jamais accepter une URL, clé ou token du navigateur.
Conserver Ed25519, l'empreinte canonique, l'expiration et le checkpoint SQL anti-rejeu.
Le Store reste autonome, en lecture seule et sans clé privée. Aucun appel Store ne
doit devenir nécessaire aux sessions, permissions ou plugins installés.
La revue est liée à l'administrateur et au paquet ; revérifier droits et catalogue
avant commit, sans réseau ni sandbox dans une transaction SQL. Les mises à jour
restent désactivées et les nouveaux droits doivent être accordés explicitement ;
nettoyer les accords dormants lors d'un changement de déclarations.
Vérifier `pnpm store:test` et `tests/store.integration.mjs` dans les recettes SQL,
en plus des vérifications SDK et plugins. Ne pas publier un dépôt Internet, ajouter
une racine de confiance ou modifier une configuration utilisateur implicitement.

## Modules métier (Phase 7)

Lire [DOCS/PHASE_7.md](DOCS/PHASE_7.md) et sa revue. France/EUR ; aucune plateforme
agréée configurée : émission fiscale bloquée, préparations explicitement non
fiscales. Ne pas annoncer de stabilité, paie ou certification. Permissions
`orkobi.<module>:read/write` explicites, séparées de `members:*` du Core ; décision
RH avec `orkobi.hr:approve`. Le port SDK métier est réservé aux modules officiels
et absent du guest QuickJS API 1. Conserver schémas fermés, organisation serveur,
révisions, idempotence, calculs entiers, mouvements compensatoires et audit
atomique. Les trois recettes SQL incluent `tests/business.integration.mjs`.
La recette navigateur optionnelle `PHASE7_BROWSER=true pnpm infra:test` utilise
Chrome/Puppeteer sur la pile PostgreSQL isolée, sans base existante. Voir la revue
pour les variables d'exécutable et les preuves. Aucun déploiement implicite.

## Versionnement

Le numéro produit vient du `package.json` racine ; `orkobi.channel` déclare le
canal sans activer de publication. Lire [DOCS/VERSIONING.md](DOCS/VERSIONING.md).
Les manifests privés suivent la même version ; lancer `pnpm version:check`
(inclus dans `pnpm check`). Ne pas modifier par remplacement global les versions
propres aux manifestes de plugins, les plages de compatibilité, les migrations,
les rapports historiques ou les numéros d'API. Aucun tag/push/publication implicite.
