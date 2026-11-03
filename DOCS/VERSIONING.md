# Orkobi — Stratégie Git et règles de versioning

Règles préparées le 29 octobre 2026, actualisées le 3 novembre 2026.
Version préparée : **`0.3.0-dev.1`**, canal déclaré `dev` dans `package.json`. Ce document définit la procédure ; il ne
constitue ni une publication ni la preuve d'une protection GitHub active.
Le [diagnostic d'initialisation](GIT_BOOTSTRAP.md) distingue les actions locales
réalisées et les actions distantes en attente.

## 1. Branches, versions, tags et canaux

- Une branche est une ligne de travail et d'intégration.
- La version produit est celle du `package.json` racine.
- Un tag identifie le commit exact d'une publication ; il ne doit jamais être déplacé.
- Un canal (`dev`, `beta`, `stable`) définit l'éligibilité d'une publication.

Un commit ou un `git pull` ne change pas automatiquement la version. Un pull
ne réalise ni installation de dépendances, ni build, ni migration, ni déploiement.
Les étapes techniques « 0.1 » et « 0.2 » de la phase 0 ne correspondent pas
aux versions produit 0.1.0-EXP et 0.2.0.

## 2. Branches permanentes

| Branche   | Base initiale                                          | Rôle                                          | Intégration                                                                               |
| --------- | ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `main`    | Historique existant conservé                           | Base de référence, puis publications validées | PR depuis `release/*` ou `hotfix/*` ; PR d'initialisation exceptionnelle depuis `develop` |
| `develop` | `main` synchronisé, avec le commit local de fondations | Intégration du prochain cycle                 | PR depuis branches de travail                                                             |
| `matheo`  | `develop`                                              | Travail personnel de Matheo                   | PR vers `develop`                                                                         |
| `devops`  | `develop`                                              | Infrastructure et exploitation                | PR vers `develop`                                                                         |

`main` contient actuellement des fondations expérimentales : son nom ne prouve
pas une stabilité produit. Aucune version STABLE n'est annoncée.
À l'initialisation du 29 octobre, les trois branches de travail démarrent au
même commit local que `main`, sans suivi distant avant leur premier push
approuvé. Ce constat historique n'est pas un audit de leurs positions actuelles.

`matheo` et `devops` ne fusionnent pas directement l'une dans l'autre : les
changements partagés passent par `develop`. Une évolution volumineuse peut être
isolée sur `feature/<sujet>` ou `fix/<sujet>` depuis `develop`.

## 3. Synchroniser sans réécrire l'historique

Vérifier un arbre propre avant de changer de branche. Commiter les travaux en
cours ; ne pas utiliser automatiquement reset, stash, rebase, amend ou force push.

```sh
git status --short --branch
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch matheo
git merge --no-edit develop
```

Pour `devops`, remplacer la dernière sélection par `git switch devops`.
La fusion conserve les commits existants ; elle peut créer un commit de merge
lorsque la branche a divergé. En cas de conflit, examiner et résoudre les fichiers
puis valider le résultat avant de commiter. Ne jamais écraser les travaux locaux.

Si une branche personnelle possède un upstream, récupérer aussi ses changements
avec `git pull --ff-only` avant de fusionner `develop`. Si ce pull refuse une
divergence, examiner `git log --graph --oneline --all`, puis préparer une fusion
explicite ; ne pas contourner le refus par un push forcé.

Après fusion d'une PR, actualiser `develop`, puis fusionner `develop` dans les
branches permanentes de travail. Les branches personnelles sont conservées.

## 4. Protection de main et Pull Requests

Configuration GitHub **proposée**, à appliquer uniquement après validation :

- Imposer une PR avant fusion sur `main` et résoudre les conversations ouvertes.
- Interdire les force pushes et les suppressions de `main` ; conserver les historiques.
- Imposer une approbation indépendante lorsqu'un second mainteneur est disponible.
  En fonctionnement individuel, une approbation obligatoire par un tiers bloquerait
  toutes les PR : choisir explicitement ce réglage lors de l'activation.
- Appliquer les règles aux administrateurs, avec une procédure d'exception documentée.
- Ajouter les contrôles CI requis une fois qu'ils existent et ont été observés :
  formatage, lint, compilation, typage et tests (`pnpm check`, `pnpm typecheck`).
- Vérifier que la branche est à jour avant fusion une fois ces contrôles opérationnels.
- Préserver les commits via les merges de PR ; ne pas imposer un historique linéaire
  incompatible avec cette stratégie de synchronisation par fusion.

Proposer également PR et contrôles sur `develop`. Aucun workflow `.github` ni
contrôle distant n'existait lors du diagnostic ; aucun statut imaginaire ne doit
être configuré comme obligatoire. Les réglages GitHub actuels n'ont pas été audités
ou modifiés par cette initialisation locale.

Référence : [protection des branches GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Une PR décrit le problème résolu, les changements, les commandes réellement
exécutées, les preuves et leurs limites. Pas de fusion automatique, de publication
ou de déploiement implicite. Les pushes demandent une validation explicite pour
cette initialisation.

## 5. Sources de version examinées

Le `package.json` racine est la source produit. Les **18 manifests privés**
suivent actuellement la même version : racine, `apps/*`, `lib/*`, `sdk/*`,
`modules/*`, `examples/*` et `tests/types`. `pnpm version:check` découvre ces
packages et refuse une différence de version ou une étiquette Docker locale
incohérente ; ce contrôle ouvre aussi `pnpm check`.

Métadonnées et représentations :

- `package.json` : `version` et `orkobi.channel`, ici `dev` ; cette métadonnée
  n'active aucun service de distribution ou de mise à jour.
- `apps/core/src/version.ts` lit la racine pour OpenAPI et la compatibilité.
- `apps/bff/src/config.ts` lit la même racine pour le bootstrap produit.
- `apps/web/vite.config.ts` injecte cette version au build du frontend.
- `compose*.yaml` emploie des étiquettes locales alignées, contrôlées par le script.
- README, guides courants, roadmap, changelog et notes de préversion suivent la
  livraison préparée ; les rapports de preuve conservent leur version d'exécution.

Le SDK reste privé et versionné avec le produit ; ses archives locales portent
la version courante. La version du **manifeste fonctionnel** d'un module ou plugin
reste autonome : `orkobi.demo` et les modules métier déclarent `0.1.0`, l'exemple
`community.cards` déclare `1.0.0`. Leurs packages de développement pnpm suivent
la version commune, pas leurs versions de manifeste.

Les versions de migration, `pluginApiVersion:1`, migrations internes de plugins,
plages de compatibilité, exemples SemVer et `lockfileVersion` ne sont pas des
copies de la version produit. Ne jamais les modifier par remplacement global.
Aucun SQL/checksum historique n'est modifié lors d'un changement de version.

## 6. Procédure de changement de version

La demande de versionnement du 3 novembre 2026 prépare **0.3.0-dev.1**. Les
[notes associées](RELEASE_0_3_0_DEV_1.md) séparent validation locale et publication.
Pour une prochaine version :

1. Choisir la cible `MAJOR.MINOR.PATCH[-dev.N|-beta.N|-rc.N]` et le canal déclaré.
   Avant 1.0.0, documenter toute rupture. `dev.N` appartient au canal `dev`,
   `beta.N`/`rc.N` au canal `beta`, une finale au canal `stable`.
2. Modifier la racine et tous les manifests privés du workspace. Ne lancer aucune
   commande de publication ; conserver les versions propres aux manifestes plugins.
3. Aligner les étiquettes des quatre Compose, README et documentation courante.
   OpenAPI/BFF/frontend liront automatiquement la racine après rebuild/redémarrage.
4. Régénérer le lockfile avec pnpm seulement si nécessaire et examiner le diff.
   Les dépendances `workspace:*` ne changent pas lors du seul bump commun.
5. Lancer `pnpm install --frozen-lockfile`, `pnpm version:check`, `pnpm check`,
   `pnpm typecheck`, puis les contrôles SDK et de compatibilité concernés.
6. Préparer et faire examiner la PR avant intégration. Un numéro dans les fichiers
   n'est ni un tag ni une publication. Ne créer/pousser de tag qu'après autorisation
   explicite de publication et vérification du commit retenu.

Les tests de compatibilité utilisent les plages minimales de comparateurs du
Core ; ce n'est pas le résolveur npm des ranges. Une préversion est inférieure
à sa finale : les plages actuelles `>=0.2.0-EXP <0.3.0` acceptent `0.3.0-dev.1`,
mais refuseront `0.3.0`. Avant une finale, revoir explicitement ces déclarations
et les versions des paquets distribués ; ne pas élargir leur compatibilité en silence.

## 7. Cycle de publication

### Développement

Travail sur `matheo`, `devops` ou branche temporaire, puis PR vers `develop`.
Les snapshots `dev` restent futurs, immuables et réservés aux environnements de
développement ; leur publication demande les validations et l'autorisation requises.
La branche `devops` ne déclenche pas de déploiement par son seul nom.

### Release

Au début d'une stabilisation approuvée, créer `release/X.Y.Z` depuis un `develop`
propre et synchronisé. Aucune branche release vide n'est créée préventivement.
Geler les nouvelles fonctionnalités ; préparer `X.Y.Z-beta.1`, puis incrémenter
le suffixe pour chaque nouvelle préversion publiée. Passer à `rc.N` après recette.

Avant une finale : contrôles CI, installation, mises à jour, migrations,
sauvegarde/restauration, isolation des organisations, compatibilité SDK/plugins
et [fiche de publication](RELEASE_CHECKLIST.md). Si une fonctionnalité est absente,
l'indiquer ; ne pas valider artificiellement un critère de publication.

Préparer la version finale `X.Y.Z`, puis PR `release/X.Y.Z` vers `main`.
Après fusion, vérifier le commit exact, l'égalité tag/manifests/OpenAPI et les
contrôles sur ce commit. Créer une fois le tag annoté ou signé `vX.Y.Z`, puis
publier uniquement après approbation explicite. Un tag n'est jamais déplacé ni réutilisé.
Les préversions suivent la même règle d'immuabilité avec leur suffixe complet.

Après livraison, reporter les corrections de `main` vers `develop` par une PR
de synchronisation, puis fusionner `develop` dans `matheo` et `devops`.
Conserver la branche release jusqu'à une éventuelle suppression explicitement validée.

### Hotfix

Lors d'un incident sur une version réellement publiée, créer `hotfix/X.Y.Z`
depuis le `main` synchronisé correspondant à la ligne stable concernée.
Choisir un nouveau numéro PATCH, corriger, synchroniser les versions et tester.
PR vers `main`, puis tag et publication selon les mêmes autorisations qu'une release.
Reporter ensuite le correctif par PR vers `develop` et toute release active concernée,
en gardant la version propre à chaque ligne. Enfin, resynchroniser les branches
de travail. Ne pas créer de hotfix tant qu'aucun incident ne le justifie.

## 8. Distribution et données

Les canaux et manifestes d'update restent des conventions futures : voir la
[proposition de distribution](ORKOBI_VERSIONING.md). Aucun auto-update, registry
signé ou endpoint de version n'est livré par cette stratégie Git.
Une publication stable provient d'un tag final validé sur `main`.
Sélectionner une version déployée exacte et vérifier les artefacts ; ne pas
confondre le succès d'un pull avec le succès d'un déploiement.

Les versions des migrations restent distinctes de la version produit. Prévoir
sauvegarde et restauration testée avant mise à jour des données. Aucun downgrade
automatique, déplacement de tag, suppression de branche ou réécriture d'historique
n'est autorisé par cette procédure.
