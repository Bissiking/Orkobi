# ROADMAP.md

# Orkobi — Roadmap de développement

**Slogan :** Orkobi s'adapte à vous.  
**Version cible :** 0.1.0-EXP  
**Statut :** Développement initial  
**Architecture :** ERP modulaire, multi-organisation  
**Projet :** Indépendant de LUMA

---

## Vision

Orkobi est un ERP modulaire, extensible et adaptable aux entreprises, associations et autres organisations.

Le Core fournit les services essentiels : identité, sécurité, administration, organisations, accès aux données et infrastructure technique.

Les fonctionnalités métier sont apportées par des modules indépendants utilisant des contrats et un SDK contrôlés.

**Principes fondamentaux :**

- Sécurité dès la conception.
- Multi-organisation natif.
- Modularité sans dépendances inutiles.
- Fonctionnement autonome sans Store ni service cloud obligatoire.
- Compatibilité avec plusieurs moteurs SQL à terme.
- Interfaces françaises et anglaises.
- APIs externes désactivables.
- Maintenance, observabilité et évolutivité.

---

# Phase 0 — Fondations techniques

**Objectif :** disposer d'un monorepo reproductible et d'applications capables de démarrer.

## 0.1 — Initialisation

- [x] Initialiser Git.
- [x] Configurer pnpm Workspaces.
- [ ] Créer le monorepo.
- [ ] Configurer TypeScript et les outils de qualité.
- [ ] Configurer ESLint et Prettier.
- [ ] Ajouter `.gitignore` et `.env.example`.
- [ ] Définir les conventions de développement.
- [ ] Préparer les scripts communs de développement et de test.

## 0.2 — Backend Core

- [ ] Initialiser NestJS.
- [ ] Mettre en place la configuration des environnements.
- [ ] Créer un gestionnaire d'erreurs commun.
- [ ] Implémenter la journalisation structurée.
- [ ] Créer `/health`.
- [ ] Initialiser la documentation OpenAPI interne.
- [ ] Préparer les interfaces des services du Core.

## 0.3 — Frontend et BFF

- [ ] Initialiser React avec Vite.
- [ ] Configurer le routage frontend.
- [ ] Créer le BFF NestJS.
- [ ] Définir le contrat BFF ↔ Core.
- [ ] Configurer les échanges et la gestion des erreurs.
- [ ] Créer le layout principal Orkobi.
- [ ] Préparer les thèmes clair et sombre.
- [ ] Configurer l'internationalisation FR/EN.

## 0.4 — Infrastructure

- [ ] Configurer PostgreSQL.
- [ ] Créer le système de migrations.
- [ ] Configurer Docker Compose.
- [ ] Configurer les volumes persistants.
- [ ] Ajouter les contrôles de santé des services.
- [ ] Vérifier le redémarrage complet de l'environnement.
- [ ] Documenter la procédure d'installation.

---

# Phase 1 — Orkobi Core 0.1.0-EXP

**Objectif :** première plateforme administrable et multi-organisation fonctionnelle.

## 1.1 — Installation initiale

- [ ] Détecter si une instance est déjà initialisée.
- [ ] Créer un assistant d'installation.
- [ ] Vérifier la connexion SQL.
- [ ] Créer le premier administrateur plateforme.
- [ ] Bloquer les nouvelles initialisations après installation.
- [ ] Journaliser les opérations sensibles.

## 1.2 — Identity Manager

- [ ] Créer les identifiants uniques des utilisateurs.
- [ ] Implémenter l'authentification locale.
- [ ] Sécuriser le stockage des mots de passe.
- [ ] Implémenter les sessions serveur.
- [ ] Configurer les cookies sécurisés et protections CSRF.
- [ ] Implémenter connexion et déconnexion.
- [ ] Implémenter l'expiration et la révocation des sessions.
- [ ] Créer la page Profil.
- [ ] Préparer le modèle des identités OIDC externes.

## 1.3 — Organization Manager

- [ ] Créer les identifiants uniques d'organisation.
- [ ] Permettre la création d'une entreprise ou association.
- [ ] Implémenter les appartenances utilisateur/organisation.
- [ ] Permettre plusieurs organisations par utilisateur.
- [ ] Gérer la sélection de l'organisation active.
- [ ] Séparer les paramètres de chaque organisation.
- [ ] Vérifier l'isolation des données entre organisations.

