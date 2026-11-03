# Revue de Phase 6 — 3 novembre 2026

Livraison locale **0.2.0-EXP** : API Store indépendante, catalogues signés et
installation contrôlée depuis le Core. Guide : [PHASE_6.md](PHASE_6.md).
Aucun registre Internet ou déploiement utilisateur n’a été ouvert.

## Changements et corrections

- `apps/store`, `lib/store` et `compose.store.yaml` : registre public ou privé,
  lecture seule, autonome vis-à-vis du Core et de SQL. Aucun script d’installation,
  accès aux sessions ERP ou clé privée dans le serveur.
- Publication locale : clés Ed25519 séparées, SHA-256 canonique des paquets,
  catalogue signé avec expiration, séquence, manifestes et moteurs SQL.
  Historique des versions locales conservé même après retrait ; réutilisation
  d’une identité avec un autre contenu refusée par la CLI.
- Configuration des racines de confiance réservée au serveur, sans URL/clé
  utilisateur, redirection réseau ou transmission de cookie. Limites de volume,
  durée et concurrence ; erreurs et logs expurgés.
- Migration append-only `0010_store` pour les trois moteurs : checkpoints anti-rejeu
  et provenance. Les anciens SQL/checksums ne sont pas réécrits.
- Revue liée à l’administrateur, expirant après cinq minutes. Installation liée
  au digest revu, au digest précédent et à la provenance ; revalidation du catalogue,
  des droits et de la compatibilité. Aucune transaction SQL ne reste ouverte pendant
  le téléchargement ou la validation QuickJS.
- Consultation du catalogue depuis une vue de métadonnées SQL sans code source,
  sans requête de dépendance par version. Les dépôts indisponibles ou non fiables
  gardent des états distincts.
- Nouveau droit : déclaration confirmée, accord au rôle séparé. Les accords dormants
  d’anciennes déclarations ne sont pas réactivés ; droits retirés et nouveaux droits
  nettoyés atomiquement lors de la mise à jour. Le même contrôle s’applique à
  l’installation manuelle, dont la provenance est marquée non vérifiée.
- UI SDK native/Papicons, versions, permissions, tables, dépendances, sources,
  compatibilité et nouveaux droits. URL conservée, FR/EN, thèmes et mobile.

## Validation

| Contrôle                                     | Résultat                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                 | 83 tests unitaires, format, lint et contrats réussis                                                          |
| `pnpm typecheck`                             | Tous les workspaces compilés et typés                                                                         |
| `pnpm infra:test`                            | 74 tests PostgreSQL/Redis et recette réelle de panne/redémarrage/persistance                                  |
| `pnpm sql:test`                              | 74 tests par moteur alternatif, puis piles réelles HTTP, panne, pause SQL, redémarrage/recréation/persistance |
| `pnpm store:test`                            | Registre seul dans Docker : public/privé, signature, intégrité, versions immuables, retrait et redémarrage    |
| `pnpm sdk:test`                              | Quatre archives et consommation hors workspace                                                                |
| `pnpm plugin:build` / `pnpm plugin:validate` | Plugin construit et validé avec succès                                                                        |
| `tests/browser/phase6.mjs`                   | Chrome headless, API synthétiques : parcours réussi                                                           |
| `git diff --check`                           | Réussi                                                                                                        |

Preuves conservées :

- PostgreSQL/Redis : `output/infrastructure/99c5de1ff14f/result.json`.
- MariaDB/MySQL : `output/sql-engines/ce622c048022/result.json`, avec les logs de suites.
- Store Docker autonome : `output/store/da55e6b19573/result.json`.

Les trois recettes ont terminé avec code 0. Leurs conteneurs/réseaux et secrets
temporaires ont été nettoyés. Seuls les trois conteneurs de l'instance existante
restaient actifs après recette ; aucun redéploiement de cette instance n'a été lancé.
Les nombres de tests incluent les groupes et sous-tests Node.

