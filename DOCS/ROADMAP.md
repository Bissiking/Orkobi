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
- [x] Créer le monorepo.
- [x] Configurer TypeScript et les outils de qualité.
- [x] Configurer ESLint et Prettier.
- [x] Ajouter `.gitignore` et `.env.example`.
- [x] Définir les conventions de développement des bibliothèques et du SDK.
- [x] Préparer les scripts communs de développement et de test (pile démarrable via `pnpm dev`, Core seul via `pnpm dev:core`).

## 0.2 — Backend Core

- [x] Initialiser NestJS.
- [x] Mettre en place la configuration des environnements.
- [x] Créer un gestionnaire d'erreurs commun.
- [x] Implémenter la journalisation structurée.
- [x] Créer `/health` (vitalité du processus uniquement).
- [x] Initialiser la documentation OpenAPI interne (activation explicite).
- [x] Préparer les interfaces des services du Core (contrats applicatifs, injection NestJS et adaptation vers le SDK ; services métier explicitement indisponibles).

## 0.3 — Frontend et BFF

- [x] Initialiser React avec Vite.
- [x] Configurer le routage frontend.
- [x] Créer le BFF NestJS.
- [x] Définir le contrat BFF ↔ Core.
- [x] Configurer les échanges et la gestion des erreurs.
- [x] Créer le layout principal Orkobi.
- [x] Préparer les thèmes clair et sombre.
- [x] Configurer l'internationalisation FR/EN.

## 0.4 — Infrastructure

- [x] Configurer PostgreSQL.
- [x] Créer le système de migrations.
- [x] Configurer Docker Compose.
- [x] Configurer les volumes persistants.
- [x] Ajouter les contrôles de santé des services.
- [x] Vérifier le redémarrage complet de l'environnement.
- [x] Documenter la procédure d'installation.

---

# Phase 1 — Orkobi Core 0.1.0-EXP

**Objectif :** première plateforme administrable et multi-organisation fonctionnelle.

## 1.1 — Installation initiale

- [x] Détecter si une instance est déjà initialisée.
- [x] Créer un assistant d'installation.
- [x] Vérifier la connexion SQL.
- [x] Créer le premier administrateur plateforme.
- [x] Bloquer les nouvelles initialisations après installation.
- [x] Journaliser les opérations sensibles.

## 1.2 — Identity Manager

- [x] Créer les identifiants uniques des utilisateurs.
- [x] Implémenter l'authentification locale.
- [x] Sécuriser le stockage des mots de passe.
- [x] Implémenter les sessions serveur.
- [x] Configurer les cookies sécurisés et protections CSRF.
- [x] Implémenter connexion et déconnexion.
- [x] Implémenter l'expiration et la révocation des sessions.
- [x] Créer la page Profil.
- [x] Préparer le modèle des identités OIDC externes.

## 1.3 — Organization Manager

- [x] Créer les identifiants uniques d'organisation.
- [x] Permettre la création d'une entreprise ou association.
- [x] Implémenter les appartenances utilisateur/organisation.
- [x] Permettre plusieurs organisations par utilisateur.
- [x] Gérer la sélection de l'organisation active.
- [x] Séparer les paramètres de chaque organisation.
- [x] Vérifier l'isolation des données entre organisations.

## 1.4 — Security Manager

- [x] Créer les rôles et permissions.
- [x] Séparer administrateur plateforme et administrateur organisation.
- [x] Implémenter les contrôles d'accès côté Core.
- [x] Refuser par défaut les opérations non autorisées.
- [x] Implémenter l'audit des actions sensibles.
- [x] Protéger les endpoints administratifs.
- [x] Tester les accès inter-organisations non autorisés.

## 1.5 — Administration

- [x] Créer le dashboard administratif minimal.
- [x] Gérer les utilisateurs.
- [x] Gérer les organisations.
- [x] Gérer les appartenances et rôles.
- [x] Afficher l'état des services.
- [x] Afficher la version d'Orkobi.
- [x] Consulter les journaux d'audit.

### Critères de validation V0.1.0

- [x] Installation initiale réussie.
- [x] Administrateur local fonctionnel.
- [x] Connexion et déconnexion fonctionnelles.
- [x] Création de deux organisations.
- [x] Gestion des utilisateurs et de leurs appartenances.
- [x] Isolation des organisations vérifiée par tests.
- [x] Redémarrage sans perte de données.
- [x] Tests automatisés essentiels réussis.

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

**Phase 0 et Phase 1 terminées ; poursuivre le Module Manager 2.1.**

Prochain objectif concret : manifeste, registre des modules et activation par organisation.
La plateforme expérimentale 0.1.0-EXP dispose de l'installation, de l'identité,
de l'administration et d'une isolation applicative des organisations testée.
Les conditions de publication et de production restent distinctes.

Les preuves et limites du Core figurent dans [CORE.md](CORE.md) et la
[revue 0.1/0.2](REVIEW_PHASE_0.md). Le [guide frontend/BFF](FRONTEND_BFF.md)
décrit la livraison 0.3, ses tests HTTP et navigateur, et les services métier
qui restent indisponibles.

Le [guide infrastructure](INFRASTRUCTURE.md) décrit PostgreSQL, les migrations,
Compose et la recette réelle de redémarrage avec conservation des données.

Le [guide de Phase 1](PHASE_1.md) décrit installation, identité, organisations,
délégation et administration ; les [preuves de sécurité](PHASE_1_SECURITY.md)
précisent l'isolation applicative et les conditions restant ouvertes.

**Orkobi s'adapte à vous.**