## 1.4 — Security Manager

- [ ] Créer les rôles et permissions.
- [ ] Séparer administrateur plateforme et administrateur organisation.
- [ ] Implémenter les contrôles d'accès côté Core.
- [ ] Refuser par défaut les opérations non autorisées.
- [ ] Implémenter l'audit des actions sensibles.
- [ ] Protéger les endpoints administratifs.
- [ ] Tester les accès inter-organisations non autorisés.

## 1.5 — Administration

- [ ] Créer le dashboard administratif minimal.
- [ ] Gérer les utilisateurs.
- [ ] Gérer les organisations.
- [ ] Gérer les appartenances et rôles.
- [ ] Afficher l'état des services.
- [ ] Afficher la version d'Orkobi.
- [ ] Consulter les journaux d'audit.

### Critères de validation V0.1.0

- [ ] Installation initiale réussie.
- [ ] Administrateur local fonctionnel.
- [ ] Connexion et déconnexion fonctionnelles.
- [ ] Création de deux organisations.
- [ ] Gestion des utilisateurs et de leurs appartenances.
- [ ] Isolation des organisations vérifiée par tests.
- [ ] Redémarrage sans perte de données.
- [ ] Tests automatisés essentiels réussis.

---

# Phase 2 — Orkobi Core 0.2.0

**Objectif :** poser les bases du fonctionnement modulaire.

## 2.1 — Module Manager

- [ ] Définir le manifeste standard des modules.
- [ ] Créer un registre central des modules.
- [ ] Déclarer les dépendances entre modules.
- [ ] Gérer les versions compatibles.
- [ ] Gérer activation et désactivation.
- [ ] Permettre l'activation par organisation.
- [ ] Bloquer la désactivation en cas de dépendance critique.
- [ ] Conserver les données lors d'une désactivation.

## 2.2 — Capability Registry

- [ ] Créer le catalogue officiel des capabilities.
- [ ] Distinguer capabilities, exigences et permissions.
- [ ] Définir les capacités obligatoires et facultatives.
- [ ] Détecter les capacités disponibles.
- [ ] Gérer les fonctionnalités limitées.
- [ ] Documenter les contrats du Core.

## 2.3 — Data Access Manager

- [ ] Créer les abstractions d'accès SQL du SDK.
- [ ] Contrôler les accès aux données par organisation.
- [ ] Définir la propriété des ressources par module.
- [ ] Préparer la déclaration des tables.
- [ ] Préparer les migrations propres aux modules.
- [ ] Refuser les opérations non autorisées.

## 2.4 — Premier module officiel

- [ ] Créer un module de démonstration.
- [ ] Déclarer son manifeste.
- [ ] Déclarer ses permissions.
- [ ] Créer ses ressources via le Core.
- [ ] Intégrer ses pages au frontend.
- [ ] Tester activation, désactivation et conservation des données.

---

# Phase 3 — Orkobi Core 0.3.0

**Objectif :** renforcer les services d'identité et d'infrastructure.

## 3.1 — Authentification avancée

- [ ] Ajouter les fournisseurs OIDC externes.
- [ ] Permettre la liaison des identités.
- [ ] Ajouter la MFA locale.
- [ ] Prévoir les mécanismes de récupération sécurisés.
- [ ] Gérer les sessions actives depuis le profil.

## 3.2 — API Access Manager

- [ ] Séparer les API internes des API d'intégration.
- [ ] Autoriser la désactivation globale des intégrations.
- [ ] Ajouter les restrictions par organisation.
- [ ] Gérer les identités et jetons d'intégration.
- [ ] Définir scopes, expiration et révocation.
- [ ] Journaliser les appels sensibles.
- [ ] Sécuriser l'authentification BFF ↔ Core.

## 3.3 — Services optionnels

- [ ] Ajouter un adaptateur Redis.
- [ ] Gérer le cache avec ou sans Redis.
- [ ] Préparer un système de files de tâches.
- [ ] Mesurer les performances et identifier les besoins d'optimisation.

## 3.4 — Job Engine

- [ ] Créer le planificateur interne.
- [ ] Permettre aux modules de déclarer leurs tâches.
- [ ] Ajouter les tâches ponctuelles et récurrentes.
- [ ] Contrôler les permissions et l'organisation d'exécution.
- [ ] Gérer erreurs, retries et timeouts.
- [ ] Éviter les exécutions concurrentes involontaires.
- [ ] Journaliser les exécutions.
- [ ] Suspendre les tâches lors de la désactivation d'un module.

