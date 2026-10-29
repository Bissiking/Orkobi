# Revue des étapes techniques 0.1 et 0.2

Revue locale du 29 octobre 2026. Le périmètre correspond aux sections
« 0.1 — Initialisation » et « 0.2 — Backend Core » de la phase 0 de la roadmap,
pas aux versions produit 0.1.0-EXP et 0.2.0.

L'initialisation est validée. Le dernier point du Backend Core est livré :
contrats applicatifs des services, injection NestJS et adaptation vers le SDK.
Les fournisseurs métier sont explicitement indisponibles. Les modifications
déjà présentes dans l'arbre de travail ont été conservées ; aucun commit,
push, déploiement ou publication n'a été réalisé.

## Méthode et skills

- `security-best-practices` : lecture du guide Express applicable à l'adaptateur
  de NestJS ; contrôle des entrées, erreurs, logs, paramètres réseau, dépendances
  et frontières du SDK. Aucun frontend React n'existe dans ce périmètre.
- `playwright` : utilisation de `playwright-cli` avec Chrome headless pour
  exercer la documentation Swagger et son appel HTTP réel à `/health`.
- Les skills GitHub/CI n'ont pas été nécessaires pour cette revue locale.
  Aucune modélisation exhaustive des menaces n'est revendiquée.

## Revue de la 0.1

| Critère            | Preuve dans le dépôt et contrôle local                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Git et monorepo    | Dépôt existant ; packages privés et emplacements applicatifs préservés                                |
| pnpm Workspaces    | `pnpm-workspace.yaml`, dépendances `workspace:*`, installation avec lockfile figé                     |
| TypeScript         | Configuration stricte NodeNext ; huit packages exécutables compilés et consommateurs vérifiés         |
| ESLint et Prettier | Scripts communs, `pnpm check` ; artefacts navigateur exclus des contrôles source                      |
| Environnement      | `.env.example` sans secret ; variantes privées ignorées ; configuration invalide rejetée avant écoute |
| Conventions SDK    | Exports explicites, imports internes interdits, aucun SQL/OIDC public ; tests d'import et de types    |
| Développement      | `pnpm dev`, réponse HTTP réelle, recompilation après changement de source et arrêt du processus       |
| Tests              | Runner Node.js, tests de refus par défaut, de contrats et de HTTP sur ports éphémères                 |

## Constats et corrections

### R01 — Interfaces applicatives absentes : corrigé

Priorité fonctionnelle : nécessaire pour fermer l'étape 0.2.
Les interfaces publiques existaient dans `sdk/core`, mais aucun raccord
applicatif n'était présent dans le Core.

- `apps/core/src/services/contracts.ts:12` : lectures d'identité et d'organisation,
  permissions et capabilities ; contexte d'organisation obligatoire et `Result<T>`.
- `apps/core/src/services/services.module.ts:13` : enregistrement et export des
  jetons NestJS ; fournisseurs d'indisponibilité par défaut.
- `apps/core/src/services/sdk-factory.ts:27` : façade SDK liée à une copie gelée
  du contexte, délégation à chaque appel, sans cache des permissions.
- `tests/core-services.test.mjs` et `tests/types/core-services.ts` : injection
  réelle dans Nest, erreurs explicites, contextes synthétiques distincts,
  immuabilité et usages TypeScript interdits.

La factory est une adaptation interne. Elle ne certifie pas un contexte reçu et
ne vérifie pas de session. Le futur Core devra établir et autoriser le contexte,
puis chaque service devra vérifier l'état et les droits courants.

### R02 — En-têtes navigateur manquants : corrigé

Sévérité : faible sur le socle local actuel ; mesure de protection supplémentaire
pour la documentation HTML. Règle du skill : `EXPRESS-HEADERS-001`.
Le bootstrap réduisait l'identification du serveur avec `x-powered-by` désactivé,
mais n'activait pas les protections CSP, anti-interprétation de type et de cadrage.
Sans ces en-têtes applicatifs, leur présence aurait dépendu d'un éventuel proxy,
dont aucun n'est configuré ou vérifié ici.

