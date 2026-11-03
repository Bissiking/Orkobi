# Revue de Phase 7 — 3 novembre 2026

Preuves initiales du périmètre métier exécutées en **0.2.0-EXP**, France / EUR, selon les réponses du porteur.
Neuf modules officiels sont livrés dans ce périmètre. Sans plateforme agréée,
les factures restent des préparations internes non fiscales ; l'émission est
bloquée. Les conditions de version stable restent ouvertes dans la roadmap.
La préversion produit est ensuite préparée en [0.3.0-dev.1](RELEASE_0_3_0_DEV_1.md) ;
les preuves ci-dessous conservent leur version d’exécution initiale.
Le [guide](PHASE_7.md) détaille les fonctions, règles, quotas et consignes IA.

## Implémentation et corrections

- Contrats publics SDK et paquet `modules/business` : manifestes et règles pures,
  sans import interne, SQL ni NestJS. Le Core fournit un port autorisé ; ce port
  n'est pas ajouté au guest tiers QuickJS API 1.
- Neuf manifestes officiels désactivés par défaut, dépendances vérifiées,
  permissions explicites `orkobi.<module>:…`. Correction de la collision entre
  les adhérents associatifs et les appartenances `members:*` du Core.
- Migration append-only `0011_business` sur PostgreSQL, MariaDB et MySQL : fiches
  liées à l'organisation, révisions, compteurs, reçus d'idempotence et pièces.
  Aucun ancien SQL/checksum modifié. Les sondes d'échec des tests passent à 0012.
- Écritures, soldes/compteurs, audit et reçu engagés atomiquement. Reprise d'une
  requête déjà engagée sans double effet ; droits contrôlés avant le rejeu.
  Contrôle des références et des activations à chaque transaction.
- Devis : calcul entier des lignes et TVA, numérotation, snapshots immuables,
  preuve d'accord et conversion unique en préparation non fiscale. Blocage
  explicite de l'émission ; aucun appel fournisseur simulé comme opérationnel.
- Stocks : concurrence sérialisée, refus des soldes négatifs, mouvement inverse
  tracé ; refus du changement de nature d'un produit avec un solde détenu.
- Projets : pas de clôture avec des tâches ouvertes ; réouverture contrôlée.
  Cotisations : unicité adhérent/période et règlement non réinscriptible. La clé
  de période est encodée en ASCII pour préserver les accents sur les trois SQL.
- RH : approbation indépendante de l'écriture, contrôle du contrat et des
  chevauchements. Un congé approuvé ne s'archive pas ; un contrat ne peut pas
  exclure des congés déjà approuvés.
- Rapports : sommes converties en texte côté SQL avant le décodage du pilote,
  pour préserver les centimes au-delà de la précision des nombres JavaScript.
  Une fixture de 9 008 montants bornés vérifie exactement `9007199254740993`
  centimes ; ces lignes SQL de test sont retirées après la mesure.
- Documents : formats et signatures bornés, taille/quota, intégrité SHA-256,
  téléchargement autorisé audité sans aperçu actif. Rapports SQL complets,
  respectant les droits de lecture propres à chaque module, notamment RH.
- Écrans avec SDK UI/Papicons et CSS natif, langue et thème, URL persistante,
  pagination et références paginées. Correction du sélecteur dont la valeur
  pouvait disparaître à l'arrivée des options ; clés stables des lignes de
  devis, erreurs métier traduites et champs texte adaptés aux thèmes. Impression
  limitée au document courant, sans masquer les autres pages de l’application ni
  conserver des pages blanches dues au formulaire.

## Validation

Les recettes emploient exclusivement des projets Docker isolés, des comptes et
contenus de test. Les résultats et chemins de preuve sont consignés ci-dessous. Ils ne prouvent ni production ni conformité fiscale.

