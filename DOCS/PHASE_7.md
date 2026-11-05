# Phase 7 — Modules métier expérimentaux

Périmètre validé avec le porteur : **France, EUR**, sans plateforme agréée de
facturation électronique configurée. Version produit actuelle : **0.3.0-dev.1**.
La livraison couvre neuf modules officiels avec règles métier, droits, stockage
et écrans. Elle ne constitue pas une version stable ni une certification fiscale.
Voir [la revue et ses preuves](REVIEW_PHASE_7.md).

## Mise en route

1. Appliquer les migrations avec le compte de migration, selon
   [INFRASTRUCTURE.md](INFRASTRUCTURE.md). `0011_business` est nouvelle ; les
   migrations précédentes restent inchangées. Aucun déploiement n'est automatique.
2. Se connecter avec un administrateur plateforme et ouvrir
   **Administration → Modules ERP** (`/admin?tab=business`).
3. Activer les modules nécessaires au niveau plateforme, puis choisir
   l'organisation, le rôle et accorder explicitement les permissions.
4. Un administrateur d'organisation active les modules depuis **Modules**.
   Activer CRM et Catalogue avant Ventes ; Catalogue avant Stocks.
5. Ouvrir le module. L'organisation active vient exclusivement de la session
   serveur. Les URL `/business/<module>/<entité>/<id>` reprennent la fiche au
   rechargement ; les filtres et curseurs restent dans la query string.

Le propriétaire d'organisation ne reçoit aucun droit métier implicite.
Les permissions `orkobi.members:*` des adhérents sont distinctes de
`members:*`, qui contrôle les appartenances à l'organisation. Chaque action
requiert `orkobi.<module>:read` et, pour modifier, `:write`. Les décisions RH
requièrent `orkobi.hr:approve` en plus de `:read`, indépendamment de `:write`.
L'administrateur plateforme attribue des droits mais n'accède pas automatiquement
aux données des organisations.

## Fonctions et règles par module

| Module / URL                     | Fonction livrée                                                                                     | Règles et limite du périmètre                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM `/business/crm`              | Contacts personnes/entreprises, prospects/clients, coordonnées, archives                            | Champs fermés, e-mail/SIREN/pays contrôlés ; aucune synchronisation externe ni vérification d'identité de l'entreprise                                              |
| Catalogue `/business/products`   | Biens et services, référence, unité, prix HT, TVA                                                   | Référence unique dans l'organisation, décimaux exacts, motif exigé au taux nul ; pas de change, remises ou tarification avancée                                     |
| Ventes `/business/sales`         | Identité commerciale, devis chiffrés et numérotés, accord/refus, préparation de facture, impression | Voir ci-dessous ; aucun encaissement, avoir, comptabilité ni émission fiscale                                                                                       |
| Stocks `/business/stock`         | Entrepôts, entrées/sorties, soldes et compensation tracée                                           | Biens seulement, quantités au millième, aucun solde négatif ; mouvements immuables, correction par mouvement inverse ; pas de réservation, lots ou valorisation     |
| Projets `/business/projects`     | Projets, budgets indicatifs et tâches à démarrer/terminer/rouvrir                                   | Pas de clôture avec tâche ouverte, dates ordonnées, référence unique ; pas de facturation du temps                                                                  |
| Associations `/business/members` | Adhérents et cotisations par période, enregistrement du règlement                                   | Numéro unique, couple adhérent/période unique, montant positif ; règlement non réinscriptible ; pas de prélèvement, reçu fiscal ou remboursement                    |
| Documents `/business/documents`  | Dépôt, titre, téléchargement et archivage                                                           | PDF/PNG/JPEG/texte UTF-8, 48 Kio par pièce et 10 Mio par organisation ; empreinte SHA-256 ; pas de S3, antivirus, OCR ou archivage probant                          |
| Rapports `/business/reports`     | Comptages et montants groupés par module, entité et état                                            | Agrégats SQL sur toutes les fiches ; seuls les modules actifs actuellement autorisés apparaissent ; devis et préparations ne sont pas du chiffre d'affaires facturé |
| RH `/business/hr`                | Annuaire administratif et demandes de congé, approbation/refus                                      | Période incluse dans le contrat, chevauchement des congés approuvés refusé ; hors paie, NIR, informations médicales, DSN et calcul des droits à congés              |

Les données personnelles sont limitées aux champs déclarés. Les rapports RH
requièrent à la fois le droit aux rapports et la lecture RH. Le périmètre
actuel ne fournit pas d'automatisation de conservation/effacement RGPD ; une
politique de conservation et une procédure d'exercice des droits sont à définir
avant un usage réel. L'archivage masque une fiche ; il ne l'efface pas.

