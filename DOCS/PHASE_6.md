# Phase 6 — Orkobi Store

Version **0.3.0-dev.1**. Le Store distribue des paquets de plugins versionnés depuis
un service indépendant du Core. L’interface se trouve dans **Administration → Store**,
également accessible depuis Extensions. Les [preuves locales](REVIEW_PHASE_6.md)
distinguent service Docker, parcours SQL réels et navigateur avec API synthétiques.

L’API publique est définie et le service est hébergeable séparément. Aucun domaine,
registre Internet officiel, abonnement, publication npm ou déploiement utilisateur
n’est créé par cette phase. Un administrateur choisit explicitement ses dépôts de
confiance ; la configuration initiale ne contacte aucun Store externe.

## Architecture et responsabilités

| Partie                            | Responsabilité                                                          |
| --------------------------------- | ----------------------------------------------------------------------- |
| `apps/store`                      | API HTTP en lecture : catalogue signé et paquets adressés par empreinte |
| `lib/store`                       | Format, empreintes canoniques, Ed25519, validation et transport borné   |
| `scripts/store-*`                 | Génération de clés et publication **locale**, hors serveur HTTP         |
| `apps/core/src/store`             | Confiance des sources, compatibilité, revue et installation contrôlée   |
| Migration `0010_store`            | Checkpoints anti-rejeu et provenance persistante de l’installation      |
| `apps/web/src/platform/store.tsx` | Choix des versions, revue et consentement explicite                     |

Le Store n’a pas besoin de SQL, de Redis ou de contacter le Core. Il ne possède
pas la clé privée de signature : son volume de registre est monté en lecture seule.
Le Core garde ses propres versions Core/SDK, son moteur SQL, ses permissions et
son moteur QuickJS/WASM. Un paquet reçu du Store suit les mêmes restrictions
que le [format de Phase 4](PHASE_4.md), sans SQL ni JS frontend arbitraire.

## Dépôts publics, officiels, communautaires et privés

Un dépôt possède un identifiant stable, un nom local, une URL et des clés publiques
Ed25519 épinglées par l’opérateur du Core. Les canaux `official`, `community` et
`private` sont configurés **localement** : un catalogue distant ne peut pas se
proclamer officiel. Le badge désigne le distributeur choisi par cet opérateur ;
il n’est pas une certification universelle de l’auteur.

Un dépôt public sert son API sans authentification. Un dépôt privé exige un bearer
token distinct de toute session utilisateur et du secret BFF/Core. Le Core envoie
ce token uniquement à l’URL du dépôt configuré. Le navigateur ne reçoit ni token,
URL privée, clé privée ou contenu du code du plugin. Il voit les métadonnées de
revue et les empreintes publiques.

La configuration du Core accepte au maximum cinq dépôts et trois clés publiques
par dépôt. Utiliser **soit** `STORE_REPOSITORIES_JSON`, **soit**
`STORE_REPOSITORIES_FILE` pour un fichier JSON serveur, jamais les deux.
Le fichier et les secrets sont réservés à l’opérateur ; il n’existe pas d’API
permettant à un utilisateur ou à un plugin d’ajouter une URL ou une racine de confiance.

Exemple de structure à remplir avec une vraie clé publique du distributeur :

```json
[
  {
    "id": "community",
    "name": "Extensions communautaires",
    "channel": "community",
    "url": "https://store.votre-domaine.example/",
    "publicKeys": [
      "-----BEGIN PUBLIC KEY-----\nREMPLACER_PAR_LA_CLE_SPKI_ED25519\n-----END PUBLIC KEY-----\n"
    ],
    "minimumSequence": 1
  }
]
```

Ce domaine et cette clé sont illustratifs et ne constituent pas un dépôt connecté.
L’URL doit finir par `/`, sans credentials, query ou fragment. HTTPS est requis ;
`allowHttp: true` est une exception explicite pour une recette locale ou un réseau
privé maîtrisé. Pour `channel: "private"`, ajouter `token` : 32 à 256 caractères
alphanumériques, tirets ou underscores. Ne pas copier un token dans une URL.
La configuration est bornée et le fichier est limité à 32 Kio ; les erreurs ne reflètent pas les secrets.
Redémarrer le Core après modification de sa configuration.