| Contrôle                                                                            | Résultat                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm check`                                                                        | Format, lint, contrats et **89 tests unitaires réussis**                           |
| `pnpm typecheck`                                                                    | Tous les workspaces compilés et typés                                              |
| `PHASE7_BROWSER=true pnpm infra:test`                                               | **89 tests PostgreSQL/Redis**, HTTP Core/BFF, panne/reprise, persistance et Chrome |
| `pnpm sql:test`                                                                     | **89 tests par moteur**, HTTP et pannes SQL, pause, redémarrage et persistance     |
| `pnpm sdk:test`                                                                     | Quatre archives consommées hors workspace                                          |
| `node scripts/test-sdk-artifacts.mjs`                                               | Import du nouveau port métier depuis les archives ; absence côté guest             |
| `pnpm plugin:build` puis `pnpm plugin:validate output/plugins/community.cards.json` | Plugin d'exemple construit et validé                                               |
| `pnpm store:test`                                                                   | Store Docker autonome : public/privé, signature, intégrité et redémarrage réussis  |
| `git diff --check`                                                                  | Absence d'erreurs de whitespace                                                    |

Preuves locales conservées :

- PostgreSQL/Redis : `output/infrastructure/9fa18e14b516/result.json`.
- Navigateur réel : `output/infrastructure/9fa18e14b516/browser/result.json` et
  `quote-print.pdf` (assertion d'une page pour le devis court).
- MariaDB/MySQL : `output/sql-engines/d47cffc35923/result.json` et logs des suites.
- Store autonome : `output/store/fec60b8090d9/result.json`.
- Captures de recette avant la correction d'impression :
  `output/infrastructure/0e7e68f2b66e/browser/` (ordinateur FR clair, mobile EN sombre).
  Les parcours fonctionnels finaux ont ensuite été rejoués sans nouveau tour de
  captures (`BUSINESS_BROWSER_CAPTURE=false`). Aucun défaut de débordement
  horizontal détecté sur les routes vérifiées à 390 px.
- Détecteur Impeccable sur les quatre nouveaux fichiers d'interface : code 0,
  aucun signalement ; vérification distincte de l'inspection Chrome.

Les contrôles du port métier sont aussi compilés hors workspace depuis les archives
SDK. Les gardes de compensation avec référence archivée ou inaccessible ont des
cas unitaires dédiés ; le parcours de compensation principal passe sur les vrais SQL.

### Portée des suites métier SQL

`tests/business.integration.mjs` contient 14 sous-tests et leur suite parent :
activation et absence de droits implicites, CRM/isolation/concurrence, catalogue
et replay, devis/snapshots, accord et blocage fiscal, stock concurrent et
compensation, tâches/clôture, cotisations, RH, documents, pagination/rapports,
rollback sur échec d'audit, sommes supérieures à `Number.MAX_SAFE_INTEGER` et désactivation. Les autres suites des Phases 1 à 6
restent exécutées par les mêmes recettes. Les quantités et montants sont réels
dans les bases locales de test ; les identités et documents sont synthétiques.

### Navigateur

`tests/browser/phase7.mjs` pilote Chrome for Testing headless via Puppeteer sur
la pile PostgreSQL/Core/BFF isolée de la recette. Connexion réelle, sélection
d'organisation, création CRM et devis, rechargement d'URL, références, neuf routes,
rapports, administration et impression. Une panne de lecture de stock est injectée
uniquement pour vérifier l'état erreur et le bouton Réessayer ; elle ne remplace
pas les pannes SQL réelles des recettes d'infrastructure.

```sh
PHASE7_BROWSER=true \
PUPPETEER_MODULE=/chemin/vers/puppeteer-core.js \
CHROME_EXECUTABLE=/chemin/vers/chrome \
pnpm infra:test
```

Sur une machine disposant du paquet `puppeteer` et de son Chrome, les deux dernières
variables sont facultatives. La recette conserve ses volumes de preuve et retire
ses conteneurs, réseaux et fichiers de secrets. La pile utilisateur existante
n'est pas ciblée. Les captures sont des données de recette, pas des données réelles.

## Limites et suite

- Aucun déploiement, publication npm, registre Internet ou action sur une base
  utilisateur. La nouvelle migration reste à appliquer explicitement sur la cible.
- Aucune émission/réception réglementaire, Factur-X/UBL/CII, avoir, e-reporting,
  comptabilité, paie, DSN ou reçu fiscal. Les préparations ne doivent pas être
  utilisées comme factures fiscales. Les sources DGFiP/Service Public et le
  périmètre exact sont indiqués dans le guide.
- Documents stockés en SQL : 48 Kio par pièce, 10 Mio par organisation. Aucun
  antivirus, S3, archivage probant ou purge automatique. Pas d'effacement métier
  destructif ; l'archivage n'est pas un effacement de données personnelles.
- Références et listes paginées : le filtre texte de l'interface ne porte que
  sur la page courante. Les rapports agrègent toutes les fiches autorisées.
- Les approbations RH sont organisationnelles, sans chaîne de validation par
  manager ni calcul automatique de droits à congés. Les informations sensibles
  hors schéma sont refusées ; définir conservation et procédures RGPD avant usage.
- Verrou d'administration global conservé : sûreté de concurrence au prix d'un
  débit limité, sans qualification multi-nœuds ou haute charge. Les tests locaux
  ne prouvent pas les sauvegardes/restaurations ou les conditions d'exploitation
  de l'environnement cible.
- La sortie stable exige recette utilisateur, validation métier/réglementaire,
  qualification d'exploitation et décision explicite. Les cases de la roadmap
  couvrent le périmètre expérimental, jamais une certification générale de l'ERP.
