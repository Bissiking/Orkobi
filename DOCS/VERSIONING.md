# Orkobi — Stratégie Git et règles de versioning

Règles préparées le 29 octobre 2026 après examen du dépôt.
Version conservée : **`0.1.0-EXP`**. Ce document définit la procédure ; il ne
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
Les trois nouvelles branches démarrent au même commit local que `main`.
Elles n'ont pas de branche distante suivie avant leur premier push approuvé.

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

Le monorepo utilise initialement une **version fixe commune** pour douze manifests privés :

- `package.json` (source produit) ;
- `apps/{core,bff,web}/package.json` ;
- `lib/{contracts,database,events,identity,security}/package.json` ;
- `sdk/{core,types}/package.json` ;
- `tests/types/package.json`.

Tous déclarent `0.1.0-EXP`. Le SDK n'est pas encore publié indépendamment.
Les applications BFF et frontend rejoignent cette règle depuis le lot 0.3.
Les futurs modules/plugins pourront avoir leurs versions propres et devront déclarer
la compatibilité Core/SDK ; leur numéro ne sera pas changé automatiquement avec le Core.

Représentations actuellement maintenues explicitement :

- `apps/core/src/application.ts` : version de la documentation OpenAPI ;
- `apps/bff/src/config.ts` : métadonnées produit lues dans le manifeste racine ;
- `apps/web/vite.config.ts` : version du frontend injectée depuis la même racine au build ;
- `tests/core.test.mjs` : assertion sur cette version ;
- `README.md`, titres des guides courants et cible de `DOCS/ROADMAP.md` ;
- `CHANGELOG.md` : section de livraison et notes associées.

Le lockfile pnpm enregistre les dépendances ; sa `lockfileVersion` n'est pas
la version du produit. Les entrées historiques du changelog et du rapport de
bootstrap gardent leur numéro d'origine. Les numéros d'exemples sont illustratifs.
Le BFF et le frontend lisent désormais la version racine ; la synchronisation
des manifests et d'OpenAPI reste explicite. Aucune CI de publication n'est disponible.

## 6. Procédure de changement de version

**Aucun changement de version dans l'initialisation actuelle.** Un changement
ultérieur doit être demandé et préparé dans une PR dédiée :

1. Choisir explicitement la version cible et le canal. Format SemVer :
   `MAJOR.MINOR.PATCH[-dev.N|-beta.N|-rc.N][+build]`. `EXP` reste conservé pour
   l'état courant ; avant 1.0.0, documenter toute rupture de contrat.
2. Fixer la version racine et synchroniser les onze autres manifests privés
   dans le même commit. Ne pas utiliser une commande de publication automatique.
3. Mettre à jour la version OpenAPI, son assertion et les documents courants.
   Préserver les versions historiques et les versions indépendantes des plugins.
4. Régénérer le lockfile avec pnpm si ses importers changent ; examiner le diff.
5. Exécuter `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm typecheck` et
   vérifier l'égalité des douze champs `version` avec la source racine.
6. Faire examiner et intégrer la PR. Ne créer aucun tag avant validation de publication.

Une automatisation future pourra générer les métadonnées depuis la racine et
contrôler leur cohérence. Son ajout demandera une évolution explicite de cette procédure.

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