## Devis et préparations : France / EUR

Le catalogue propose les taux 20 %, 10 %, 5,5 %, 2,1 % et 0 % avec motif. Le taux
applicable reste à déterminer selon l'activité et l'opération ; le logiciel ne
le déduit pas. Calcul en entiers, centimes pour l'argent et millièmes pour les
quantités, arrondi au demi supérieur par ligne puis somme des lignes. Au plus
50 lignes ; plafond de 10 milliards EUR par document. Pas de conversion monétaire.

Parcours : `draft → prepared → accepted → converted`, ou `prepared → rejected`.
Le devis nécessite une identité commerciale et un client avec adresse. La
préparation attribue `DEV-AAAA-000001` et fige l'identité commerciale, le client,
les lignes, prix et taxes. Le devis préparé n'est plus modifiable. L'accord
nécessite une référence de preuve reçue ; ce n'est pas une signature électronique.
La validité est contrôlée selon la date civile Europe/Paris à la préparation
et à l'acceptation.

La conversion crée une seule préparation de facture, en lecture seule, marquée
**document non fiscal**, `fiscal:false`, `transmission:provider_required`.
`POST .../invoices/<id>/issue` répond 409 `billing_provider_required` et
n'émet rien. Aucun numéro fiscal, format Factur-X/UBL/CII, transmission,
réception, e-reporting ou déclaration de TVA n'est livré. Une impression/PDF
via le navigateur n'est pas une facture électronique réglementaire.

