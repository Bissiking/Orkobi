---
name: Orkobi
description: Un espace de gestion modulaire, clair et adaptable.
colors:
  page: '#f5f7fa'
  surface: '#fff'
  surface-soft: '#f1f4f8'
  ink: '#223047'
  muted: '#627087'
  line: '#e0e6ee'
  accent: '#2458bb'
  accent-hover: '#1c479a'
  accent-soft: '#eaf0fc'
  on-accent: '#fff'
  success: '#24704f'
  warning: '#81571b'
  warning-soft: '#fff6e7'
  ring: '#437ce4'
  dark-page: '#151b26'
  dark-surface: '#1c2432'
  dark-surface-soft: '#242e3f'
  dark-ink: '#e1e8f4'
  dark-muted: '#a2b0c5'
  dark-line: '#334156'
  dark-accent: '#91b6ff'
  dark-accent-hover: '#b0caff'
  dark-accent-soft: '#2a3b5d'
  dark-on-accent: '#142643'
  dark-success: '#8acbab'
  dark-warning: '#e4bb7a'
  dark-warning-soft: '#372d21'
  dark-ring: '#91b6ff'
typography:
  headline:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: '27px'
    fontWeight: 750
    lineHeight: 1.35
    letterSpacing: '-0.035em'
  title:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: '17px'
    fontWeight: 700
    letterSpacing: '-0.025em'
  body:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: '12px'
    lineHeight: 1.75
  label:
    fontFamily: "'Manrope Variable', sans-serif"
    fontSize: '11px'
    fontWeight: 650
rounded:
  badge: '4px'
  control: '6px'
  navigation: '7px'
  option: '9px'
  panel: '12px'
spacing:
  xs: '4px'
  sm: '8px'
  control-gap: '10px'
  md: '12px'
  grid: '16px'
  mobile-gutter: '18px'
  panel-heading: '20px'
  lg: '24px'
  panel: '30px'
  desktop-gutter: '40px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '10px 15px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '10px 15px'
  button-disabled:
    backgroundColor: '{colors.surface-soft}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '10px 15px'
  search-field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.navigation}'
    padding: '0 12px'
    width: '300px'
  navigation-active:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent}'
    rounded: '{rounded.navigation}'
    padding: '10px 12px'
  preparation-label:
    backgroundColor: '{colors.surface-soft}'
    textColor: '{colors.muted}'
    rounded: '{rounded.badge}'
    padding: '4px 7px'
  module-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
    padding: '22px'
  theme-option-selected:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.ink}'
    rounded: '{rounded.option}'
    padding: '20px 18px'
---

# Design System: Orkobi

## Overview

**Creative North Star: "Un espace de gestion clair"**

Orkobi emploie les repères familiers d’un tableau de bord de gestion : rail de navigation, barre de contexte et surfaces structurées. Le bleu signale les actions et les sélections ; l’encre ardoise, les bordures fines et les fonds froids organisent la lecture. La densité reste contenue, sans effets décoratifs dominants.

Ce système décrit le shell réellement construit dans `apps/web`, après revue du rendu ordinateur et mobile. Odoo et Microsoft Business Central sont les repères de clarté confirmés, sans reprise de leur identité. Les états de préparation, les modules futurs et les services HTTP sont présentés explicitement ; ces surfaces ne prouvent pas la disponibilité de parcours métier.

**Key Characteristics:**

- Une seule famille typographique, Manrope, avec des graisses hiérarchisées.
- Des surfaces plates, séparées par la couleur et des bordures fines.
- Un bleu fonctionnel partagé par les actions, les icônes et la sélection.
- Des thèmes clair, sombre et système ; du français par défaut et de l’anglais.

## Colors

La palette associe un bleu d’action à des neutres froids ; les valeurs normatives des deux thèmes sont dans le frontmatter. Les clés `dark-*` correspondent aux remplacements appliqués par `data-theme="dark"`, et non à une seconde identité.

### Primary

- **Bleu de gestion** (`accent`, `accent-hover`) : boutons principaux, liens, pictogrammes et sélection. En sombre, le bleu devient plus clair et utilise l’encre inversée `on-accent`.
- **Bleu de sélection** (`accent-soft`) : fond des liens actifs, filtres pressés et choix de thème sélectionné.
- **Bleu de focus** (`ring`) : contour visible des contrôles au clavier.

### Neutral

- **Fond froid** (`page`) : canevas général derrière les panneaux.
- **Surface de travail** (`surface`) : rail, barre de contexte, cartes et champs.
- **Surface douce** (`surface-soft`) : notes, panneau explicatif et fonds secondaires. `surface-hover` existe dans la feuille, mais n’est pas utilisé par les composants actuels et ne doit pas devenir un nouveau traitement sans motif.
- **Encre ardoise** (`ink`) : titres et contenu principal ; **encre secondaire** (`muted`) : descriptions, repères et légendes.
- **Trait de structure** (`line`) : séparateurs et contours fins.

