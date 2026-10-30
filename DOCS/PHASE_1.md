# Phase 1 — plateforme administrable et multi-organisation

Version produit conservée : **0.1.0-EXP**. Les sections 1.1 à 1.5 de la roadmap
correspondent à cette livraison locale ; elles ne constituent pas une publication
stable ou une autorisation de déploiement.

## Installer ou mettre à niveau une instance locale

Prérequis et stockage : [INFRASTRUCTURE.md](INFRASTRUCTURE.md). Sur un nouveau clone :

```sh
pnpm install --frozen-lockfile
pnpm infra:init
pnpm infra:up
```

Pour une instance issue de la 0.4 dont `.env` existe déjà :

```sh
pnpm setup:prepare
pnpm infra:up
```

`setup:prepare` ajoute un `SETUP_TOKEN` aléatoire uniquement s'il est absent ou vide.
Il conserve les mots de passe SQL et tout jeton existant. Le jeton est un secret
opérateur : le lire dans `.env` et le saisir dans l'assistant, sans le mettre dans
une URL, un ticket ou un journal. Il n'est jamais envoyé au navigateur par l'API.
Le Core refuse l'installation si aucun jeton n'est configuré.

Ouvrir `http://127.0.0.1:3000`. L'assistant crée le premier administrateur
plateforme avec son nom, son e-mail et un mot de passe de 15 à 128 caractères.
Une connexion SQL et toutes les migrations sont requises. L'installation et
l'événement d'audit sont atomiques ; une deuxième tentative est refusée, y compris
si deux demandes arrivent simultanément. Après installation, se connecter avec
ce compte. Le jeton peut ensuite être retiré de la configuration du Core.

La migration `0002_platform` s'ajoute à `0001_core_schema`, sans modifier son SQL
ni son empreinte. Sauvegarder les données avant une mise à niveau d'une instance
utilisée. Aucun downgrade, suppression de volume ou réinitialisation automatique
n'est fourni.

Pour le développement sur l'hôte, suivre l'override SQL de la 0.4 : configurer
`DB_ENABLED=true`, les identifiants SQL et `SETUP_TOKEN` dans `.env`, puis lancer
les migrations et `pnpm dev`. Vite relaie `/api` au BFF avec l'origine du navigateur.

## Parcours disponibles

| Page                 | Fonction                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `/setup`             | Installation initiale, puis fermeture définitive après succès                  |
| `/login`             | Connexion locale                                                               |
| `/`                  | Organisations accessibles, profil et accès administratif selon les droits      |
| `/organizations`     | Choix d'une organisation accessible                                            |
| `/organizations/:id` | Paramètres, membres, rôles et audit autorisés dans cette organisation          |
| `/admin`             | Comptes, organisations et audit global, réservé aux administrateurs plateforme |
| `/profile`           | Nom affiché, identité du compte et révocation des sessions                     |
| `/system`            | Vitalité BFF/Core, état SQL et version                                         |
| `/settings`          | Préférences locales FR/EN et clair/sombre/système                              |
| `/modules`           | Catalogue de présentation ; aucun module installé ou activable                 |

Les routes d'organisation utilisent des paramètres d'URL explicites et revérifient
les droits côté Core. La sélection active est conservée dans la session serveur ;
elle n'accorde aucune permission et ne remplace pas l'autorisation d'une opération.
Changer d'organisation ne modifie ni ses paramètres ni ses appartenances.

La déconnexion révoque la session serveur et efface le cookie. Une réponse 401
sur une opération protégée ramène l'interface à la connexion. Aucun identifiant
de session ou jeton d'authentification n'est conservé dans `localStorage`.

## Administration et délégation

Le choix confirmé pour cette version est une création centralisée :

1. L'administrateur plateforme crée les comptes utilisateurs.
2. Il crée une entreprise ou association et choisit son premier administrateur.
3. Il peut attribuer des accès par e-mail à des comptes existants depuis
   l'administration de l'organisation.
4. L'administrateur d'organisation peut créer des rôles personnalisés et déléguer
   les permissions dont il dispose. Il ne peut pas créer un compte plateforme.

Le statut administrateur plateforme est distinct d'une appartenance. Il autorise
uniquement les routes explicites `/admin/*` ; il ne donne pas implicitement un
accès membre à toutes les organisations. L'administrateur peut s'attribuer une
appartenance par l'administration, action qui apparaît dans l'audit.

