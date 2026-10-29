# Initialisation de la stratégie Git — 29 octobre 2026

## Diagnostic avant intervention

- Dépôt : `https://github.com/Bissiking/Orkobi.git` (`origin`).
- Branche courante et seule branche locale : `main`.
- `git fetch origin` et `git ls-remote --heads origin` : seule branche distante
  `main`, au commit `bc1ada4fed0e15c357e04f96daaf46607ca83839`.
- `git rev-list --left-right --count main...origin/main` : `0 0`.
- Des modifications et fichiers non suivis constituent le lot des fondations
  0.1/0.2, ses tests et sa documentation ; ils doivent être commités avant
  la création des nouvelles branches. Les `.DS_Store` restent ignorés.
- Dix manifests privés vérifiés : tous en `0.1.0-EXP`. Aucune modification de version.
- Aucun workflow `.github` présent. Les règles GitHub distantes ne sont pas auditées
  ni modifiées ; leur protection reste une proposition dans [VERSIONING.md](VERSIONING.md).

## Plan local retenu

1. Documenter les quatre branches permanentes, les PR, les cycles `release/*`
   et `hotfix/*`, ainsi que les sources et règles de synchronisation des versions.
2. Vérifier le formatage, les tests, le typage et le contenu à commiter. Exclure
   environnement privé, dépendances, artefacts générés et fichiers macOS.
3. Créer un commit normal sur `main` local avec le travail des fondations et
   cette documentation. Ce commit de bootstrap précède l'adoption des PR ; il
   n'autorise pas de push direct sur `main` distant.
4. Exécuter `git pull --ff-only origin main`. Si une divergence apparaît,
   s'arrêter pour l'examiner ; aucun rebase, reset ou push forcé n'est autorisé.
5. Définir la base commune comme le `main` local après ce pull : historique
   distant conservé et commit local des fondations inclus.
6. Créer `develop` depuis cette base, puis `matheo` et `devops` depuis `develop`.
   Revenir sur `matheo`. Aucune branche temporaire vide n'est nécessaire.
7. Vérifier un arbre propre, les quatre SHA identiques et la présence de
   `origin/main` dans leur ascendance. Aucun push ni suivi distant n'est créé.

Commandes locales après le commit :

```sh
git switch main
git pull --ff-only origin main
git switch -c develop main
git switch -c matheo develop
git switch -c devops develop
git switch matheo
git status --short --branch
git branch -avv
```

La validation des fondations est consignée dans [REVIEW_PHASE_0.md](REVIEW_PHASE_0.md).
Le SHA du nouveau commit et les résultats des opérations sont à vérifier dans
Git et dans le compte rendu de cette intervention ; aucun SHA futur n'est inventé.

## Actions distantes en attente de validation explicite

Ces commandes sont préparées et **ne font pas partie de l'exécution locale** :

```sh
# Uniquement après approbation des pushes de ces trois branches.
git push -u origin develop
git push -u origin matheo
git push -u origin devops
```

Ne pas pousser directement le `main` local. Après publication autorisée des
branches, préparer une PR d'initialisation `develop` vers `main`, avec les preuves
du lot et la revue demandée. Sa fusion conserve les commits existants. Après
fusion approuvée, `git pull --ff-only origin main` pourra avancer `main` local
sur le résultat distant, puis une PR de synchronisation actualisera `develop`.

Les protections proposées dans [VERSIONING.md](VERSIONING.md) nécessitent une
validation séparée des réglages : PR obligatoire, blocage des force pushes et
des suppressions, choix des approbations et futurs contrôles CI effectivement
disponibles. Aucun tag, release, déploiement ou suppression de branche n'est
autorisé par la préparation de ces commandes.
