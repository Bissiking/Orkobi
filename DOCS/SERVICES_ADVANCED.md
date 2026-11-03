# Services avancés — décisions de Phase 5

Évaluation du **3 novembre 2026**, pour Orkobi 0.2.0-EXP.
Ces décisions d’architecture distinguent les fonctions livrées des pistes étudiées.
Aucun compte externe, bucket, nœud Aion ou service NoSQL n’a été créé.

## NoSQL facultatif

**Décision : ne pas ajouter de moteur documentaire actuellement.** Les données
structurées, le stockage JSON des plugins, le journal et la file SQL couvrent les
besoins présents. Une nouvelle base ajouterait exploitation, sauvegardes,
cohérence et modes de panne sans cas d’usage mesuré. Le cache mémoire/Redis
répond déjà au besoin technique éphémère.

Si un besoin mesuré apparaît, son premier périmètre sera exclusivement technique
et global : agrégats de supervision ou diagnostics temporaires, reconstruisibles,
avec TTL, quota et fonctionnement dégradé documentés. Exclure comptes, sessions,
autorisations, appartenance aux organisations, données métier, audits de sécurité
et état durable des jobs. Aucun module tiers ne reçoit un client NoSQL brut.
Un stockage technique facultatif ne devient jamais une autorité de sécurité.

Conditions de réouverture : charge mesurée sur le stockage actuel, comparaison
chiffrée avec SQL/Redis, politique de rétention, panne du fournisseur sans bloquer
le Core minimal, et recette de restauration. `core.nosql` reste `unavailable` ;
aucune dépendance MongoDB ni variable activant une fausse implémentation n’est ajoutée.

## Stockage objet compatible S3

**Décision : futur fournisseur facultatif derrière le Core.** Il sera utile pour
pièces jointes et documents volumineux ; ces usages ne sont pas encore livrés.
Conserver en SQL les métadonnées, propriétaire, organisation, plugin, taille,
empreinte, état d’upload et droits. Le bucket doit rester privé ; l’objet est
référencé par un identifiant opaque généré par le Core, pas par une clé arbitraire
ou un chemin fourni par le plugin.

Contrat envisagé, non exporté aujourd’hui : demande d’upload bornée, confirmation
avec contrôle de taille/empreinte, demande de lecture après autorisation courante,
puis suppression explicite auditée. Préfixe de stockage calculé côté Core avec
installation/organisation/plugin ; vérification des droits à chaque demande.
Les URLs présignées auraient une durée courte, une opération et une clé fixes ;
aucune URL contenant sa signature ne doit entrer dans logs ou audits.

Les [URLs présignées S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
sont des jetons de possession temporaires : elles peuvent être réutilisées avant
expiration et un upload sur une clé existante peut remplacer son objet. Il faudra
donc générer des clés nouvelles et vérifier le résultat avec un checksum SigV4.
La révocation d’un droit applicatif ne doit pas être présentée comme l’annulation
instantanée d’une URL déjà distribuée.

Recette nécessaire avant livraison : fournisseur S3 choisi, signature, taille,
empreinte, expiration, reprise multipart, abandon/orphelins, isolation des clés,
refus sans droit, défaillance du fournisseur et restauration des métadonnées/objets.
La compatibilité d’un fournisseur « S3 » ne vaut pas preuve de toutes ces fonctions.
`core.storage.objects` reste indisponible ; aucun SDK AWS, bucket ni secret S3 n’est
requis pour installer Orkobi.

## Aion comme orchestrateur externe

**Décision : intégration pertinente mais optionnelle, à implémenter séparément.**
L’évaluation s’appuie sur `README.md` et `docs/API.md` du dépôt Aion local,
commit `bf9a63237fd3c519ad0a472235fbc17599b2ff7f`, lus sans modification. Le service
Aion déployé et ses credentials n’ont pas été interrogés.

Le contrat documenté possède `GET /health`, des nœuds `/api/modules`, des jobs
`/api/jobs`, leurs actions `/run`, `/schedule`, `/stop` et les exécutions/logs.
L’authentification machine `X-Aion-API-Key` est distincte des sessions humaines
et des tokens de nœud utilisés pour pousser vers `/api/push/{slug}`.
Les jobs ciblent un endpoint relatif du nœud, avec payload, timeout,
politique de concurrence et gestion des échéances manquées.

Orkobi conserve son Job Engine SQL comme propriétaire de l’exécution et de
l’idempotence. Un connecteur futur pourrait enregistrer explicitement un nœud,
puis accepter un déclenchement machine borné qui crée une tâche et renvoie 202
avec son identifiant. Il ne doit pas exécuter un handler tiers directement dans
le processus HTTP. La surveillance technique peut aussi consulter les sondes
minimales existantes, sans compte utilisateur Orkobi partagé.

Points à implémenter avant connexion réelle :

- Endpoint machine dédié avec authentification, scopes de déclenchement, quotas,
  module/tâche autorisés et contexte d’organisation établi côté Core.
- Clé d’idempotence contrôlée, reprise après timeout de la soumission, statut
  consultable et distinction nette entre acceptation HTTP et résultat métier.
- Une seule autorité de calendrier par tâche : récurrence Orkobi **ou** Aion.
  L’option Aion ne doit jamais lancer la même échéance par deux ordonnanceurs.
- Annulation authentifiée, signal transmis, droits courants revérifiés et verrou
  conservé jusqu’à l’arrêt effectif. Un timeout HTTP Aion ne prouve pas l’arrêt du job.
- Configuration réseau explicite, secrets machine distincts et rotatifs,
  logs expurgés, tests Aion indisponible, doubles appels et révocation de droits.

L’API d’intégration actuelle d’Orkobi est en lecture avec trois scopes ; elle ne
permet donc pas ce déclenchement. Il faut ajouter un vrai contrat avant de fournir
une clé à Aion. Aucun cookie administrateur, `INTERNAL_TOKEN` BFF, accès SQL ou code
plugin ne doit être confié à l’orchestrateur. Aucune inscription automatique dans
Aion n’est effectuée. `core.orchestration.aion` reste indisponible.

## État utilisable par les futurs prompts

| Service                                         | État de cette livraison                           | Requis pour le Core minimal          |
| ----------------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| PostgreSQL / MariaDB / MySQL                    | Fournisseurs SQL alternatifs, un seul choisi      | Oui, pour les fonctions persistantes |
| Diagnostic système et métriques HTTP/jobs/cache | Implémentés, réservés aux administrateurs         | Aucun service externe                |
| Redis                                           | Cache facultatif, repli mémoire existant          | Non                                  |
| NoSQL                                           | Étudié, non implémenté                            | Non                                  |
| S3                                              | Contrat envisagé, fournisseur non implémenté      | Non                                  |
| Aion                                            | Contrat externe évalué, connecteur non implémenté | Non                                  |

Ne pas cocher une intégration réelle sur la seule base de ces études. Les cases
« étudier/évaluer » de la roadmap sont satisfaites par cette analyse ; une future
livraison devra ajouter son implémentation, sa documentation SDK et ses preuves.