Pour éviter les erreurs d’échappement PEM, générer le JSON depuis la clé publique
locale vérifiée, par exemple avec `readFile` et `JSON.stringify` dans un script
opérateur, puis protéger le fichier (mode 0600). Dans Compose, la variable JSON est
transmise au Core. Un fichier externe exige un montage explicite en lecture seule.
L’URL doit être joignable **depuis le processus Core** : `127.0.0.1` dans un conteneur
ne désigne pas le serveur Store d’un autre conteneur.

## Créer et publier un catalogue local

Depuis le checkout :

```sh
pnpm plugin:build
pnpm plugin:validate output/plugins/community.cards.json
pnpm store:keygen output/store-keys/community
pnpm store:publish output/store/community community \
  output/store-keys/community/signing-private.pem \
  output/plugins/community.cards.json \
  --sql=postgresql,mariadb,mysql
```

`store:keygen` exige un **nouveau** répertoire, avec clé privée PKCS#8 en mode 0600
et clé publique SPKI. Il affiche uniquement l’identifiant public de la clé.
Sauvegarder et protéger la clé privée hors du volume servi. La clé publique doit
être transmise au Core par un canal vérifié ; le Core ne fait pas confiance à une
clé téléchargée dans le catalogue lui-même.

`store:publish` écrit localement :

- `catalog.json` : instantané signé, séquence croissante et validité de 24 heures ;
- `artifacts/<sha256>.json` : paquets, sans exécution de code ou de script npm ;
- `public-key.pem` : clé publique utilisée par le serveur ;
- `versions.json` : registre local des identités de versions déjà publiées.

Une identité `<plugin>@<version>` ne peut pas être réutilisée avec un autre paquet
ou une autre déclaration SQL, même après retrait du catalogue. Conserver
`versions.json` avec le registre : c’est la mémoire de l’outil de publication,
**pas une preuve supplémentaire consommée par le Core**. Le Core vérifie le
catalogue signé, son checkpoint et la version du plugin déjà installé.
L’écriture du catalogue est atomique. Les anciens paquets ne sont pas purgés.

Pour ajouter une version, changer sa version de manifeste et conserver des
migrations additives, puis publier le nouveau fichier. L’outil conserve les autres
versions annoncées. `--sql=` déclare les moteurs pris en charge ; ce n’est pas une
recette SQL automatique. Le manifeste doit également déclarer ses capabilities
réellement obligatoires. Le Core vérifie ces deux exigences.

```sh
# Rafraîchir la validité et augmenter la séquence, sans changer les paquets.
pnpm store:publish output/store/community community \
  output/store-keys/community/signing-private.pem --refresh

# Retirer une version des téléchargements annoncés, sans toucher aux installations.
pnpm store:publish output/store/community community \
  output/store-keys/community/signing-private.pem \
  --withdraw=community.cards@1.0.0
```

Un catalogue comporte au maximum 40 versions actives et 256 Kio de contenu canonique.
Le registre local garde jusqu’à 10000 identités de versions. Un changement de clé
nécessite une opération de confiance préparée : distribuer les nouvelles clés et
une nouvelle séquence via un canal opérateur vérifié. La CLI ne réalise pas une
rotation automatique ni une récupération de clé compromise.

## Exécuter l’API indépendante

Pour un serveur Node local, compiler les workspaces puis configurer
`STORE_DIRECTORY`, `STORE_REPOSITORY_ID`, `STORE_HOST` et `STORE_PORT` avant
`pnpm start:store`. La commande lit aussi `.env.store` à la racine.
Le répertoire pointe sur le registre publié, jamais sur le répertoire des clés privées.
Pour un dépôt privé, configurer la même valeur dans `STORE_BEARER_TOKEN` côté
serveur et `token` côté Core. Le canal privé du Core ne protège pas à lui seul
un serveur laissé public.
Le fichier `infra/store/.env.example` décrit les variables du Compose autonome :

```sh
docker compose --env-file .env.store -f compose.store.yaml config --quiet
# Démarrage explicite de cette instance indépendante :
docker compose --env-file .env.store -f compose.store.yaml up --build --wait
```

Seul le Store démarre dans ce projet. Le port est publié sur loopback ; fournir son
propre reverse proxy HTTPS pour un accès distant. Le registre est monté en lecture
seule. L’API valide le catalogue à chaque lecture, donc une publication locale
atomique devient visible sans importer la clé privée dans le serveur.

