# Orkobi

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React avec Vite et TypeScript ; BFF NestJS séparé du Core NestJS, conformément
à la roadmap technique 0.3. Monorepo pnpm privé, version 0.1.0-EXP conservée.

## Users

Entreprises, associations et autres organisations, d'après la roadmap.
Hypothèse de travail pour ce premier shell : la personne qui prépare son espace
et découvre les fonctionnalités futures. Le profil précis des administrateurs
et les parcours métier restent à définir lors de leur implémentation.

## Product Purpose

Un ERP modulaire et multi-organisation, indépendant de LUMA et de Kyros.
Le Core porte identité, sécurité, organisations et accès contrôlé aux ressources ;
les modules portent les fonctionnalités métier.

## Operating Context

L'utilisateur a confirmé un premier accueil centré sur les organisations et les
modules à venir. Il a choisi de construire directement en code et de vérifier
le rendu dans le navigateur. Utilisation sur ordinateur et navigateur mobile.

## Capabilities and Constraints

Le lot 0.3 fournit le shell, le routage persistant dans l'URL, le BFF, les échanges
avec le Core et les préférences de thème et langue FR/EN. Le Core expose sa
vitalité HTTP ; les services métier restent indisponibles. Ne pas inventer
utilisateur connecté, organisation, modules installés, chiffres ou données réelles.
L'authentification, PostgreSQL, l'installation et l'activation de modules restent
hors de ce lot. Les contrôles doivent avoir un comportement effectif.

## Brand Commitments

Nom : Orkobi. Slogan : « Orkobi s'adapte à vous. »
Vocabulaire français par défaut, anglais disponible. Aucune identité visuelle
préexistante n'a été trouvée. Ne pas assimiler ces fondations à un ERP opérationnel.

## Evidence on Hand

DOCS/ROADMAP.md, DOCS/CORE.md, DOCS/SDK.md et DOCS/VERSIONING.md.
Aucun logo, illustration, témoignage, donnée client ou statistique fourni.

## Product Principles

- Montrer honnêtement l'état actuel et les prochaines possibilités.
- Garder le Core indépendant des modules métier.
- Préserver les frontières d'organisation et les refus par défaut.
- Rendre les préférences, la navigation et la récupération d'erreurs prévisibles.

Choix visuel confirmé : tableau de bord classique ; Odoo et Microsoft Business
Central servent de repères de clarté, sans reprise de marque ni promesse de leurs
fonctionnalités. Navigation conventionnelle, densité maîtrisée, états explicites.
