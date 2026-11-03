# Documentation Orkobi

## Reprendre le développement

Les consignes persistantes pour les agents sont dans [AGENTS.md](../AGENTS.md).
Lire d’abord [ROADMAP.md](ROADMAP.md), puis le guide de la phase concernée.
`package.json` racine est la source de vérité pour la version produit. Une case
cochée doit renvoyer à une implémentation et à une vérification ; elle n’autorise
ni publication ni déploiement.

| Besoin                                                                 | Référence                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Phase 3, identité avancée, MFA, OIDC et intégrations                   | [PHASE_3.md](PHASE_3.md)                                                     |
| Plugins tiers, format de paquet, moteur isolé et démarrage développeur | [PHASE_4.md](PHASE_4.md)                                                     |
| Preuves et limites de la Phase 4                                       | [REVIEW_PHASE_4.md](REVIEW_PHASE_4.md)                                       |
| Cache facultatif, Redis, jobs et handlers de modules                   | [JOB_ENGINE.md](JOB_ENGINE.md)                                               |
| UI et styles natifs partagés, Papicons, règles pour les IA             | [UI_SDK.md](UI_SDK.md)                                                       |
| Résultats, corrections et limites de la revue de Phase 3               | [REVIEW_PHASE_3.md](REVIEW_PHASE_3.md)                                       |
| Contrats publics et limites des plugins                                | [SDK.md](SDK.md)                                                             |
| Modules, données et capabilities                                       | [PHASE_2.md](PHASE_2.md)                                                     |
| Installation, comptes et organisations                                 | [PHASE_1.md](PHASE_1.md)                                                     |
| Installation Docker, SQL, sauvegardes et migrations                    | [INFRASTRUCTURE.md](INFRASTRUCTURE.md)                                       |
| Shell React, BFF et historique du frontend                             | [FRONTEND_BFF.md](FRONTEND_BFF.md)                                           |
| Architecture et Core HTTP                                              | [ARCHITECTURE.md](ARCHITECTURE.md), [CORE.md](CORE.md)                       |
| Versions, branches et publication                                      | [VERSIONING.md](VERSIONING.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) |

Les anciens rapports datent leurs preuves : ils ne décrivent pas automatiquement
la surface actuelle. Les guides de phase et les contrats compilés prévalent sur
les descriptions historiques du bootstrap. `Cahier_des_charges.md` conserve la
vision produit ; les fonctions disponibles et restantes sont dans la roadmap.
