# Orkobi 0.3.0-dev.1 — Préversion de développement

Préparation locale du **3 novembre 2026**, à la demande de versionnement du porteur.
Canal déclaré : **dev** (`package.json`, `orkobi.channel`). Aucun tag, push,
publication npm, registre Internet, migration de base utilisateur ou déploiement.
La version reste une préversion ; les critères de sortie stable demeurent ouverts.

## Périmètre

Les fondations identité, organisations, SDK, moteur de plugins et Store des
Phases 1 à 6 sont rejointes par le premier périmètre métier de Phase 7 : CRM,
catalogue, devis et préparations de factures, stocks, projets, associations,
documents, rapports et RH administratif. Voir [le guide métier](PHASE_7.md).

France / EUR, sans plateforme agréée configurée : émission fiscale bloquée,
préparations explicitement non fiscales ; hors paie et déclarations sociales.
Le stockage métier utilise `0011_business`, déjà vérifiée localement pendant la
Phase 7. Le changement de numéro n'ajoute ni ne réécrit aucune migration.

Les [preuves de Phase 7](REVIEW_PHASE_7.md) et celles des phases précédentes
restent datées de leur exécution en `0.2.0-EXP`. Elles ne sont pas réétiquetées
comme des recettes de cette nouvelle préversion.

## Cohérence des versions

- 18 manifests privés synchronisés sur la racine, dont SDK, modules officiels et
  package de développement de l'exemple. Les versions fonctionnelles de leurs
  manifestes restent distinctes : `0.1.0` pour les modules officiels, `1.0.0`
  pour `community.cards`. Le protocole des plugins reste **API 1**.
- OpenAPI et contrôle de compatibilité Core, bootstrap BFF et build frontend
  lisent tous la racine. Les fixtures navigateur utilisent cette même version.
- Quatre étiquettes d'images locales Compose alignées. Cela ne construit ni ne
  déploie automatiquement une image ; la pile existante n'est pas redémarrée.
- `pnpm version:check` contrôle les manifests, le canal, les images locales et
  le titre README ; il fait partie de `pnpm check`.
- Plages de compatibilité conservées. Le comparateur minimal accepte la préversion
  `0.3.0-dev.1` dans `>=0.2.0-EXP <0.3.0` ; il refuse la finale `0.3.0`. Ce
  comportement n'est pas celui du résolveur npm. Une finale nécessitera une revue
  explicite des déclarations et une recette correspondante.
- Les rapports historiques, SQL/checksums et versions de protocole sont préservés.

## Vérifications de la préversion

| Contrôle                                                                          | Résultat                                                                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                  | Réussi, aucune mise à jour de dépendance nécessaire au bump                                                                   |
| `pnpm version:check`                                                              | 18 manifests privés, canal dev et quatre images cohérents                                                                     |
| `pnpm check`                                                                      | Format, lint, contrats et **91 tests unitaires** réussis                                                                      |
| `pnpm typecheck`                                                                  | Tous les workspaces réussis                                                                                                   |
| `pnpm sdk:test`                                                                   | Quatre archives en `0.3.0-dev.1`, consommées hors workspace                                                                   |
| `pnpm plugin:build` et `pnpm plugin:validate output/plugins/community.cards.json` | `community.cards@1.0.0` construit et validé, empreinte inchangée                                                              |
| `PHASE7_BROWSER=true pnpm infra:test`                                             | **89 tests PostgreSQL/Redis**, puis HTTP, panne SQL, redémarrage/recréation et persistance                                    |
| Chrome réel sur cette pile isolée                                                 | Version `0.3.0-dev.1` cohérente entre bootstrap et pied de page, neuf routes métier, créations, reprise par URL et impression |
| `git diff --check`                                                                | Réussi                                                                                                                        |

Preuves : `output/infrastructure/51b2e212b2e0/result.json`,
`output/infrastructure/51b2e212b2e0/browser/result.json`,
`output/infrastructure/51b2e212b2e0/browser/quote-print.pdf`,
`output/sdk/manifest.json` et les quatre archives correspondantes. Le navigateur
est Chrome for Testing headless piloté avec Puppeteer. Le test d'erreur/réessayer
injecte une réponse synthétique ; les autres parcours utilisent les vrais services
locaux. Les captures ne sont pas reprises pour un changement de numéro
(`BUSINESS_BROWSER_CAPTURE=false`).

Les conteneurs/réseaux et le fichier de secrets de cette recette sont retirés ;
le volume PostgreSQL de preuve reste conservé. La pile utilisateur existante
n'est pas touchée. Aucun tag ni commit de publication n'est créé.

Les recettes MariaDB/MySQL et Store autonome ne sont pas relancées pour ce seul
changement de numéro. Leurs preuves précédentes restent dans les rapports de
phase et ne sont pas présentées comme exécutées en `0.3.0-dev.1`.

## Pour une publication ultérieure

La [fiche de publication](RELEASE_CHECKLIST.md) reste à compléter pour la cible,
le commit retenu, la recette métier, la restauration sur l'environnement cible
et les approbations de publication/déploiement. Les branches et protections
GitHub ne sont pas modifiées par cette préparation locale.
