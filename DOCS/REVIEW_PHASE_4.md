# Revue Phase 4 — 3 novembre 2026

## Livraison

Paquets de plugins externes à manifeste versionné, moteur QuickJS/WASM isolé,
accès SDK contrôlés, tables logiques multi-organisation, installation/retrait
confirmés, mises à jour additives et frontend déclaratif. L’exemple est compilé
séparément dans `examples/plugin-demo` ; le Core ne l’importe pas.

Les contrats sont distribuables dans les quatre archives de `output/sdk/`, avec
empreintes SHA-256. Elles sont consommées et typées dans un projet temporaire
hors workspace. Aucune publication npm, création de release, tag, push ou
modification de l’instance existante n’a été effectuée. Version : `0.2.0-EXP`.

Voir [PHASE_4.md](PHASE_4.md) pour l’installation, le développement et les limites.

## Architecture et protections vérifiées

| Point                               | Implémentation et preuve                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, ressources et compatibilité | `lib/contracts/src/plugins.ts` : API 1, namespaces propres, tables logiques canoniques, labels FR/EN, historique contigu, pages et actions bornées. Comparateurs Core/SDK et dépendances contrôlés par le Core.                                                       |
| Exécution tierce                    | `apps/core/src/plugins/sandbox-worker.ts` : VM QuickJS/WASM fraîche dans un worker jetable ; aucun import Node du code tiers. Les tests refusent `node:fs`, `require`, `process`, `fetch`, l’évasion par constructeur et les promesses de handler.                    |
| Mémoire, CPU et saturation          | 16 Mio dans QuickJS, pile 256 Kio, worker Node borné, interruption CPU et arrêt forcé, deux exécutions simultanées par Core et 100 RPC par exécution. Boucle infinie, mémoire et quota exercent de vrais workers.                                                     |
| Autorité du Core                    | Plugin, utilisateur et organisation fixés hors du moteur ; droits et activation revérifiés avant chaque opération. Le guest ne reçoit aucun objet JavaScript hôte brut.                                                                                               |
| Annulation d’un RPC en attente      | Le signal du worker est transmis au broker puis vérifié avant et après le verrou d’autorisation. Un timeout ne déclenche pas une écriture qui attend encore ce verrou. Le test simule une opération hôte en attente puis vérifie qu’elle n’a pas écrit après l’arrêt. |
| Isolation des données               | `plugin_records` filtre systématiquement plugin, entité, organisation et identifiant. Le plugin de démonstration crée une fiche dans A ; lecture/modification/suppression depuis B sont refusées ou vides.                                                            |
| Aucun privilège DDL d’extension     | Migration append-only `0009_plugins`. Pas de SQL fourni par le paquet, ni de secret de migration transmis au Core HTTP ou au moteur. Les champs sont du texte dans des tables logiques.                                                                               |
| Permissions explicites              | Installation désactivée, aucun droit ajouté aux rôles par défaut. Grant séparé par organisation et rôle ; seuls les droits de ce plugin peuvent être modifiés dans ce parcours.                                                                                       |
| Installation et mises à jour        | Empreinte canonique, identifiant confirmé, comparaison avec l’empreinte précédente ; refus d’un paquet modifié sous la même version ou d’un historique destructif.                                                                                                    |
| Retrait                             | Refus tant que le module est activé ; conservation des données ; exécution et réactivation du paquet retiré bloquées. Migrations et données restent disponibles pour réinstallation/mise à jour explicite.                                                            |
| Job Engine                          | Les handlers tiers passent par le moteur isolé et le même contrôle de contexte. Tâche réelle du plugin, état et exécution persistés, identifiant et clé d’idempotence fournis au SDK.                                                                                 |
| Frontend                            | Pages déclaratives rendues par `@orkobi/sdk-ui`, labels et contenus échappés, pas de bundle tiers/HTML/CSS arbitraire dans l’hôte. Confirmation de suppression et états d’erreur/reprise.                                                                             |
| Distribution SDK                    | `sdk:pack`, `sdk:test` : installation des tarballs hors monorepo, imports ESM et compilation du plugin avec les types publics. Aucun accès à NestJS/SQL/QuickJS exigé du développeur du plugin.                                                                       |

Le stockage des rôles accepte désormais les clés de permissions déclarées par les
extensions. Leur syntaxe est contrôlée en base ; leur attribution reste bornée
au catalogue et aux droits courants dans le Core. Les restrictions d’attribution
et de conservation du dernier administrateur sont maintenues.

## Défauts corrigés pendant la recette

