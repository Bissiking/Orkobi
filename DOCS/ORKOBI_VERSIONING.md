# ORKOBI — Politique de versioning et de distribution

> Document de référence proposé · statut : brouillon à valider · version du document : 1.0
>
> Version applicative actuelle déclarée : `0.1.0-EXP`. Ce document décrit une **cible** ; aucune branche, automatisation ou fonctionnalité de mise à jour n'est présumée implémentée.

> Mise au point du 29 octobre 2026 : ce document conserve la proposition générale
> de distribution. Les règles opérationnelles issues de l'examen du dépôt sont
> définies dans [VERSIONING.md](VERSIONING.md), qui prévaut en cas de différence.
> L'initialisation locale est décrite dans [GIT_BOOTSTRAP.md](GIT_BOOTSTRAP.md).

## 1. Objectifs et principes

1. Distinguer **branche Git**, **version du logiciel**, **canal de distribution** et **compatibilité des modules**.
2. Tracer précisément les changements et permettre un retour arrière contrôlé.
3. Protéger les déploiements STABLE des fonctionnalités incomplètes.
4. Autoriser des préversions accessibles aux développeurs et testeurs, sans contaminer STABLE.
5. Garantir que le serveur ne distribue jamais un artefact non vérifié ou incompatible.
6. Conserver une seule source de vérité pour les numéros de version et les métadonnées de publication.

## 2. Schéma de version

Format recommandé : `MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]` selon SemVer 2.0.

- **MAJOR** : rupture de contrat public après 1.0.0 (API, SDK, format de données, comportement incompatible).
- **MINOR** : fonctionnalité rétrocompatible ; avant 1.0.0, toute modification peut encore être incompatible et doit être documentée.
- **PATCH** : correction rétrocompatible sans nouvelle rupture intentionnelle.
- **PRERELEASE** : `dev.N`, `beta.N` ou `rc.N`, N étant un entier positif croissant pour une même version cible.
- **BUILD** : informations facultatives de compilation (par ex. `+sha.a1b2c3d`), sans effet sur l'ordre des versions.

État initial : `0.1.0-EXP` conservé. Après transition : `0.1.1-dev.1`, puis, à une future échéance validée, `0.2.0-beta.1`, `0.2.0-rc.1`, `0.2.0`.

**Attention :** un canal ne doit jamais être déduit uniquement d'un suffixe ; il est déclaré par les métadonnées de publication. Ne jamais réutiliser un tag de version pour un nouvel artefact.

## 3. Branches Git

| Branche                    | Durée de vie | Origine                                 | Destination                                                  | Fonction                                    |
| -------------------------- | ------------ | --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| `main`                     | Permanente   | —                                       | —                                                            | Code de la dernière version STABLE acceptée |
| `develop`                  | Permanente   | `main` à l'initialisation               | —                                                            | Intégration du futur cycle                  |
| `matheo`                   | Permanente   | `develop` à l'initialisation            | PR vers `develop`                                            | Travail personnel de Matheo                 |
| `devops`                   | Permanente   | `develop` à l'initialisation            | PR vers `develop`                                            | Infrastructure et exploitation              |
| `feature/<ticket>-<sujet>` | Temporaire   | `develop`                               | PR vers `develop`                                            | Fonctionnalité                              |
| `fix/<ticket>-<sujet>`     | Temporaire   | `develop` ou `release/*` selon contexte | PR vers branche d'origine                                    | Correctif hors urgence de prod              |
| `release/<version>`        | Temporaire   | `develop`                               | PR vers `main`, puis report vers `develop`                   | Stabilisation, BETA et RC                   |
| `hotfix/<version>`         | Temporaire   | `main`                                  | PR vers `main`, puis report vers `develop` et release active | Urgence STABLE                              |
| `experiment/<sujet>`       | Temporaire   | `develop`                               | PR éventuelle vers `develop`                                 | Recherche exploratoire                      |

**Règles proposées :** PR obligatoire ; contrôles CI à rendre obligatoires après leur mise en place ; pas de push direct sur `main` ; pas de secrets ; pas de fusion de fonctionnalités dans `release/*` sauf décision explicite. Toute suppression de branche demande une validation explicite. Ces protections ne sont pas activées par la seule présence de ce document.

## 4. Canaux de distribution

| Canal                | Cible                      | Source habituelle                            | Conditions                                                      |
| -------------------- | -------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `dev`                | Développeurs               | Snapshot vérifié de `develop`                | Tests minimums réussis ; données jetables                       |
| `beta`               | Testeurs                   | Tag de préversion produit depuis `release/*` | Tests, migrations, compatibilité, notes de version              |
| `stable`             | Utilisateurs en production | Tag final validé sur `main`                  | Validation de release complète                                  |
| `canary` (optionnel) | Test interne éphémère      | Commit sélectionné / `experiment/*`          | Isolation forte ; jamais d'activation automatique en production |

Le canal est une **politique d'accès aux mises à jour** ; il ne crée pas automatiquement une branche homonyme. Une installation reste sur son canal sauf action explicite de l'administrateur.

