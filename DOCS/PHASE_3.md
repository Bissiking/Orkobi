# Phase 3 — identité, intégrations, services et tâches

La Phase 3 comprend désormais 3.1, 3.2, 3.2-BIS, 3.3 et 3.4. Le produit reste
**0.3.0-dev.1** : cette livraison locale ne constitue pas une publication stable.

- [Services optionnels et Job Engine](JOB_ENGINE.md) : cache mémoire/Redis,
  file PostgreSQL durable, tâches des modules et exploitation.
- [Kit UI du SDK](UI_SDK.md) : composants, CSS natif, thèmes, Papicons et règles IA.
- [Revue de la phase](REVIEW_PHASE_3.md) : corrections, tests et limites.

## Mise à niveau

Les migrations append-only `0005_identity_advanced`, `0006_api_access` et
`0007_identity_hardening` s'ajoutent à 0001–0004 sans en modifier le SQL ni les
empreintes. Elles ajoutent les facteurs MFA, codes et challenges, états OIDC,
métadonnées de sessions, jetons d'intégration et réglages d'accès. La dernière
migration ajoute le compteur anti-rejeu TOTP et les droits SQL de suppression
nécessaires aux parcours d'identité. `0008_jobs` ajoute la file durable et
l’historique d’exécution sans modifier 0001–0007.

Sauvegarder une instance utilisée avant sa mise à niveau. `pnpm setup:prepare`
complète les secrets `SETUP_TOKEN` et `INTERNAL_TOKEN` manquants dans `.env` sans
remplacer les valeurs existantes. Reconstruire la pile avec `pnpm infra:up` pour
appliquer les migrations et redémarrer les services avec la nouvelle configuration.

## MFA et récupération

Le profil permet de configurer une application TOTP : clé manuelle de 160 bits,
HMAC-SHA1, six chiffres et pas de 30 secondes. La vérification accepte une fenêtre
de ±1 pas et refuse un pas déjà consommé. L'inscription n'est active qu'après
confirmation. Ces choix reposent sur [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).

La confirmation affiche dix codes de récupération `XXXXX-XXXXX`, une seule fois.
Ils disposent de 48 bits aléatoires chacun, sont conservés sous forme de SHA-256
et sont consommés atomiquement. Une connexion exige le mot de passe puis un code
TOTP ou un code de récupération. Le challenge expire après cinq minutes ; les
tentatives de validation sont limitées à dix par challenge sur quinze minutes.
L'OIDC respecte aussi la MFA locale d'un compte qui l'a activée.

L'activation et la désactivation MFA révoquent les autres sessions et les
challenges en cours. La désactivation exige un second facteur. Un changement de
mot de passe exige le mot de passe actuel et révoque les autres sessions ; un
reset par l'administrateur plateforme révoque toutes les sessions du compte
cible. Le reset du mot de passe ne supprime pas sa MFA. La perte simultanée de
l'application et de tous les codes de récupération n'a pas de parcours de
contournement automatique.

Les sessions du profil indiquent création, expiration, dernière activité et agent
utilisateur, sans présenter ce dernier comme une preuve d'identité d'appareil.

## OIDC

Configurer ensemble `OIDC_ISSUER`, `OIDC_CLIENT_ID` et `OIDC_REDIRECT_URI` ;
`OIDC_CLIENT_SECRET` est facultatif. Le redirect URI doit viser la route SPA
`/oidc/callback` de l'origine publique. Les valeurs laissées vides désactivent le
fournisseur. HTTPS est exigé en production.

Avec un secret client, le client utilise `client_secret_basic` (valeur par défaut
de [OIDC Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata))
ou `client_secret_post` si c'est la méthode annoncée. Les authentifications client
par JWT ne sont pas implémentées.