Chaque organisation dispose de deux rôles prédéfinis : administrateur avec les
six permissions ci-dessous et membre avec `organization:read`. Ces rôles ne sont
pas modifiables. Les rôles personnalisés peuvent être créés et modifiés, mais
aucun wildcard ou droit implicite n'est reconnu.

| Permission           | Autorise                                           |
| -------------------- | -------------------------------------------------- |
| `organization:read`  | Consulter et sélectionner l'organisation           |
| `organization:write` | Modifier ses nom, type, langue et fuseau horaire   |
| `members:read`       | Consulter ses membres et rôles                     |
| `members:write`      | Attribuer, modifier ou désactiver une appartenance |
| `roles:write`        | Créer et modifier des rôles personnalisés          |
| `audit:read`         | Consulter ses événements d'audit                   |

Un délégant ne peut attribuer un rôle, modifier un rôle ou changer une appartenance
dont les permissions dépassent les siennes. Il doit disposer des permissions de
lecture associées pour utiliser les formulaires de gestion de l'interface.

La désactivation d'un utilisateur révoque ses sessions. Un administrateur
plateforme actif doit toujours demeurer. Chaque organisation conserve au moins
un administrateur prédéfini actif dont le compte est actif : son unique
administrateur ne peut être désactivé ou rétrogradé avant transfert. Les mutations
de droits sont sérialisées dans une transaction pour protéger ces invariants
contre des demandes concurrentes. Cette stratégie privilégie la cohérence du
premier socle et ne constitue pas une optimisation pour une forte charge.

Aucune suppression physique de compte, d'organisation ou de rôle n'est exposée.
Les désactivations conservent les données. Les formulaires demandent confirmation
avant de désactiver un accès.

## Identité, sessions et transport

Les identifiants des utilisateurs, organisations, rôles et sessions sont des UUID
aléatoires générés côté Core et soumis aux contraintes uniques SQL. Les e-mails
sont normalisés en minuscules et uniques. Les mots de passe utilisent scrypt
avec un sel aléatoire de 16 octets, `N=131072`, `r=8`, `p=1` et une clé de
64 octets. Le calcul est asynchrone et limité à deux dérivations concurrentes.
Les erreurs de connexion ne distinguent pas compte absent, désactivé ou mot de
passe incorrect ; un compte absent provoque également une dérivation.
Le stockage SQL limite à dix tentatives de connexion par e-mail sur quinze minutes,
y compris les connexions réussies. La limite persiste après redémarrage.

Les sessions sont persistées en SQL : le navigateur reçoit 32 octets aléatoires,
seule leur empreinte SHA-256 est stockée. Elles expirent après huit heures au plus
tard et trente minutes d'inactivité, contrôlées côté serveur. Une nouvelle connexion
crée un nouveau jeton et révoque celui déjà présenté par ce navigateur. Chaque
requête authentifiée vérifie à nouveau le compte et les droits actuels.

| Configuration          | Comportement                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `SESSION_SECURE=true`  | Cookie `__Host-orkobi`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sans Domain |
| `SESSION_SECURE=false` | Cookie `orkobi.local` avec les mêmes restrictions, hors Secure ; HTTP local seulement  |
| Absence de variable    | Secure en `NODE_ENV=production`, mode local sinon                                      |
| `PUBLIC_ORIGIN` BFF    | Origine navigateur HTTP(S) exacte ; requise pour un proxy HTTPS dont le BFF voit HTTP  |

Compose est un environnement HTTP local et impose explicitement
`SESSION_SECURE=false` par défaut. Pour un déploiement HTTPS, adapter cette variable
et `PUBLIC_ORIGIN`, terminer TLS avec une configuration validée et protéger le
réseau Core/SQL. La livraison locale n'est pas une validation de production.

Les écritures exigent JSON et l'en-tête personnalisé `x-orkobi-request: 1`.
Le BFF vérifie également l'origine du navigateur et refuse `Sec-Fetch-Site: cross-site`.
Les écritures authentifiées exigent le jeton de synchronisation `x-csrf-token`,
comparé au jeton aléatoire associé à la session. L'absence de CORS public empêche
un site tiers d'obtenir ce jeton ou de préautoriser les en-têtes nécessaires.

Le BFF ne relaie que les cookies Orkobi, le jeton CSRF et le JSON attendu, vers
une liste fermée de routes Core. Il ne relaie ni Authorization, ni cookies tiers,
ni Host ou X-Forwarded-* utilisateurs. Les réponses sont bornées à 512 Kio et au
timeout du client Core. Les corps, cookies, mots de passe et jetons restent absents
des logs techniques.