- `stable` reçoit uniquement des versions finales stable.
- `beta` reçoit les préversions bêta/RC autorisées **et** les versions finales pertinentes.
- `dev` peut recevoir les snapshots DEV et les versions plus stabilisées selon la politique de publication.
- Les passages `stable → beta → dev` exigent consentement et avertissement ; tout retour vers un canal plus stable nécessite une procédure de restauration ou une migration explicitement supportée. **Ne pas faire de downgrade automatique de base de données.**

## 5. Cycle de release

1. Développer sur `feature/*`, réaliser la PR, tester, fusionner sur `develop`.
2. CI sur `develop` : formatage, lint, typage, tests unitaires/intégration, analyse dépendances et sécurité, tests SQL.
3. Publier un snapshot `dev` immuable si la CI réussit.
4. Créer `release/X.Y.Z` depuis `develop` ; geler les nouvelles fonctionnalités.
5. Publier `X.Y.Z-beta.1`, tester parcours utilisateurs, isolation multi-tenant, extensions et migrations sur une copie anonymisée.
6. Publier `X.Y.Z-rc.1` lorsque les blocants sont corrigés ; incrémenter le suffixe pour chaque tentative.
7. Valider la checklist ; intégrer sur `main`, créer le tag signé ou protégé `vX.Y.Z` et publier les artefacts STABLE.
8. Réintégrer les correctifs de `release/*` dans `develop` puis conserver la branche temporaire jusqu'à une éventuelle suppression explicitement validée.
9. Pour incident prod : créer `hotfix/X.Y.Z` depuis `main`, corriger, exécuter les contrôles, publier `X.Y.Z`, puis reporter le correctif dans les lignes actives.

**Contrainte :** ne publier aucun build `stable` à partir d'un simple commit non tagué.

## 6. Fichiers et sources de vérité

