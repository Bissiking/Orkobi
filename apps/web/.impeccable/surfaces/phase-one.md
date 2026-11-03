---
version: 1
slug: 'phase-one'
primary_target: 'apps/web/src/platform/pages.tsx'
related_targets: ['apps/web/src/App.tsx', 'apps/web/src/platform/styles.css']
---

# Phase 1 — accès et administration

Mode : Operate. Extension du shell Orkobi existant, sans changement de système
visuel ni nouvelle exploration de concept. Référence produit : `PRODUCT.md`.

## Parcours et autorité

La première installation crée le premier compte administrateur plateforme.
L'administration plateforme crée les comptes et les organisations, puis délègue
la gestion des membres et des rôles d'organisation selon les permissions accordées.
Les écrans distinguent connexion, profil, administration plateforme et contexte
d'organisation. Le catalogue reste une présentation des modules futurs.

## Système hérité

`DESIGN.md`, `.impeccable/design.json` et le brief
`apps/web/.impeccable/surfaces/apps-web-src-app-tsx.md` restent les références
existantes. Aucun de ces fichiers n'a été modifié pendant cette documentation.

La lecture de `apps/web/src/styles.css`, `apps/web/src/platform/styles.css` et
`apps/web/src/App.tsx`, confrontée aux captures ci-dessous, confirme la continuité :

- Manrope Variable, encre ardoise et bleu fonctionnel ; variables sémantiques
  partagées par les thèmes clair et sombre.
- Panneaux plats à bordure fine, contrôles natifs, actions explicites et focus
  hérités du shell ; aucune ombre ni nouvelle palette.
- Rail et barre de contexte existants, navigation mobile en tiroir, français et
  anglais ; mêmes seuils de mise en page à 1180, 879 et 620 px.
- Formulaires et listes dans des panneaux ; tables à défilement horizontal sur
  mobile, avec région nommée et focalisable. La capture mobile des actions montre
  la dernière colonne après défilement.

Les nouveaux panneaux et formulaires documentent cette surface seulement : leurs
mesures locales ne deviennent pas de nouveaux tokens normatifs.

## Éléments de preuve

Captures de recette sous `output/playwright/`, avec données synthétiques de test :

- `phase1-users-desktop.png` : administration des comptes et formulaire de création.
- `phase1-roles-desktop.png` : rôles, permissions et formulaire de création.
- `phase1-members-edit-desktop.png` : membre sélectionné et modification de l'accès.
- `phase1-members-mobile.png` : liste et attribution d'accès, thème clair.
- `phase1-members-dark-mobile.png` : même surface en thème sombre.
- `phase1-members-mobile-actions.png` : colonne d'action accessible par défilement.
- `phase1-login-desktop.png` : connexion dans le shell hérité.

Ces sept captures ont été ouvertes pour vérifier la continuité documentaire avec
le code. Cette étape n'ajoute ni nouvelle critique visuelle ni revue de sécurité.
La revue indépendante de finition a déclaré les trois corrections soumises
résolues, avec disposition « ship » pour ces corrections. Ce résultat ne vaut pas
validation exhaustive de toutes les surfaces. Aucun détecteur n'a été exécuté.

## Couverture documentaire antérieure

Le `DESIGN.md`, son sidecar et le premier brief décrivent encore le shell initial,
ses états de préparation et ses composants de base. Leur couverture ne
recense pas les formulaires, tables et parcours authentifiés de Phase 1. Cette
limite est consignée ici ; aucune actualisation de ces références n'est autorisée
dans cette extension. Les couleurs et la typographie observées restent cohérentes
avec leurs valeurs normatives.
