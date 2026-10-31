# Orkobi

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React avec Vite et TypeScript ; BFF NestJS séparé du Core NestJS, conformément
à la roadmap technique 0.3. Monorepo pnpm privé, version 0.2.0-EXP.

## Users

Entreprises, associations et autres organisations, d'après la roadmap.
La Phase 1 sert les administrateurs plateforme, les administrateurs
d'organisation et leurs membres. La personne qui prépare l'instance crée le
premier compte ; elle crée ensuite les organisations et peut déléguer leur gestion.
La Phase 2 active des modules par organisation, avec un module de démonstration
(notes partagées) pour valider le cycle modulaire.

## Product Purpose

Un ERP modulaire et multi-organisation, indépendant de LUMA et de Kyros.
Le Core porte identité, sécurité, organisations et accès contrôlé aux ressources ;
les modules portent les fonctionnalités métier.

## Operating Context

L'utilisateur a confirmé un premier accueil centré sur les organisations et les
modules à venir. Il a choisi de construire directement en code et de vérifier
le rendu dans le navigateur. Utilisation sur ordinateur et navigateur mobile.

## Capabilities and Constraints

Le shell conserve routage, BFF, thèmes et langue FR/EN. La Phase 1 ajoute
installation, authentification locale, sessions serveur, profil, organisations,
appartenances, permissions, rôles et audit persistants sur PostgreSQL. La création
des comptes et organisations est réservée à l'administration plateforme ; les
droits des organisations peuvent être délégués, conformément au choix utilisateur.
Les écrans affichent uniquement les données réellement chargées et autorisées.
Le catalogue de modules reste une présentation, sans installation ni activation.
Les exemples des captures de recette sont des données synthétiques de test.

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