Le modèle `oidc_identities` prépare la paire unique issuer/subject liée à un
utilisateur. Aucun fournisseur, lien d'identité externe ou connexion OIDC n'est
activé dans cette phase.

## Frontières applicatives et API

Le navigateur appelle uniquement `/api/platform/*` sur le BFF. Le Core expose
les mêmes suffixes sous `/platform/*` sur son réseau interne :

- GET `status`, `session` ; POST `setup`, `login`.
- POST `logout`, `profile`, `sessions/revoke` ; GET `sessions`.
- GET `organizations`, `organizations/:id`, `organizations/:id/{members,roles,audit}`.
- POST `organizations/:id`, `organizations/:id/{select,members,roles}`.
- GET `admin/{users,organizations,audit}`, `admin/organizations/:id/{members,roles}`.
- POST `admin/users`, `admin/users/:id`, `admin/organizations`,
  `admin/organizations/:id`, `admin/organizations/:id/members`.

Les champs des formulaires sont les contrats d'entrée de ces routes ; le Core
valide types, limites, UUID, permissions, langue et fuseau horaire avant écriture.
Il retourne des erreurs publiques normalisées, sans exception SQL brute.

Le bootstrap BFF passe explicitement au **schéma 2**. Identité et organisations
sont annoncées disponibles uniquement si le Core répond, la base est prête et
l'instance est initialisée. Une disponibilité ne représente aucune autorisation.
Les modules restent indisponibles. Les sondes de vitalité gardent leur contrat.

Tout SQL de production reste dans `lib/database`. `PlatformRepository` fournit
des opérations internes paramétrées, sans SQL dans le SDK ou le navigateur.
L'autorisation est effectuée par les services du Core dans la transaction qui
effectue l'opération. Les clés étrangères d'appartenance imposent la même
organisation pour le rôle et le membre. L'isolation est **applicative** : le compte
SQL du Core est une frontière de confiance et aucune RLS PostgreSQL n'est annoncée.

Les services SDK d'identité, d'organisation et de permissions sont raccordés à
la persistance. Ils relisent utilisateur, organisation, appartenance et rôle à
chaque appel. La factory interne exige toujours un contexte préalablement établi
et autorisé par le Core. Le registre de capabilities reste indisponible (Phase 2).
L'adaptateur SQL métier générique et l'isolation d'exécution des plugins ne sont
pas implémentés par cette phase.

## Audit et limites

Les initialisations, connexions échouées/réussies, déconnexions, révocations,
changements de profil, comptes, organisations, rôles et appartenances réussis
produisent des événements. Pour les mutations, l'événement est écrit dans la même
transaction que les données. Le compte Core ne peut ni modifier ni supprimer un
événement existant. L'audit conserve les identifiants, sans mots de passe, jetons
ou corps arbitraire ; les noms affichés sont résolus à partir des données actuelles.
Un administrateur SQL demeure capable de modifier la base : cet audit n'est pas
un journal cryptographique externe infalsifiable.

Les listes sont bornées à 200 entrées (sessions à 100), sans pagination dans cette
première interface. MFA, récupération/réinitialisation de mot de passe, inscription
publique, invitations par e-mail, OIDC actif, purge planifiée, modules métier et
APIs d'intégration sont hors de ce lot. Ne pas utiliser cette version expérimentale
comme une promesse de toutes les fonctions d'un ERP ou d'une sécurité de production.

## Vérifications

`pnpm check` couvre compilation, contrats, lint et tests locaux. `pnpm infra:test`
exécute des suites PostgreSQL/HTTP sur une base dédiée, puis la recette de reprise
et persistance. Les tests vérifient notamment la mise à niveau 0.4, l'installation
concurrente, CSRF, cookies, isolation de deux organisations, délégation bornée,
révocation, expiration et protection concurrente du dernier administrateur.

`tests/browser/phase1.mjs` est le scénario Playwright CLI du nouveau parcours.
Il attend un environnement de recette vierge avec un jeton opérateur prérempli
dans le champ d'installation, sans inclure ce jeton dans le code versionné.
Il crée uniquement des données synthétiques et capture les pages desktop/mobile
sous `output/playwright/phase1-*.png`, ignorées par Git.

Les contrôles, preuves et limites de sécurité sont regroupés dans
[PHASE_1_SECURITY.md](PHASE_1_SECURITY.md). La [roadmap](ROADMAP.md) suit le
périmètre fonctionnel ; la [checklist de release](RELEASE_CHECKLIST.md) reste une
validation distincte avant toute publication.