- Le BFF refusait les routes SPA contenant un point. `/plugins/community.cards`
  fonctionnait sous Vite mais rendait une 404 dans le build compilé. Une exception
  limitée aux routes de plugins autorise ces URL ; API inconnues, fichiers privés
  et ressources absentes restent refusés. Le test HTTP BFF couvre les deux cas.
- Le fil de navigation présentait une page de plugin comme introuvable : le groupe
  Modules et son état actif couvrent maintenant les routes de plugins.
- Les liens Modifier/Supprimer d’une entrée étaient collés : espacement et retour
  à la ligne ajoutés dans le périmètre de la page d’extension.
- La validation pouvait être cliquée avant la fin de lecture du fichier : le
  bouton est désactivé jusqu’à disponibilité du paquet. Les confirmations restent
  des contraintes de formulaire natives et sont testées.
- La consommation d’archives nécessitait des overrides pour les dépendances
  internes : ils sont désormais testés dans `pnpm-workspace.yaml` avec pnpm 12,
  et un exemple est généré avec les archives.

## Vérifications

- `pnpm check` : formatage, lint, builds, contrats TypeScript et **75 tests Node**.
- `pnpm typecheck` : tous les workspaces, y compris l’exemple externe.
- `pnpm sdk:test` : quatre archives, hashes et consommation hors workspace,
  imports et typage réels avec pnpm 12.16.1.
- `pnpm plugin:build` et validation du paquet produit : réussies.
- `pnpm infra:test` : **66 tests d’intégration**, sous-tests compris, avec
  PostgreSQL et Redis réels, Core et BFF. Les 9 tests de Phase 4 couvrent le cycle
  externe ; les phases 1–3 restent dans la même recette.
- Panne PostgreSQL, redémarrage Core/BFF, recréation complète des conteneurs et
  conservation de la donnée témoin : réussis dans la pile Docker isolée.
- `tests/browser/phase4.mjs`, Chrome for Testing headless/Puppeteer : validation
  et confirmation d’installation, droits d’un rôle, CRUD, confirmation de
  suppression, erreur/reprise, navigation directe et rechargement ; français/anglais,
  clair/sombre, 1440×1000 et 390×844. Build compilé et Vite vérifiés séparément.
- `pnpm peers check`, `git diff --check` : réussis.
- Détecteur Impeccable sur les nouveaux écrans/composants : aucun défaut déterministe.
  Revue visuelle des captures et correction groupée des problèmes ci-dessus.

Les API des recettes navigateur sont synthétiques. Elles ne prouvent pas les
autorisations SQL ; ces dernières sont exercées par la recette d’intégration.
Les captures sont dans `output/playwright/phase4*`, les archives dans `output/sdk/`
et les preuves Docker dans `output/infrastructure/<id>/result.json` (ignorés Git).
Le passage complet `output/infrastructure/7af0c8f4035e/result.json` indique `passed: true`.
Les conteneurs de recette sont arrêtés et leurs volumes sont conservés, sans
utiliser ni modifier le volume de l’instance existante.

## Limites à conserver dans les prochains prompts

- Les contrats sont distribués **localement**. Le choix du registre, les droits de
  publication et une publication publique npm ne sont pas effectués.
- La frontière est QuickJS/WASM avec un pont contrôlé, pas une sandbox OS ni une
  garantie contre une vulnérabilité du moteur Wasm/Node. Les limites du moteur et
  ses dépendances doivent rester maintenues. Le worker ne reçoit aucun secret.
- Le frontend tiers est déclaratif et les données sont textuelles. Ni frontend
  React arbitraire, ni migrations SQL libres, ni dépendances npm dans le guest,
  ni accès réseau externe ne sont supportés par l’API 1.
- Un timeout ne défait pas les opérations déjà committées. Les handlers de jobs
  doivent être idempotents ; la clé du cycle est disponible dans `sdk.execution`.
- Le hash protège l’intégrité du paquet revu, pas l’identité de son auteur. Aucun
  Store, signature de distributeur ou téléchargement automatique n’est annoncé.
- Les données et tombstones des plugins retirés sont conservés ; leur purge doit
  faire l’objet d’une opération distincte et explicitement autorisée.
- Le helper Impeccable signale un sidecar de design antérieur au `DESIGN.md` de la
  Phase 3. Les sources et le rendu ont été vérifiés ; aucune remise à plat de cette
  configuration historique n’est incluse dans cette livraison.

Aucune validation de fournisseur OIDC réel, d’appareil physique ou de production
n’est déduite de ces tests locaux.