Le **vert de disponibilité** (`success`) indique les services joignables et la sauvegarde locale réussie. L’**ambre de vigilance** (`warning`, `warning-soft`) indique l’indisponibilité ou l’impossibilité de sauvegarder les préférences. Ces couleurs de statut ne constituent pas des accents de marque. Chaque état comporte un libellé, avec un point ou un pictogramme lorsque le composant le prévoit.

**The Functional Blue Rule.** Réserver le bleu aux actions, à la sélection, au focus et aux pictogrammes qui orientent la lecture.

## Typography

**Display Font / Body Font:** Manrope Variable, avec repli sans-serif. La police est importée depuis `@fontsource-variable/manrope` et servie avec l’application ; aucune police distante n’est nécessaire. Aucun caractère d’affichage ou monospace distinct n’est installé.

La hiérarchie repose sur les graisses, la taille et des approches légèrement serrées dans les titres. Les titres s’équilibrent sur plusieurs lignes ; les descriptions gardent un interligne généreux.

- **Headline** : titre de page, rôle `headline` du frontmatter. Il passe à une taille compacte (24 px) sous le premier seuil, puis à une taille mobile (26 px, interligne 1.4) sous le dernier seuil.
- **Title** : titres de section, rôle `title`. Les titres du contenu principal d’organisation sont plus grands ; les titres de cartes et de lignes sont plus compacts selon leur importance.
- **Body** : descriptions courantes (12 px, interligne 1.75). Les paragraphes ont une largeur maximale générale (70 ch), resserrée dans certains panneaux.
- **Label** : boutons et contrôles compacts, rôle `label`. Les titres de cartes utilisent une graisse plus marquée (750).
- **Métadonnées** : tailles observées plus petites (9–11 px) pour les badges, le pied de page et les informations secondaires. Elles décrivent la densité actuelle, sans fixer un minimum de lecture pour les futurs écrans. Les versions, nombres de résultats et heures de vérification utilisent des chiffres tabulaires.

## Layout

Sur ordinateur, le rail fixe occupe une largeur stable (232 px). La barre de contexte s’étend à droite (72 px de haut). Le contenu possède une largeur maximale (1500 px), des marges automatiques et des gouttières latérales (40 px). Le flux vertical conserve le pied de page en bas lorsque le contenu est court.

Les espacements récurrents du frontmatter structurent les groupes : petits écarts dans les contrôles, grilles (16 px), panneaux voisins (24 px), puis séparation des sections. Les cartes emploient typiquement une marge interne (22–30 px). L’accueil utilise deux colonnes asymétriques et trois aperçus de modules ; cette composition appartient à l’accueil, pas à tous les futurs écrans.

- À une largeur maximale (1180 px), les gouttières se resserrent (26 px), le catalogue passe à deux colonnes et les outils du catalogue s’empilent ; la recherche remplit la largeur disponible.
- À une largeur maximale (879 px), le rail cède la place à un bouton de menu et un dialogue latéral modal (288 px, au plus la largeur du viewport moins 36 px). La barre mesure alors (64 px). Les contrôles principaux atteignent une hauteur tactile (44 px).
- À une largeur maximale (620 px), les colonnes deviennent une seule colonne, les actions de titre passent sous le texte et les gouttières mesurent (18 px). Les aperçus de l’accueil deviennent des lignes d’un même conteneur ; les cartes du catalogue restent distinctes. Les options de thème s’empilent et les lignes de services placent l’état sous la description.
- À partir d’une largeur (1600 px), la marge supérieure du contenu augmente (46 px).

Les captures de référence sont dans `.impeccable/review/` : accueil ordinateur et mobile, organisations, catalogue, préférences sombres, navigation mobile, état des services et Core indisponible. Elles représentent le shell revu dans le navigateur ; elles ne prouvent pas un déploiement ou des parcours métier complets.

## Elevation & Depth

Le système est plat. Les fonds du canevas, des surfaces et des notes créent les niveaux, avec une bordure continue fine (1 px) pour les panneaux et les champs. Aucune ombre portée n’est définie. Le tiroir mobile s’isole avec un voile sombre translucide (`rgb(12 22 40 / 45%)`) et le comportement modal du dialogue natif.

**The Flat Surface Rule.** Séparer les régions par les fonds et les bordures ; le shell actuel n’utilise aucune ombre portée.

## Shapes