`apps/core/src/application.ts:20` active `useSecurityHeaders()`, déjà disponible
dans NestJS 12.3.2 : scripts de même origine, `nosniff`, `SAMEORIGIN` et
`no-referrer`, également sur erreurs et Swagger. Aucun script arbitraire n'est
autorisé par cette modification. Le Core étant servi en HTTP local, HSTS et
la conversion implicite des ressources vers HTTPS ne sont pas activés.
Swagger est exercé en navigateur pour vérifier la compatibilité de la CSP.

Références officielles : [en-têtes NestJS](https://docs.nestjs.com/techniques/security/cors),
[providers personnalisés](https://docs.nestjs.com/fundamentals/custom-providers),
[SwaggerModule](https://docs.nestjs.com/openapi/introduction).

## Vérification de la 0.2

| Critère            | Preuve                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Application NestJS | Bootstrap ESM, fermeture sur signaux, démarrage réel                                                              |
| Configuration      | Valeurs locales, configuration gelée, validation avant écoute                                                     |
| Erreurs communes   | Tests 400/401/403/404/409/413/429/500/503 et absence de détails sensibles                                         |
| Logs structurés    | Lignes JSON, UUID serveur, sentinelles sensibles absentes des logs testés                                         |
| Vitalité           | `/health` en HTTP réel et via Swagger ; aucune dépendance SQL annoncée                                            |
| OpenAPI interne    | Désactivé par défaut, JSON et ressources Swagger absents ; activation et appel réels vérifiés                     |
| Interfaces Core    | Contrats contextualisés, jetons injectables et factory SDK ; erreur `unavailable` tant que le métier n'existe pas |

## Validations exécutées

Environnement : macOS, Node.js 24.19.0, pnpm 12.16.1.

- Avant changements : `pnpm check`, 24 tests réussis.
- Après changements : `pnpm check`, formatage et lint réussis, huit compilations,
  contrats TypeScript et 27 tests réussis.
  La première vérification finale a relevé le formatage du nouveau brouillon
  `ORKOBI_VERSIONING.md` ; seule sa présentation a été normalisée avant relance.
- `pnpm typecheck` : tous les packages et consommateurs vérifiés.
- `pnpm install --frozen-lockfile` : réussi ; `pnpm peers check` : aucun conflit.
- `pnpm audit --prod` : aucune vulnérabilité connue signalée par le registre
  interrogé à cette date ; ce contrôle n'est pas une preuve d'absence de faille.
- `pnpm dev` sur loopback : `/health` HTTP 200, modification du mtime de
  `services/contracts.ts`, recompilation et réponse après redémarrage ; Ctrl+C
  et libération du port vérifiés.
- Chrome headless via Playwright, serveur réel local : ouverture de Swagger,
  développement de `GET /health`, « Try it out », « Execute », réponse HTTP 200.
  La capture locale figure dans `output/playwright/orkobi-core-swagger.png`
  (artefact ignoré par Git).
- `git diff --check` : réussi.

## Limites et suite

Les interfaces sont préparées ; identité, organisations, permissions et catalogue
de capabilities n'ont pas encore d'implémentations métier persistantes.
`unavailable` ne signifie ni permission accordée ni capability absente.
`forAuthorizedContext` n'est pas un endpoint ouvert aux modules ou au navigateur.

Les tests de contextes sont synthétiques et prouvent l'adaptation du SDK, pas
l'isolation des organisations dans une base SQL. Aucun PostgreSQL, migration,
session, authentification, BFF, frontend React ou audit métier n'est livré.
Le logger technique ne remplace pas l'audit métier et ne trace actuellement que
les réponses terminées (`finish`), sans journal des connexions abandonnées.
Aucun contrôle en production ou sous Windows n'a été réalisé.

Les étapes 0.1 et 0.2 peuvent être cochées pour ce périmètre technique.
La suite est la 0.3 (frontend/BFF), puis la 0.4 (infrastructure).
Les critères de la version produit 0.1.0-EXP et la phase produit 0.2.0 restent ouverts.
