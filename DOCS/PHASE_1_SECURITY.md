# Phase 1 — frontières et preuves de sécurité

Revue ciblée des contrôles livrés, avec le skill `security-compliance`.
Ce document ne revendique ni certification, ni audit externe exhaustif.

## Données et frontières

Les données personnelles sont les noms, e-mails, appartenances et traces d'audit.
Les secrets sont les mots de passe, jetons opérateur, cookies de session et mots
de passe SQL. Le navigateur communique avec le BFF de même origine ; le BFF
communique avec le Core sur une origine configurée ; seul le Core accède au dépôt
SQL interne. Les modules de présentation n'exécutent aucun plugin tiers.

## Cinq scénarios d'abus

| Abus                                                                         | Impact                                              | Contrôles et preuves                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rejouer l'installation ou gagner une course au premier compte                | Prise de contrôle plateforme                        | Secret opérateur, verrou transactionnel, ligne d'installation unique ; test concurrent HTTP                                                                                           |
| Voler/fixer une session ou forger une écriture navigateur                    | Usurpation ou modification non autorisée            | Jetons aléatoires renouvelés, empreinte serveur, expiration/révocation, cookies HttpOnly/SameSite/Secure en HTTPS, origine et CSRF ; tests cookies/CSRF/reconnexion                   |
| Deviner les mots de passe ou saturer les dérivations                         | Compromission ou épuisement mémoire                 | scrypt salé asynchrone, dérivation leurre, dix tentatives par compte/quinze minutes, deux calculs concurrents ; tests de refus et format des hashes                                   |
| Changer l'identifiant d'organisation ou déléguer des permissions supérieures | Fuite inter-organisation ou élévation de privilèges | Appartenance active, permission exacte, clauses SQL contextualisées, FK rôle/organisation, aucune exemption implicite plateforme ; tests HTTP et SDK réels sur deux organisations     |
| Retirer le dernier administrateur ou effacer les preuves d'une mutation      | Blocage de l'instance ou perte de traçabilité       | Changements de droits sérialisés, invariant du dernier administrateur, audit transactionnel append-only sous le compte Core ; tests concurrence et refus SQL UPDATE/DELETE de l'audit |

## Contrôles par frontière

- Navigateur/BFF : JSON et en-tête personnalisé pour les écritures, origine exacte,
  aucun CORS permissif, cookie sans Domain, aucune session dans le stockage local,
  CSP et protections existantes, sortie React échappée.
- BFF/Core : routes et méthodes contrôlées, origine fixe, redirections refusées,
  délais et taille bornés, liste fermée d'en-têtes/cookies transférés, erreurs
  recadrées avec la corrélation BFF.
- Core/SQL : validation des entrées, SQL paramétré dans `lib/database`, contexte
  et permissions relus dans la transaction, compte non-superutilisateur, comptes
  migration/exécution distincts, registre de migrations contrôlé.
- Données/journaux : mots de passe hachés avec sel individuel, sessions stockées
  sous empreinte, secrets exclus des logs, audit sans corps arbitraire et écrit
  avec les mutations, sauvegardes à protéger hors Git.

## Preuves reproductibles

- `tests/platform.test.mjs` : dérivation et validation du secret, configuration
  des cookies et erreurs de configuration expurgées.
- `tests/platform.integration.mjs` : Core et BFF réels, compte SQL d'exécution,
  cas d'abus du tableau, sessions après redémarrage, compte désactivé, expirations,
  révocation d'une session étrangère refusée, journal sans secrets.
- `tests/database.integration.mjs` : mise à niveau de 0001, concurrence des
  migrations, rollback, empreintes et refus DDL/écriture du registre.
- `scripts/test-infrastructure.mjs` : projets et bases de recette isolés,
  redémarrage et conservation des données.
- `tests/browser/phase1.mjs` : formulaires, parcours de délégation, accès plateforme
  refusé à un administrateur d'organisation, langues, thèmes et mobile.

## Limites explicites

La pile Compose est locale et sans TLS. Les cookies Secure sont éprouvés dans
les réponses HTTP de test ; un déploiement HTTPS et sa configuration de proxy
ne sont pas validés ici. Le Core, le compte SQL d'exécution et le réseau interne
sont des frontières de confiance ; l'isolation ne protège pas contre leur
compromission. L'authentification interservices, RLS, MFA, OIDC actif et isolation
des plugins relèvent de phases suivantes.

La limitation de connexion est par compte et par processus pour la concurrence
de scrypt ; elle ne remplace pas une protection réseau contre un DDoS ou une
limitation distribuée par origine. La purge des sessions, tentatives et audits
n'est pas planifiée dans cette phase. Une restauration de sauvegarde et les
contrôles BETA/STABLE restent requis avant une publication correspondante.

Références : [sessions OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[CSRF OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[scrypt Node.js](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