---

# Phase 4 — Orkobi SDK 0.4.0

**Objectif :** permettre le développement d'extensions externes contrôlées.

- [ ] Publier les contrats du SDK.
- [ ] Fournir une documentation développeur.
- [ ] Définir le manifeste des plugins tiers.
- [ ] Déclarer tables, migrations et ressources.
- [ ] Déclarer permissions et capabilities.
- [ ] Déclarer dépendances et versions compatibles.
- [ ] Mettre en place l'isolation d'exécution des plugins.
- [ ] Contrôler tous les accès aux ressources sensibles.
- [ ] Préparer un validateur de plugins.
- [ ] Définir les règles de compatibilité frontend.
- [ ] Implémenter installation et retrait sécurisés.
- [ ] Tester un plugin externe de démonstration.

---

# Phase 5 — Compatibilité et services avancés

**Objectif :** étendre les capacités sans compromettre le fonctionnement minimal.

## Moteurs SQL

- [ ] Développer l'adaptateur MariaDB.
- [ ] Développer l'adaptateur MySQL.
- [ ] Tester les migrations sur chaque moteur.
- [ ] Détecter les capabilities propres aux moteurs.
- [ ] Afficher les limitations dans l'administration.
- [ ] Refuser les modules dont les exigences obligatoires sont absentes.

## Autres services

- [ ] Étudier l'intérêt réel d'un moteur NoSQL facultatif.
- [ ] Limiter initialement son usage aux services techniques globaux.
- [ ] Étudier le stockage objet compatible S3.
- [ ] Ajouter les outils de diagnostic système.
- [ ] Améliorer la supervision et les métriques.
- [ ] Évaluer l'intégration d'Aion comme orchestrateur externe.

---

# Phase 6 — Orkobi Store

**Objectif :** distribuer et maintenir les extensions.

- [ ] Définir le registre public des plugins.
- [ ] Définir les catalogues de versions.
- [ ] Héberger l'API Store indépendamment du Core.
- [ ] Permettre les dépôts officiels et communautaires.
- [ ] Vérifier provenance, intégrité et signatures.
- [ ] Afficher permissions, tables et dépendances.
- [ ] Ajouter la compatibilité Core / SDK / SQL.
- [ ] Gérer les mises à jour et les demandes de nouveaux droits.
- [ ] Ajouter les dépôts privés.
- [ ] Garantir le fonctionnement d'Orkobi sans Store accessible.

---

# Phase 7 — Modules métier et premières versions stables

**Objectif :** transformer le Core en ERP réellement exploitable.

Modules envisagés :

- [ ] CRM et gestion des clients.
- [ ] Catalogue de produits et services.
- [ ] Devis et facturation.
- [ ] Gestion des stocks.
- [ ] Gestion de projets.
- [ ] Gestion des membres et cotisations pour associations.
- [ ] Gestion documentaire.
- [ ] Rapports et statistiques.
- [ ] Ressources humaines.

Chaque module devra disposer de ses propres exigences de sécurité, règles métier, tests et contraintes réglementaires.

La sortie stable sera décidée à partir de la fiabilité réelle du produit, pas uniquement du nombre de fonctionnalités disponibles.

---

# Règles de développement

1. Le Core reste indépendant des modules métier.
2. Une opération métier doit respecter le contexte d'organisation autorisé.
3. Aucun plugin externe ne reçoit d'accès direct illimité aux ressources système.
4. Les opérations destructrices nécessitent une validation explicite.
5. Les migrations doivent être versionnées et testées.
6. Les permissions ne sont jamais accordées implicitement.
7. Les API d'intégration restent désactivées par défaut.
8. PostgreSQL est le moteur de référence.
9. Redis, NoSQL et le Store ne sont jamais des dépendances obligatoires du Core minimal.
10. Toute fonctionnalité annoncée comme terminée doit être testée et vérifiable.

---

# Prochaine étape

**Phase 0.1 : initialisation du monorepo Orkobi avec pnpm.**

Premier objectif concret : obtenir le Core NestJS, le frontend React et PostgreSQL dans un environnement de développement reproductible.

**Orkobi s'adapte à vous.**