Structure **proposée** (à adapter à l'arborescence réelle, non inspectée) :

```text
package.json                       # version SemVer racine, source de vérité applicative
VERSIONING.md                      # politique et modes opératoires (ce document)
CHANGELOG.md                       # historique orienté utilisateurs
.github/workflows/ci.yml           # validations PR
.github/workflows/release.yml      # publication contrôlée
config/update-channels.json        # configuration des canaux, pas un index de releases
```

Pour éviter les dérives, `package.json` fixe la version logicielle du monorepo et la CI en génère les métadonnées (`gitSha`, `buildId`, `publishedAt`, `artifactDigest`). Ne pas modifier plusieurs numéros de version manuellement dans différents fichiers.

### Exemple `config/update-channels.json`

```json
{
  "$schemaVersion": 1,
  "defaultChannel": "stable",
  "channels": {
    "stable": {
      "enabled": true,
      "allowPrerelease": false,
      "autoDownload": false,
      "autoInstall": false
    },
    "beta": {
      "enabled": false,
      "allowPrerelease": true,
      "autoDownload": false,
      "autoInstall": false
    },
    "dev": {
      "enabled": false,
      "allowPrerelease": true,
      "autoDownload": false,
      "autoInstall": false
    },
    "canary": {
      "enabled": false,
      "allowPrerelease": true,
      "autoDownload": false,
      "autoInstall": false
    }
  }
}
```

La configuration ci-dessus est **illustrative** : elle exprime des préférences, pas un moteur d'update déjà disponible.

## 7. Contrat d'un manifeste de publication

Exemple de charge utile future pour l'API de mise à jour :

```json
{
  "schemaVersion": 1,
  "product": "orkobi-core",
  "version": "0.2.0-beta.1",
  "channel": "beta",
  "publishedAt": "2026-11-10T12:00:00Z",
  "gitSha": "0123456789abcdef0123456789abcdef01234567",
  "artifacts": [
    {
      "platform": "linux-amd64",
      "url": "https://updates.example.invalid/orkobi/0.2.0-beta.1/orkobi.tar.gz",
      "sha256": "<sha256-hex-a-remplacer>",
      "signature": "<signature-a-remplacer>"
    }
  ],
  "requirements": {
    "minDatabaseSchema": 12,
    "minSdkApi": "0.2",
    "requiresBackup": true,
    "requiresDowntime": true
  },
  "releaseNotesUrl": "https://updates.example.invalid/notes/0.2.0-beta.1"
}
```

Ce manifeste est un **exemple non fonctionnel**. Pour une mise en œuvre, définir un schéma JSON versionné, vérifier l'authenticité du manifeste (signature, pas seulement TLS), l'empreinte des artefacts, le domaine autorisé et la protection contre les retours à une version compromise.

## 8. Versioning du Core, du SDK et des modules

- **Core** : version produit unique `MAJOR.MINOR.PATCH[-...]`.
- **SDK public** : version autonome _si_ son rythme de publication devient indépendant, sinon même version que le Core au départ.
- **Module/plugin** : sa propre version SemVer ; ne doit pas usurper celle du Core.
- Chaque plugin déclare une plage de compatibilité explicite (`core`, `sdk`, version de manifeste plugin et capacités requises).
- Éviter de coupler automatiquement la version de la base de données, du protocole d'API et des plugins à la version produit : maintenir des numéros séparés pour ces contrats.
- En cas de rupture d'API SDK, augmenter la version correspondante et bloquer l'installation d'un plugin incompatible avec un diagnostic explicite.
- Ne jamais accorder de permissions supplémentaires à un plugin lors d'une mise à jour sans approbation appropriée.

Exemple **conceptuel** de manifeste plugin :

```json
{
  "id": "orkobi.planning",
  "version": "0.3.0",
  "compatibility": {
    "core": ">=0.2.0 <0.4.0",
    "sdk": ">=0.2.0 <0.3.0"
  },
  "permissions": ["employees:read:pseudonymized", "planning:write"]
}
```

## 9. Base de données, multi-tenant et sécurité

Avant publication BETA/STABLE :

- Tester les migrations sur une copie réaliste, **anonymisée**, et vérifier leur rejouabilité selon la stratégie choisie.
- Sauvegarder la DB et vérifier la possibilité de restauration complète avant mise à jour.
- Favoriser les migrations **expand/contract** pour permettre de courts chevauchements de versions.
- Tester les contrôles d'organisation, les permissions, l'absence de fuite inter-tenant et l'isolation des plugins.
- Éviter les migrations destructrices tant que l'ancienne version est supportée.
- Définir un chemin de restauration : retour arrière du code seul uniquement si la DB reste compatible, sinon restauration coordonnée de DB.
- En cluster, empêcher des versions de services incompatibles de cohabiter.

## 10. Métadonnées disponibles à l'exécution

Un endpoint authentifié ou public selon le niveau de sensibilité, par exemple `GET /api/system/version`, pourrait présenter :

```json
{
  "product": "Orkobi",
  "version": "0.2.0-beta.1",
  "channel": "beta",
  "commit": "0123456",
  "build": "ci-184",
  "updateAvailable": false
}
```

Ne jamais exposer des secrets d'infrastructure, données d'organisation, tokens ou chemins internes.

## 11. Convention de commits et changelog

Conventional Commits recommandé : `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`, `chore:` ; `!` ou `BREAKING CHANGE:` pour marquer les ruptures.

`CHANGELOG.md` : sections **Added / Changed / Deprecated / Removed / Fixed / Security**, avec date ISO et liens PR/issue lorsque possible. Documenter chaque changement de permissions et chaque migration.

## 12. Critères de passage entre canaux

| Passage         | Conditions minimales                                                                          |
| --------------- | --------------------------------------------------------------------------------------------- |
| Commit → DEV    | CI verte ; build reproductible ; aucun secret détecté                                         |
| DEV → BETA      | Fonctionnalités gelées ; QA intégration ; migrations répétées ; vérification permissions      |
| BETA → RC       | Aucun bug bloquant connu ; recette installation/mise à jour ; signatures et hash valides      |
| RC → STABLE     | Validation manuelle ; sauvegarde/restauration testées ; changelog ; approbation release       |
| STABLE → HOTFIX | Correctif ciblé ; tests de non-régression ; publication corrective ; report des modifications |

**Politique de vulnérabilités :** une faille critique exploitable bloque la promotion ; une exception nécessite une décision documentée et limitée dans le temps.

## 13. Automatisation progressive

**Phase A (maintenant)** : convention SemVer, branches protégées, version unique `package.json`, CHANGELOG, PR et tags Git.

**Phase B (avant bêta publique)** : CI, releases automatiques depuis tags, artefacts immuables, tests de migration et compatibilité SDK/modules.

**Phase C (avant mises à jour intégrées)** : registre de releases signé, API de canaux, interface de notification des updates, contrôles d'éligibilité et sauvegardes.

**Phase D (après stabilisation)** : déploiements progressifs par cohortes, rollback orchestré, désactivation d'une release compromise, historique d'audit.

## 14. Décisions à formaliser

1. `package.json` racine unique ou versions indépendantes pour plusieurs packages du monorepo ?
2. Distribution : images Docker, tarballs, packages npm, application hébergée ou combinaison ?
3. Qui autorise une release stable : mainteneur, équipe ou pipeline avec approbation ?
4. Politique de maintenance des anciennes versions et durée de support ?
5. SDK et plugins : quelle version de contrat fait foi ?
6. Mises à jour : notification seule, téléchargement assisté ou déploiement piloté ?

## 15. Politique initiale proposée pour Orkobi

- Version actuelle inchangée : **`0.1.0-EXP`**.
- Branches durables : **`main`, `develop`, `matheo` et `devops`**.
- Canaux accessibles au départ : **DEV interne** ; BETA puis STABLE lors de leur première publication validée.
- CANARY : configuré mais désactivé.
- Aucun auto-update ni downgrade automatique avant conception explicite du mécanisme.
- Une release stable est **immuable, traçable et validée**.

---

### Références

- Semantic Versioning 2.0.0 : https://semver.org/
- Gitflow (Atlassian) : https://www.atlassian.com/fr/git/tutorials/comparing-workflows/gitflow-workflow
- npm dist-tags : https://docs.npmjs.com/cli/commands/npm-dist-tag/