| Route GET                | Contrat                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `/health`                | Vitalité du processus, sans information sur le dépôt        |
| `/ready`                 | Catalogue présent, valide et non expiré                     |
| `/v1/catalog`            | `{catalog,keyId,signature}` ; bearer requis si dépôt privé  |
| `/v1/artifacts/<sha256>` | Paquet annoncé par le catalogue courant, empreinte vérifiée |

Autres chemins : 404. Méthodes autres que GET : 405. Accès privé sans token valide : 401. Catalogue expiré, fichier absent ou altéré : réponse générique 503.
Les sondes minimales restent publiques. L’API ne possède aucun endpoint d’upload,
d’administration, d’inscription de compte ou de signature à distance.

## Signature, intégrité et anti-rejeu

Le catalogue API 1 contient `repositoryId`, `sequence`, `issuedAt`, `expiresAt`
et les versions `{manifest,digest,sqlEngines,publishedAt}`. Il est signé en Ed25519
sur les octets UTF-8 de :

```text
orkobi-store-catalog-v1\n<catalogue JSON canonique>
```

Le JSON canonique trie les clés des objets selon l’ordre JavaScript, conserve
l’ordre des tableaux et utilise `JSON.stringify` pour les primitives. Il s’agit du
contrat Orkobi, sans prétendre implémenter une autre norme de canonicalisation.
L’identifiant de clé est SHA-256 du SPKI DER ; la signature est en Base64.
L’empreinte du paquet est SHA-256 du JSON canonique de **tout** `{manifest,code}`.
Le manifeste téléchargé doit être identique au manifeste signé du catalogue.

Le Core contrôle identité du dépôt, clé épinglée, signature, dates, taille,
unicité des versions et manifestes. Il refuse une validité supérieure à sept jours,
un catalogue expiré et une date d’émission trop future (tolérance 60 secondes).
Les requêtes ont un timeout de 2,5 secondes, sans redirection, cookie ou URL de
paquet fournie par le catalogue : le chemin de téléchargement est calculé depuis
l’empreinte hexadécimale. Les lectures sont bornées après décompression.

Les checkpoints SQL mémorisent, par identifiant de dépôt, la séquence et le digest
les plus récents acceptés. Une séquence plus basse ou le même numéro avec un
contenu différent sont refusés, y compris après redémarrage du Core.
`minimumSequence` permet d’imposer un plancher dès la première connexion.
Un identifiant de dépôt doit rester stable ; changer sa clé ne réinitialise pas
son historique en base.

Cette chaîne authentifie le **distributeur choisi** et l’intégrité du paquet.
Elle ne certifie ni l’identité civile de l’auteur ni l’innocuité fonctionnelle du code.
Ce n’est pas une implémentation complète de TUF : pas de quorum, journal public de
transparence, liste de révocation globale ni découverte automatique de racines.
Une horloge correcte et la protection des clés privées restent nécessaires.

## Installer et mettre à jour

1. Ouvrir Administration → Store, choisir le dépôt et la version, puis **Examiner**.
2. Lire source, clé, digest, version précédente, permissions, tables, champs,
   dépendances et compatibilité Core/SDK/SQL.
3. Pour une mise à jour, désactiver le plugin sur la plateforme et dans ses
   organisations. Les restrictions de dépendances et migrations de Phase 4 s’appliquent.
4. Confirmer la source et, s’il y en a, l’ajout de nouvelles permissions déclarées.
5. Installer : le paquet reste désactivé. Accorder les droits aux rôles explicitement
   puis choisir ses organisations depuis Extensions et Modules.

La revue est liée à l’administrateur, conservée en mémoire au maximum cinq minutes
et limitée à 50 entrées par Core. Un redémarrage impose une nouvelle revue.
Le navigateur ne peut pas soumettre un autre code, une autre racine ou une autre
URL lors de l’installation. Le Core recharge le catalogue, revérifie sa signature
et la version annoncée, puis contrôle de nouveau les droits et l’état SQL.
Le changement de digest installé ou de provenance entre revue et confirmation
rend celle-ci obsolète. Un changement de clé impose également une nouvelle revue.

Aucune requête réseau ou exécution QuickJS n’est effectuée en tenant une transaction
SQL d’administration. Le Core revérifie l’autorisation après ces étapes.
Deux opérations Store peuvent effectuer des accès réseau simultanément par Core.

