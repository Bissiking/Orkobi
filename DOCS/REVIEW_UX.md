# Reprise UX — 5 novembre 2026

Reprise du travail OpenCode non commité sur la branche `matheo`, en
`0.3.0-dev.1`. La [roadmap](../ROADMAP_UX.md) porte le suivi ; le
[guide SDK UI](UI_SDK.md) décrit les contrats publics.

## Résultat

- Conservation du découpage métier commencé : espace, navigation, listes,
  fiches, édition, actions, documents, rapports et références partagées.
- Catalogue de déclarations partagé entre le shell, les modules, l’administration
  et l’espace métier. Le fournisseur est recréé au changement d’utilisateur ou
  d’organisation. Aucune session ni décision de permission n’est mise en cache.
- Actualisation sans retirer les données de l’URL courante, état `refreshing` et
  `aria-busy`, annulation des lectures anciennes. Un nouveau chemin ne rend pas
  les données de l’ancien chemin. Squelettes réservés au premier chargement.
- Titres et fil d’Ariane issus d’une table de routes typée et des libellés
  bilingues des déclarations. Suppression du registre parallèle `moduleTitles`.
- Confirmations asynchrones partagées, garde avant navigation/changement
  d’organisation, focus Annuler, Échap/voile et garde native de fermeture de page.
  Une deuxième demande simultanée est refusée ; un démontage résout l’attente.
- Badge de modifications, ajout/retrait de lignes de devis détecté, résumé
  d’erreur avant les champs avec focus, sauvegarde annoncée une seule fois,
  fermable et retirée après six secondes. Le rechargement explicite d’une fiche
  remonte un formulaire neuf, indisponible pendant sa revalidation.
- Filtres conservés dans l’URL, option de statut sélectionnée conservée même
  lorsqu’elle est absente de la page, historique de curseurs cohérent avec le
  retour navigateur, absence de boutons de pagination inutiles.
- Primitives répétées validées dans l’application puis promues dans `sdk/ui` :
  tableaux/en-têtes, états vides, statuts, recherche, sections, sélection, checkbox,
  texte multiligne et confirmation. Styles natifs, exports publics et aucun import
  de contexte applicatif ni traduction dans le SDK.
- En-têtes de table avec `scope="col"`, actions nommées, un seul `<nav>` dans
  le tiroir mobile, état courant de Modules également dans les sous-routes,
  focus de route centralisé, breakpoints normatifs et métadonnées de 11 px minimum.
- 116 libellés métier déplacés dans `business-copy.ts`, messages de panne de route
  dans `platform/copy.ts` ; conservation des déclarations et registres existants.
  Les cinq registres i18n restent séparés, conformément au hors-périmètre.

## Vérifications et preuves

| Contrôle                                                                            | Résultat                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                        | 99 tests unitaires réussis ; versions, format et lint vérifiés.                                                                           |
| `pnpm typecheck`                                                                    | Compilation et typage de tous les workspaces réussis.                                                                                     |
| `node --test tests/business-ui.test.mjs tests/ui.test.mjs`                          | 10 cas : références, invalidation, affichage exact, annulation réseau, confirmations/sémantique et contrats UI. Inclus dans `pnpm check`. |
| `pnpm sdk:test`                                                                     | Quatre archives consommées hors workspace ; imports et typage des primitives UI et du port métier.                                        |
| `pnpm plugin:build` puis `pnpm plugin:validate output/plugins/community.cards.json` | Plugin d’exemple construit et validé localement.                                                                                          |
| `pnpm sql:test`                                                                     | 89 contrôles par moteur, MariaDB et MySQL ; HTTP, pannes, reprises, recréation et persistance.                                            |
| Recette SDK synthétique, build puis `WEB_TEST_MODE=dev`                             | Ordinateur/mobile, FR/EN, clair/sombre, jobs, reprise d’erreur, profil, intégrations et icônes.                                           |
| `PHASE7_BROWSER=true WEB_TEST_MODE=dev pnpm infra:test`                             | 89 contrôles PostgreSQL/Redis et 23 contrôles navigateur réussis sur Core/BFF/PostgreSQL isolés.                                          |
| Recette finale sur build de production                                              | 89 contrôles PostgreSQL/Redis et 23 contrôles navigateur réussis ; bundle construit pour production, services locaux isolés.              |