Le parcours utilise discovery, code d'autorisation, nonce et
[PKCE S256, RFC 7636](https://www.rfc-editor.org/rfc/rfc7636). L'état expire après
dix minutes, est lié au navigateur par un cookie HttpOnly distinct et est consommé
avant l'échange de code. La SPA compare aussi l'état avec son stockage de session
et retire le code de l'URL. Les appels réseau ne retiennent pas de transaction SQL.

Les signatures RS256, PS256 et ES256 sont vérifiées avec les clés JWKS ; issuer,
audience, `azp`, expiration, émission, nonce et subject sont contrôlés suivant
[OIDC Core, validation d'ID Token](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation).
Discovery et JWKS sont mis en cache dix minutes, avec rafraîchissement des clés
lorsqu'un nouveau `kid` apparaît. Chaque appel a son propre timeout et les réponses
sont bornées à 128 Kio.

Un compte existant peut lier ou délier une identité depuis son profil. Pour une
connexion, une identité déjà liée est reconnue ; sinon, seule une adresse e-mail
explicitement vérifiée par le fournisseur permet la liaison à un compte local
actif existant. Aucun compte n'est créé implicitement. Le fournisseur configuré
doit donc être digne de confiance pour les adresses qu'il affirme avoir vérifiées.
Une liaison explicite exige le même compte authentifié au début et au retour.

## BFF ↔ Core

`INTERNAL_TOKEN` est un secret partagé de 64 caractères hexadécimaux. Lorsqu'il
est configuré, le Core exige `x-orkobi-internal` sur `/platform/*` et
`/integration/*`. Le BFF utilise exclusivement sa configuration serveur ; un
en-tête navigateur ne remplace pas ce secret. Les sondes `/health*` restent
accessibles pour Docker. Une valeur vide permet le développement local sans
authentification interne ; les nouveaux `.env` générés possèdent un secret.

Les appels navigateur gardent les protections Origin, CSRF et cookies de session.
Le BFF ne relaie les cookies d'état OIDC que sur les routes plateforme. L'API
d'intégration relaie uniquement le Bearer et le secret interne, sans cookie ni
session utilisateur.

## API d'intégration

Le réglage global est **désactivé par défaut**. L'administrateur plateforme peut
l'activer, créer des jetons et les révoquer depuis l'onglet Intégrations. Chaque
organisation possède un réglage supplémentaire, modifiable avec
`organization:write`. Un accès exige le réglage global, une organisation active
et autorisée, un jeton valide et le scope adapté.

Un jeton `okit_` suivi de 64 caractères hexadécimaux n'est affiché qu'à la création.
Seul son SHA-256 est conservé. Un jeton peut être lié à une organisation ou viser
toutes les organisations autorisées. Il possède des scopes fermés, une expiration
facultative côté API, une date de révocation et une dernière utilisation. Le
formulaire demande une expiration. Le créateur doit rester actif et administrateur
plateforme ; sa désactivation ou la perte de son rôle invalide ses jetons.

| API publique BFF                                 | Scope                |
| ------------------------------------------------ | -------------------- |
| `GET /api/integration/organizations`             | `organizations:read` |
| `GET /api/integration/organizations/:id`         | `organizations:read` |
| `GET /api/integration/organizations/:id/modules` | `modules:read`       |
| `GET /api/integration/organizations/:id/audit`   | `audit:read`         |

L'en-tête attendu est `Authorization: Bearer <jeton>`. Les routes Core équivalentes
sont préfixées par `/integration/`. Une liste est filtrée par l'organisation du
jeton et par les réglages ; elle ne révèle pas les organisations refusées. Les
appels réussis et refusés sont audités, sans enregistrer le jeton.

## Routes plateforme ajoutées

| Routes relatives à `/api/platform/`                      | Méthodes et contrôle                                       |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `mfa/login`                                              | POST ; challenge et second facteur                         |
| `mfa/status`, `mfa/enroll`, `mfa/confirm`, `mfa/disable` | GET status, POST mutations ; session + CSRF pour mutation  |
| `profile/password`                                       | POST ; session, CSRF, mot de passe actuel                  |
| `oidc/status`, `oidc/start`, `oidc/callback`             | GET status, POST parcours ; état navigateur et preuve OIDC |
| `oidc`, `oidc/unlink`                                    | GET / POST ; session, CSRF pour suppression                |
| `admin/users/:id/password`                               | POST ; administrateur plateforme                           |
| `admin/integrations`, `admin/integration-tokens`         | GET / POST ; administrateur plateforme                     |
| `admin/integration-tokens/:id/revoke`                    | POST ; administrateur plateforme                           |
| `organizations/:id/integrations`                         | GET `organization:read`, POST `organization:write`         |

## Vérification et limites

`tests/identity.test.mjs` vérifie les vecteurs RFC, les trois signatures JWT,
les refus de claims invalides, la rotation JWKS et les timeouts. La suite
`tests/phase3.integration.mjs` utilise PostgreSQL, le Core, le BFF et un fournisseur
OIDC HTTP synthétique avec de vraies signatures et un contrôle PKCE. Elle teste
MFA, récupération, sessions, changements de mots de passe, liaison OIDC, secret
interne, scopes, isolement des organisations, expiration, révocation et audit.

La recette Chromium couvre les écrans FR/EN sur desktop et viewport mobile avec
des réponses synthétiques. La validation d'un fournisseur externe réel et d'un
appareil mobile physique reste propre au déploiement. Le secret TOTP est conservé
en base sans chiffrement applicatif ; les accès SQL, disques et sauvegardes doivent
être protégés. Les jetons et codes de récupération sont hashés. Redis optionnel et les jobs
sont décrits dans le guide 3.3/3.4 ; aucun connecteur d’écriture métier externe
n’est ajouté.