Les nouveaux droits ne sont jamais accordés automatiquement. Les accords dormants
correspondant à une permission nouvellement déclarée sont retirés des rôles lors
de la mise à jour ; les permissions retirées du manifeste sont également enlevées.
Les autres droits restent conservés. Ce contrôle s’applique aussi aux mises à jour
manuelles depuis un fichier. Un accord explicite depuis Extensions reste nécessaire.

La provenance vérifiée (`dépôt`, `clé`, `séquence`, `digest`) est enregistrée en base
avec l’installation. Une installation manuelle marque cette provenance comme non
vérifiée. Les audits `plugin.installed`/`plugin.updated` et `store.plugin_installed`
tracent l’opération sans code, payload ou secret.

## Routes Core/BFF

Préfixe navigateur : `/api/platform/`. Toutes ces routes exigent une session
courante d’administrateur plateforme. Les POST gardent Origin, CSRF et secret BFF/Core.

| Route                      | Entrée / résultat                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET admin/store`          | États indépendants des dépôts et résumés des versions, sans code ni secrets                      |
| `POST admin/store/review`  | `{repositoryId,id,version,digest}` → revue de confiance et compatibilité                         |
| `POST admin/store/install` | `{reviewId,confirmId,digest,expectedPreviousDigest,acknowledgeSource,acknowledgeNewPermissions}` |

Un dépôt inaccessible est `unavailable`, un catalogue non vérifié ou rejoué
`untrusted`. Les autres dépôts peuvent rester disponibles. Une incompatibilité
ou une revue périmée provoque 409 ; une confirmation incomplète, 400.
Le BFF borne la liste Store à 2 Mio, les autres réponses gardent leur limite de
512 Kio ; son timeout Store est de 15 secondes. Les paquets restent limités à
90000 octets et les autres protections du parseur Core ne sont pas élargies.

## Fonctionnement sans Store et limites de déploiement

Sans dépôt configuré, aucun appel Store n’est lancé et l’installation locale depuis
un fichier reste disponible. Si un Store est arrêté, les plugins installés, sessions,
permissions, données et jobs continuent à utiliser SQL et le Core. L’installation
ou la mise à jour distante attend le retour d’un catalogue vérifié : pas de repli
sur un ancien catalogue non revérifié, de mise à jour silencieuse ou de purge.

Le retrait d’une version du catalogue bloque une nouvelle installation depuis ce
catalogue ; il ne supprime et ne désactive pas les installations existantes.
Une révocation d’urgence des installations ou une compromission d’auteur nécessite
une procédure opérateur distincte. Les restaurations doivent conserver ensemble
base SQL et checkpoints afin de garder les garanties anti-rejeu.

La migration `0010_store` est append-only sur PostgreSQL, MariaDB et MySQL.
Les anciens SQL/checksums restent conservés. MariaDB/MySQL gardent leur journal
DDL partiel et refusent la readiness en cas de lot incomplet, comme en Phase 5.
Voir [PHASE_5.md](PHASE_5.md) pour les opérations et versions SQL prises en charge.

## Validation et consignes pour les futures IA

```sh
pnpm check
pnpm typecheck
pnpm infra:test
pnpm sql:test
pnpm store:test
pnpm plugin:build
pnpm plugin:validate output/plugins/community.cards.json
pnpm sdk:test
```

`store:test` crée des clés et un registre de recette, lance uniquement le Store
en Docker, vérifie privé/public, signature, intégrité, retrait/version immuable et
redémarrage, puis supprime son token temporaire, les clés privées et ses conteneurs.
Les fichiers publics de preuve restent dans `output/store/<id>/` (ignorés Git).
Les autres recettes utilisent des bases et volumes dédiés, jamais la pile existante.

Avant de modifier cette phase, lire `AGENTS.md`, ce guide, `PHASE_4.md`, `PHASE_5.md`
et `UI_SDK.md`. Conserver la distinction racine de confiance / catalogue distant,
les plafonds, le recontrôle d’autorisation après réseau et le fonctionnement hors
ligne. Ne pas importer de clé privée dans le serveur, accepter un script d’installation,
accorder les nouveaux droits ou publier un registre externe implicitement.

Références techniques primaires : [signatures Node.js](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature)
et [HTTP Node.js](https://nodejs.org/docs/latest-v22.x/api/http.html).