Preuves conservées :

- Vite et vrais services : `output/infrastructure/47fe332e4f69/result.json` et
  `browser/result.json`, PDF du devis d’une page et cinq captures.
- Build de production et vrais services : `output/infrastructure/de3fb688862d/result.json`,
  `browser/result.json`, cinq captures et PDF.
- MariaDB/MySQL : `output/sql-engines/8d281ee5ff1a/result.json` et logs des suites.
- Archives SDK : `output/sdk/manifest.json`, paquet d’exemple dans `output/plugins/`.
- Recette synthétique : captures `output/playwright/phase3-*` et `phase3-dev-*`.
- Géométrie mobile sur code courant : `output/playwright/ux-mobile-layout.json` ;
  API synthétiques, largeurs 320 / 390 / 620 px, menu et contrôles sur la même ligne,
  en-tête de 82 px, liens de fiche de 40 px et aucun débordement horizontal.
- Détecteur Impeccable (`output/playwright/ux-design-detector.json`) : code 0, aucun signal non consultatif ; 65 avis (62 tailles,
  3 couleurs), issus de l’écart du frontmatter/sidecar avec les tailles existantes
  décrites dans DESIGN et des couleurs d’impression/voile. Sidecar non régénéré.

La revue de cinq captures a couvert modules et édition de devis en FR clair,
fiche de devis et contacts en EN sombre/mobile, permissions en EN clair.
Le titre coupé dans l’en-tête mobile a été corrigé par une seconde ligne de
contexte ; les doublons de libellés module/entité ont été retirés du fil d’Ariane.
Les liens de fiche et de retour métier ont également une hauteur tactile de 40 px.
La seconde passe visuelle a confirmé les titres lisibles et les parcours conservés.
Le verrouillage final de l’en-tête sur une grille à deux lignes et l’élargissement
final des liens sont postérieurs aux captures ; ils sont contrôlés séparément dans
Chrome/Vite avec API synthétiques par les mesures ci-dessus, puis par le build
et les contrôles de clôture. Ces mesures ne sont pas une nouvelle preuve SQL.

Deux premières recettes navigateur ont échoué : ancien sélecteur de statut,
puis absence effective d’`aria-current` sur Modules (`NavLink` retire cet attribut
hors de sa route). Le sélecteur est adapté ; Modules utilise désormais un lien
avec état de section explicite. Ces échecs ne sont pas comptés comme validations.

Les contrôles utilisent des identités et documents synthétiques. Les projets
Docker sont isolés, avec secrets temporaires et volumes de preuve conservés.
Aucune base utilisateur n’est ciblée.

## Limites

- Le filtre texte porte sur la page SQL chargée (100 fiches maximum), pas sur
  l’ensemble des données. Une URL de curseur ouverte directement donne accès à
  Première page ; Précédent exige une page précédente connue pendant la navigation.
- Les tests navigateur contrôlent focus, interactions et sémantique automatisables ;
  ils ne constituent pas une recette manuelle avec lecteur d’écran ou appareil
  physique. Chrome for Testing est piloté en headless par Puppeteer.
- Les refus/erreurs réseau de recette explicitement injectés restent synthétiques ;
  connexion, écritures, téléchargements, droits et SQL sont réels dans les piles
  isolées. Les conditions d’exploitation d’une cible ne sont pas qualifiées ici.
- Le changement Core déjà commencé conserve `unit` et `exemption` dans la projection
  des produits pour estimer les lignes de devis. Aucun dépôt SQL, schéma, migration,
  checksum, session ou règle fiscale n’est modifié par cette reprise.
- France/EUR, préparations de factures non fiscales, émission/transmission bloquées
  sans plateforme agréée. Aucun fournisseur externe ou service indisponible n’est
  présenté comme opérationnel. Pas de publication, push, tag ou déploiement.