Les obligations dépendent du périmètre de l'entreprise et de l'opération.
Selon la [DGFiP](https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation),
la réception concerne toutes les tailles d'entreprises depuis septembre 2026 ;
l'émission s'échelonne entre septembre 2026 et septembre 2027. Les
[mentions obligatoires](https://www.service-public.gouv.fr/entreprendre/vosdroits/F31808)
nécessitent une validation complète selon la situation. Le blocage fiscal est
un choix explicite de ce périmètre en l'absence de fournisseur configuré ; son
retrait exige un chantier dédié, des essais du fournisseur et une revue métier.
Sources consultées le 3 novembre 2026.

## Contrats et séparation Core / SDK / modules

- `lib/contracts/src/business.ts` : DTO publics, déclarations d'entités, champs,
  fiches, rapports et codes d'erreur fermés ; types réexportés dans SDK Types.
- `sdk/core` : `BusinessPort` et `BusinessAttachment`, interfaces publiques pour
  modules officiels de confiance. Aucun SQL, moteur ou NestJS dans ce contrat.
- `modules/business` : manifestes, champs et règles pures consommant exclusivement
  les exports publics SDK. Aucun accès au serveur, aux cookies ou à la base.
- `apps/core/src/business/service.ts` : authentification issue de la session,
  droits et activations actuels, adaptateur de port lié à l'organisation,
  quotas, fichiers, idempotence et audit atomique.
- `lib/database/src/business.ts` : dépôt SQL privé, paramètres liés et organisation
  obligatoire pour chaque accès. Support PostgreSQL, MariaDB et MySQL.
- UI : SDK UI/Papicons, CSS natif, FR/EN, clair/sombre, états et URL persistante.

Le port n'est **pas** raccordé à `PluginSdk` API 1 : ne jamais injecter un objet
hôte dans QuickJS, importer un plugin dans Node ou donner ces écritures à un
plugin tiers. Les plugins externes conservent le pont borné de la Phase 4.
Une extension de ce pont exige contrats, contrôles et tests spécifiques.
Le paquet officiel est un premier exemple de séparation des règles métier ;
le Core connaît les déclarations officielles et fournit leur adaptateur.

## API et concurrence

Toutes les routes applicatives passent par `/api/platform/` au BFF et `/platform/`
au Core. Origin, CSRF, cookies, limites de corps et filtrage des erreurs existants
s'appliquent. La requête ne choisit jamais son organisation.

- `GET business` : catalogue de déclarations et disponibilité du fournisseur.
- `GET business/<module>/<entité>[?cursor=<uuid>]` : 100 fiches au maximum,
  projection des colonnes de liste et `nextCursor`. Filtre texte côté interface
  limité à cette page ; le rapport utilise toutes les données autorisées.
- `GET business/<module>/<entité>/<id>` : fiche complète autorisée.
- `POST business/<module>/<entité>[/<id>]` : `{values,idempotencyKey,...}` ; mise
  à jour avec `expectedRevision`. Devis : `lines`; document neuf : `file`.
- `POST business/<module>/<entité>/<id>/<action>` : révision, clé d'idempotence et
  champs propres à l'action. Voir `modules/business/src/engine.ts`.
- `GET business/documents/files/<id>/download` : contenu base64, empreinte et type,
  téléchargé par l'interface sans rendu actif.
- `GET business/reports` : agrégats autorisés de l'organisation courante.
- `POST admin/business/grants` : module, organisation, rôle et permissions du seul
  module, réservé à l'administrateur plateforme ; préserve les autres droits.

Les références intermodules nécessitent le droit de lire le module cible et son
activation. Une référence étrangère à l'organisation est introuvable. Les champs
inconnus, identifiants ou états injectés dans `values` sont refusés. Les révisions
empêchent d'écraser une modification intervenue entre lecture et enregistrement.
La même clé et le même corps rendent le résultat déjà engagé ; réutiliser la clé
avec un autre corps produit 409. Les droits sont contrôlés **avant** ce rejeu.

Chaque mutation, ses soldes/compteurs, son audit et son reçu d'idempotence sont
engagés dans la même transaction. L'échec de l'audit annule la mutation. Le verrou
d'administration existant sérialise les opérations entre processus ; c'est une
limite de débit à mesurer avant production, pas une architecture haute charge.
Quotas : 10 000 fiches par entité et organisation, 1 000 enfants par parent/entité.
Les reçus d'idempotence et audits n'ont pas de purge automatique.

## Consignes pour les futurs prompts et IA

1. Lire ce guide, [SDK.md](SDK.md), [UI_SDK.md](UI_SDK.md) et la revue avant de
   changer une règle. Conserver les limites fiscales visibles dans les écrans.
2. Ajouter schéma, labels FR/EN, règles et tests au module. Ne jamais accepter
   une organisation ou une permission fournie par le formulaire.
3. Ne pas contourner les règles via le CRUD générique : les manifestes métier
   déclarent volontairement `entities:[]` pour ce chemin.
4. Toute modification d'argent/stock utilise les entiers et les transitions
   existantes, avec révision, idempotence et audit dans la transaction.
5. Ajouter une migration par moteur, sans réécrire `0011_business` une fois livrée.
6. Pour un fichier, conserver limites, détection de signature/type et téléchargement
   sans aperçu. Une signature de fichier ne prouve pas son innocuité ; ne pas
   annoncer d'antivirus ou d'archivage réglementaire.
7. Ne pas élargir les données RH sans besoin explicite, politique de conservation
   et droits dédiés. Ne pas annoncer paie, conformité fiscale ou stabilité.
8. Vérifier les trois moteurs et le navigateur ; consigner les preuves et leurs
   limites. Aucun déploiement, effacement ou publication implicite.

## Reprise UX — 5 novembre 2026

Le frontend métier est découpé en espace partagé, navigation, listes, fiches,
formulaires, actions et rapports dans `apps/web/src/platform/business/`. Le catalogue
est chargé par un fournisseur partagé, réinitialisé lors d’un changement
utilisateur/organisation ; il contient des déclarations, jamais des décisions de
permission ni des sessions. Les contrôles Core sont conservés à chaque opération.

Les listes conservent leurs données pendant une actualisation et signalent
`aria-busy`. Le changement d’URL retire immédiatement les données de l’ancien
chemin. La recherche reste limitée à la page SQL courante ; les filtres sont
inscrits dans l’URL, la pagination ne montre ses boutons que lorsqu’elle est utile.
Une URL de curseur ouverte directement permet le retour à la première page ; le
bouton Précédent exige une page précédente connue pendant cette navigation.

La fiche sépare lecture et édition (`?edit=1`). Les modifications non enregistrées
sont visibles ; navigation, annulation et changement d’organisation passent par
une confirmation asynchrone. Le rechargement/fermeture du navigateur conserve la
garde native `beforeunload`. Les messages de réussite disparaissent après six
secondes et restent fermables ; les erreurs du formulaire sont placées avant les
champs et reçoivent le focus. Les libellés des modules viennent de `definition.label`.

Les primitives publiques et leurs contrats sont dans [UI_SDK.md](UI_SDK.md).
La [roadmap UX](../ROADMAP_UX.md) et la [revue](REVIEW_UX.md) consignent les preuves,
les données synthétiques de recette et les limites ; aucune qualification de
production ou conformité fiscale ne découle du refresh visuel.