Les tests SQL réutilisent le même Core/BFF avec les adaptateurs livrés. Le Store de
la recette démarre dans un **autre processus**, sans variables SQL/Core, avec API
HTTP et signatures réelles. Un endpoint hostile synthétique teste également une
clé étrangère. Les fixtures et secrets sont créés uniquement pour ces recettes.

Les scénarios Store couvrent :

- dépôts public et privé, bearer absent refusé, session/administrateur requis ;
- clé inconnue, source non fiable et absence de secrets dans les réponses/logs ;
- revue, confirmation et installation désactivée, sans nouveau droit implicite ;
- mise à jour active refusée, désactivation puis mise à jour additive ;
- accord dormant simulé pour la nouvelle permission, puis suppression vérifiée ;
- incompatibilités Core, SDK et SQL, et dépendance absente ;
- revue retirée du catalogue et downgrade refusés ;
- checkpoint persistant et catalogue plus ancien refusé après redémarrage ;
- Store arrêté : session, activation et lecture des données déjà installées restent
  utilisables, y compris les données antérieures à l’ajout d’un champ.

Les tests unitaires vérifient signature Ed25519, altération du manifeste/paquet,
identité du dépôt, expiration, clés/configurations invalides, bearer et méthodes
HTTP, limites de réponse et refus d’une redirection réseau.
La recette de publication teste aussi le refus de modifier une version retirée,
puis sa republication à l’identique.

## Revue visuelle

Captures : `output/playwright/phase6-*`. Ordinateur 1440×1050 FR clair, mobile
390×844 EN sombre et FR clair. Première inspection, puis confirmation après une
seule correction groupée : onglets d’administration visibles sur plusieurs lignes
et versions/actions empilées sur mobile. La version et l’action Examiner restent
accessibles sans défilement horizontal du tableau. Pas d’erreur JavaScript ni de
débordement de page constaté.

La recette vérifie les cases obligatoires avant mise à jour, le payload de
confirmation, l’état réussi, les erreurs/reprises, les sources indisponibles et non
fiables, l’état vide, l’URL et le refus d’affichage pour un non-administrateur.
Ces API navigateur sont synthétiques ; elles ne constituent pas une session de
bout en bout dans une instance déployée. Les contrôles HTTP/SQL réels sont séparés.

Le détecteur Impeccable a signalé douze avis typographiques sur les règles CSS
préexistantes, sans défaut bloquant sur l’ajout. Le système visuel existant est conservé.

## Limites et opérations distinctes

- API déployable séparément et exécutée localement ; aucun domaine, serveur public,
  secret de production, publication npm ou registre externe modifié.
- Les badges officiel/communautaire/privé correspondent à la configuration locale
  des sources, pas à une certification universelle de l’auteur.
- Signatures et empreintes prouvent source choisie et intégrité ; elles ne certifient
  pas l’innocuité d’un plugin. Les frontières QuickJS/SDK de Phase 4 restent nécessaires.
- Pas de TUF complet, quorum, transparence publique ou révocation globale automatique.
  Retirer une version du catalogue ne désactive pas les installations existantes.
- Les nouvelles installations/mises à jour distantes nécessitent un catalogue
  courant vérifié. Aucun cache expiré n’est utilisé comme autorité de confiance.
- Les revues en mémoire sont perdues au redémarrage et ne sont pas partagées entre
  plusieurs Core : une confirmation doit rejoindre le Core qui a produit la revue.
  Une exploitation multiinstance exige une affinité ou une future persistance contrôlée.
- Limites API 1 : cinq dépôts, 40 versions par catalogue, 256 Kio de contenu de catalogue,
  paquet de 90000 octets, deux opérations réseau Store simultanées, 50 revues par Core.
- Pas de facturation, dépôt auteur par navigateur, sélection automatique de source,
  mise à jour silencieuse ou collecte de télémétrie.
- Les volumes de recette SQL et fichiers publics de preuve sont conservés ; les
  conteneurs/réseaux et secrets temporaires des recettes sont nettoyés.