Les surfaces rectangulaires ont des angles adoucis. Le rayon `panel` regroupe les panneaux et cartes ; `control` sert aux boutons et sélecteurs ; `navigation` aux entrées de navigation et à la recherche ; `option` aux choix de thème et `badge` aux étiquettes. Les conteneurs composites masquent leur débordement pour garder une bordure continue. Les points d’état sont circulaires. La marque est un carré arrondi contenant quatre petits carrés ; la même géométrie existe en favicon SVG.

## Components

### Buttons

Les boutons sont compacts, francs et accompagnés d’un pictogramme lorsque celui-ci clarifie l’action. Le bouton principal utilise le bleu de gestion et sa couleur inverse ; le secondaire utilise la surface de travail et la bordure de structure. Le fond change au survol avec une transition courte (160 ms, ease-out). Le bouton de base sur fond doux sert notamment à la création indisponible : l’état désactivé conserve un libellé, une explication associée et une opacité réduite (0.65).

Le focus clavier utilise un contour franc (3 px), décalé (3 px). Les boutons icône sont transparents au repos, puis prennent un fond doux au survol ; leurs noms accessibles décrivent l’action. Les liens textuels sont bleus et soulignés au survol.

### Chips

Les badges de préparation et de disponibilité future sont des étiquettes non interactives, avec un fond doux et une encre secondaire. Les filtres sont des boutons distincts : leur sélection utilise le fond bleu doux, l’encre bleue et `aria-pressed`. Leur couleur ne suffit pas à transmettre leur état.

### Cards / Containers

Les cartes de modules sont des surfaces bordées, avec un pictogramme SVG bleu, un titre, un badge d’état et une description. Les panneaux d’organisation et de services peuvent comporter des en-têtes ou notes séparés par un trait. Le catalogue n’ajoute ni effet de survol ni affordance de clic aux cartes de modules encore indisponibles.

### Inputs / Fields

La recherche est un champ bordé sur fond de surface, avec icône, nom accessible et bouton d’effacement contextuel. Son focus s’applique au conteneur avec `:focus-within` (contour 3 px, décalage 2 px). Les sélecteurs de langue restent natifs. Les choix de thème sont des radios natives entourées d’une surface sélectionnable ; leur bordure, fond et contrôle radio exposent la sélection.

### Navigation

Le rail regroupe les destinations principales puis les préférences et l’état des services. Les entrées utilisent une icône SVG et un libellé ; au survol, leur fond s’adoucit. La route active utilise le fond bleu doux et l’encre bleue, avec l’état courant de `NavLink`. La navigation reste inscrite dans l’URL ; les filtres et la recherche du catalogue utilisent aussi ses paramètres.

Sur mobile, le dialogue natif contient les mêmes destinations. Il se ferme par le bouton nommé, Échap, navigation, clic sur le voile ou retour au format ordinateur. Le bouton de menu expose `aria-expanded`. Un lien d’évitement rejoint le contenu principal ; un changement de route place le focus sur ce contenu et remet la page en haut.

### Preferences and service states

Les thèmes clair, sombre et système partagent les mêmes rôles de couleur. Le mode système suit les changements du navigateur. Les préférences de langue et de thème s’appliquent immédiatement, avec un état de sauvegarde locale ou un avertissement si le stockage échoue. La langue met aussi à jour l’attribut `lang` du document.

La page des services distingue vérification, disponibilité et indisponibilité, avec texte et point coloré. Le rafraîchissement affiche son état et désactive temporairement le bouton. Une erreur de connexion affiche un avertissement et une action de reprise. La rotation du pictogramme de rafraîchissement dure un cycle (1 s, linéaire) ; le réglage `prefers-reduced-motion` supprime animations et transitions. Les erreurs de route et le repli fatal restent des surfaces de récupération explicites.

## Do's and Don'ts

### Do:

- **Do** utiliser les variables sémantiques de couleur pour que chaque surface suive le thème.
- **Do** conserver un titre clair, une description courte et des actions portant des verbes explicites.
- **Do** accompagner les couleurs d’état d’un texte et préserver les indicateurs de focus.
- **Do** utiliser les SVG existants et la marque vectorielle Orkobi ; conserver Manrope auto-hébergée.
- **Do** présenter les fonctions indisponibles avec leur état de préparation et une explication.

### Don't:

- **Don’t** présenter les cartes de modules à venir comme des actions d’installation ou des modules actifs.
- **Don’t** simuler une organisation, un utilisateur connecté, des statistiques ou des données métier.
- **Don’t** figer une couleur claire dans un composant qui doit suivre le thème sombre.
- **Don’t** remplacer les contrôles natifs accessibles par des imitations purement visuelles.
- **Don’t** faire des petites tailles de métadonnées une règle pour le texte courant des futurs écrans.
