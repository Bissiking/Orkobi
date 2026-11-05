# Roadmap UX — Orkobi

## Contexte

Le refresh design a démarré (découpage de `business.tsx` en
`platform/business/`, data router avec `errorElement`, `shell.tsx`,
`module-directory.tsx`, garde des modifications non enregistrées). Cette
feuille de route suit la reprise : amélioration UX à fort levier et
propreté/maintenabilité du code.

Arbitrages confirmés : primitives d'abord dans l'app puis montée au
SDK ; i18n ciblé sur `business/` et `RouteFailure` ; périmètre UX et propreté. Le système visuel normatif reste [DESIGN.md](DESIGN.md) ;
les règles de composants sont dans [DOCS/UI_SDK.md](DOCS/UI_SDK.md).

## État de départ (2026-11-04)

- `pnpm typecheck` OK, `pnpm format:check` OK, `pnpm version:check` OK.
- `node --test tests/*.test.mjs` : 97 OK ; `tests/business-ui.test.mjs` : 6 OK.
- `pnpm lint` : 1 erreur (`tests/business-ui.test.mjs`, `AbortController`)
  qui fait échouer `pnpm check`.
- Travail non commité sur la branche `matheo`.

## Lot 1 — Propreté et déblocage

- [x] 1.1 Globals Node pour `AbortController` dans `tests/business-ui.test.mjs`.
- [x] 1.2 Fusionner `PlatformHeading` dans `PageHeading` avec slot `action`.
- [x] 1.3 Messages réseau dédiés dans `shell.tsx` (au lieu de `t.unknown`
      et `t.forbidden`).
- [x] 1.4 Supprimer le CSS mort de `styles.css` et déduper les sélecteurs
      de `styles.css`, `platform/styles.css` et `platform/business.css`.
- [x] 1.5 Nettoyages ciblés : re-export mort, `normalize` local,
      non-null assertions, ternaire mort de `navigation.tsx`.
- [x] 1.6 `confirmContextChange()` avant le changement d'organisation
      dans `OrganizationList`.
- [x] 1.7 Refus de droit en `Notice tone="error"`, indisponibilité en
      `info` ; remplacer les `<p role="alert">` bruts.

Gate : `pnpm check`, `pnpm typecheck`, `git diff --check`.

## Lot 2 — UX à fort levier

- [x] 2.1 Stale-while-revalidate dans `usePlatformResource` : conserver
      les données au rafraîchissement, flag `refreshing`, fin du
      clignotement blanc.
- [x] 2.2 `Skeleton` et `aria-busy` sur tous les panneaux de chargement.
- [x] 2.3 Primitives partagées, validées dans l’application puis promues dans `sdk/ui/` : `DataTable`,
      `EmptyState`, `StatusPill`, `SearchField`, `ConfirmDialog`
      (remplace les `window.confirm`), `Select`/`CheckField`, `Tabs`.
- [x] 2.4 Feedback de sauvegarde unique (flash workspace, auto-dismiss,
      `aria-live`).
- [x] 2.5 Titre de page par table de routes typée + fil d'Ariane réel.
- [x] 2.6 Titres de modules : consommer `definition.label` bilingue,
      supprimer `moduleTitles`.
- [x] 2.7 Formulaire fiche : badge « Modifications non enregistrées »
      visible, erreur remontée au-dessus des champs avec focus.
- [x] 2.8 Catalogue `business` partagé (fin du double fetch).
- [x] 2.9 Pagination sans pied vide, filtres stables.
- [x] 2.10 i18n ciblé : `RouteFailure.tsx` et `business/**` vers les
      registres de clés.

Gate : `pnpm check`, `pnpm typecheck`, `node --test tests/business-ui.test.mjs`.

## Lot 3 — Accessibilité, responsive, livraison

- [x] 3.1 `scope="col"` sur tous les `<th>` ; retirer `role="table"`
      redondant ; `aria-current` correct sur « Modules » ; un seul
      landmark `<nav>` dans le drawer ; résoudre le conflit de focus
      (`detail.tsx` / `App.tsx`) ; boutons d'action de tableau nommés.
- [x] 3.2 Breakpoints unifiés sur l'échelle DESIGN (620 / 879 / 1180 / 1600) ; retirer le `!important` de `business.css` ; cibles
      tactiles ≥ 40 px ; métadonnées ≥ 11 px.
- [x] 3.3 Formulaires métier sur le wrapper `Field` de la plateforme.
- [x] 3.4 Tests : non-régression SWR, absence de `window.confirm`,
      invariants `scope` / `aria-current`.
- [x] 3.5 `PHASE7_BROWSER=true pnpm infra:test` + revue visuelle
      ordinateur/mobile, clair/sombre, FR/EN.
- [x] 3.6 Montée des primitives stables dans `@orkobi/sdk-ui`
      (composant + export + styles + contrat documenté), après
      validation en app.
- [x] 3.7 Documentation : `CHANGELOG.md`, `DOCS/PHASE_7.md`,
      `DOCS/UI_SDK.md`, `DESIGN.md` si impacté.

Gate final : `pnpm check` + recette navigateur + revue visuelle.

## Hors périmètre

- Convergence des cinq registres i18n en un seul (chantier distinct).
- Découpage de `platform/pages.tsx` (1081 lignes) en sous-fichiers.
- Aucun tag, push, publication ou déploiement.

## Preuves

Reprise du 5 novembre 2026 : les trois lots sont terminés ; les contrôles
unitaires et les recettes SDK/synthétiques sont réussis. Les primitives ont été
validées dans l’application avant leur promotion dans `@orkobi/sdk-ui`.

- `pnpm check` : 99 tests unitaires ; `pnpm typecheck` : workspaces compilés/typés.
- `pnpm sdk:test`, packaging et validation du plugin d’exemple : réussis.
- `pnpm sql:test` : 89 contrôles par moteur MariaDB/MySQL, projets isolés.
- `PHASE7_BROWSER=true WEB_TEST_MODE=dev pnpm infra:test` : 89 contrôles
  PostgreSQL/Redis et 23 contrôles navigateur, vrais Core/BFF/PostgreSQL isolés.
- Revue des captures ordinateur/mobile, clair/sombre et FR/EN ; correction du
  titre mobile et confirmation du build de production : 23 contrôles navigateur
  et 89 contrôles PostgreSQL/Redis réussis.
- Derniers ajustements de géométrie mobile vérifiés dans Chrome/Vite à
  320 / 390 / 620 px, sans débordement.
- `git diff --check` : réussi.

Détails, chemins de preuves, échecs corrigés et limites dans
[DOCS/REVIEW_UX.md](DOCS/REVIEW_UX.md). Les API de la recette SDK sont synthétiques ;
les services SQL des recettes d’infrastructure sont réels et isolés. Aucun test
ne qualifie la production. Aucun tag, push, publication ou déploiement.
