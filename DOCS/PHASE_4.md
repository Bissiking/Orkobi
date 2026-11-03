# Phase 4 — extensions et SDK

La plateforme accepte désormais des **paquets de plugins externes** versionnés,
validés puis installés par un administrateur plateforme. Leur code est interprété
par QuickJS compilé en WebAssembly dans un worker jetable. Le frontend rend des
pages déclaratives avec le kit UI du SDK ; aucun JavaScript tiers ne tourne dans
le navigateur de l’utilisateur ou dans le moteur JavaScript du Core.

La version produit et celle des packages restent `0.2.0-EXP`. Les contrats sont
exportés et distribuables sous forme d’archives locales. **Aucune publication sur
un registre npm, aucun Store et aucun déploiement ne sont effectués.** Le canal,
le registre et la publication publique restent une opération distincte.

## Créer son premier plugin

Lire [UI_SDK.md](UI_SDK.md), [SDK.md](SDK.md) et les consignes [AGENTS.md](../AGENTS.md).
L’exemple `examples/plugin-demo/` est un projet distinct ; le Core n’importe pas
son code. Il dépend uniquement des types publics du SDK.

```sh
pnpm install --frozen-lockfile
pnpm plugin:build
pnpm plugin:validate output/plugins/community.cards.json
```

Ces commandes produisent un fichier JSON chargeable dans **Administration →
Extensions**. Pour un autre projet : copier le dossier exemple, changer le
manifeste et les fonctions exportées, puis exécuter :

```sh
pnpm plugin:build chemin/du/plugin output/plugins/mon-plugin.json
pnpm plugin:validate output/plugins/mon-plugin.json
```

`plugin:build` compile un fichier TypeScript `plugin.ts` en ES2022, sans exécuter
le code du plugin ni son éventuel script npm. Les imports `import type` du SDK
sont effacés. Le typage de l’exemple est également exécuté par `pnpm typecheck`.
Pour son propre projet, conserver une commande `tsc --noEmit` : la transpilation
seule ne prouve pas le typage. Les imports runtime et les dépendances npm du code
guest ne sont pas chargés ; écrire un module ES autonome et des handlers synchrones.

## Manifeste et paquet

Le fichier contient `{ manifest, code }`, sans chemins de fichiers, archive à
extraire, script d’installation, URL de téléchargement ou SQL libre.

| Élément du manifeste                         | Contrat                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apiVersion`                                 | `1`, version du format d’extension.                                                                                          |
| `sdk` et `module.core`                       | Plages de comparateurs SemVer : par exemple `>=0.2.0-EXP <0.3.0`.                                                            |
| `module.id`                                  | Namespace en minuscules, séparé par des points ; `orkobi.*` réservé au Core.                                                 |
| `module.version`                             | Version du plugin ; une mise à jour doit être strictement plus récente.                                                      |
| `module.permissions`                         | Permissions préfixées par l’identifiant du plugin, comme `community.cards:read`.                                             |
| `module.capabilities`                        | Exigences obligatoires/facultatives, vérifiées par le Module Manager à l’activation.                                         |
| `module.dependencies` / `dependencyVersions` | Mêmes identifiants dans les deux déclarations, avec plage de version de chaque dépendance.                                   |
| `module.entities`                            | Tables logiques et champs texte avec nom, labels FR/EN, caractère obligatoire et limite explicite (4000 caractères maximum). |
| `migrations`                                 | Historique contigu `1, 2…`, listant les entités introduites ou modifiées. Préfixe immuable lors d’une mise à jour.           |
| `actions`                                    | Fonctions exportées appelables, permission requise et timeout de 100 à 5000 ms.                                              |
| `module.tasks`                               | Fonctions exportées pour le Job Engine ; mêmes contraintes de permissions et timeout maximal de 5000 ms.                     |
| `frontend`                                   | API `1`, pages liées à une entité, titre FR/EN, icône du catalogue SDK.                                                      |

Le schéma d’une table logique est `orkobi_ext_<identifiant avec points remplacés
par underscores>`, suivi du nom d’entité. Exemple :
`orkobi_ext_community_cards.cards`. Le Core stocke réellement ces ressources dans
`orkobi_core.plugin_records`, avec filtres indissociables **plugin + organisation

- entité**. Il ne crée pas de table SQL arbitraire ni de compte SQL pour un plugin.
  Ce contrat évite un privilège DDL dans le serveur HTTP et prépare les autres
  adaptateurs SQL. Les noms des tables logiques ne constituent pas un accès SQL.

Le format borne les entités, pages, tâches, taille du code et requêtes. Le paquet
reste dans la limite HTTP de 100 Kio ; le code est limité à 48000 caractères et
le sélecteur de fichier à 90000 octets. Les modèles de champs complexes,
ressources binaires et DDL propriétaire ne font pas partie de l’API 1.

## Programmer avec le SDK isolé

```ts
import type { PluginHandler } from '@orkobi/sdk-core';

export const add_card: PluginHandler = (sdk, input) => {
  const title = typeof input.title === 'string' ? input.title : '';
  return sdk.data.create('cards', { title, content: '' });
};
```

Les appels sont synchrones **dans le moteur du plugin**. Le pont hôte attend les
opérations asynchrones du Core sans exposer leurs objets JavaScript au guest.
Chaque opération renvoie `Result<T>` ; vérifier `ok` avant de lire `value`.

| Service           | Opérations                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk.identity`    | `currentUser()`, `currentOrganization()` : résumés limités au contexte autorisé.                                                                                  |
| `sdk.permissions` | `can(permission)` : information sur une permission déclarée par ce plugin, jamais une autorisation permanente.                                                    |
| `sdk.data`        | `list(entity)`, `create(entity, values)`, `update(entity, id, values)`, `remove(entity, id)`.                                                                     |
| `sdk.jobs`        | `schedule({task, runAt?, intervalSeconds?})`, `list()`, `cancel(id)`, `retry(id)` : uniquement les tâches de ce plugin et de ce créateur dans cette organisation. |
| `sdk.execution`   | `id` et `idempotencyKey` du job, ou `null` pour une action manuelle ; stable entre retries d’un même cycle.                                                       |

Le Core fixe utilisateur, organisation et plugin : un champ reçu du navigateur
ou ajouté aux arguments RPC ne peut pas les remplacer. Le SDK ne fournit ni SQL,
ni `process`, `require`, `fetch`, fichiers, sockets, secrets, imports externes ou
API d’administration. Les opérations de données vérifient aussi les permissions
propres à l’entité ; la permission de l’action ne les remplace pas.
Les lectures sont bornées à 100 entrées. Les erreurs publiques sont expurgées.

Les handlers ne doivent pas être `async` et ne doivent pas retourner de promesse.
Les appels réseau externes ne sont pas disponibles dans l’API 1 ; ils devront
faire l’objet d’un contrat distinct et de permissions explicites.

## Installer et accorder les droits

1. Aller dans **Administration → Extensions**, charger le paquet et le valider.
2. Lire l’identité, la version, les ressources, les dépendances, les permissions
   et l’empreinte SHA-256 retournées par le Core. Vérifier soi-même la provenance.
3. Cocher la confirmation puis installer. Le Core compare paquet, empreinte,
   identifiant confirmé et empreinte précédente attendue.
4. Activer le module sur la plateforme, puis dans les organisations choisies
   depuis **Modules**. Les dépendances et capabilities restent contrôlées.
5. Accorder explicitement les permissions à un rôle dans une organisation depuis
   le panneau de l’extension. Aucun droit n’est ajouté implicitement à un admin.
6. Le lien **Ouvrir** du module rejoint `/plugins/<id>/<page?>`.

Le hash prouve l’intégrité de ce qui a été revu ; **il n’authentifie pas l’auteur**.
Aucun mécanisme de signature de distributeur ou Store n’est annoncé ici.

## Mettre à jour ou retirer

Avant une mise à jour ou un retrait, désactiver le module dans chaque organisation,
puis sur la plateforme. Le Core refuse l’opération tant qu’une activation existe
ou qu’un module actif en dépend. Les jobs sont suspendus, sans relance implicite.

Une mise à jour exige une version croissante et un historique de migrations dont
le préfixe est inchangé. Les entités et champs existants sont conservés ; les
champs ajoutés à une entité existante sont facultatifs et nécessitent une nouvelle
étape mentionnant l’entité. Leur valeur initiale est `''` lors de la lecture.
Aucune suppression de colonne ou transformation SQL n’est exécutée. Toute nouvelle
permission reste à accorder explicitement.

Le retrait marque le paquet comme retiré et conserve données, historique et droits
antérieurement accordés ; son exécution et sa réactivation sont refusées. Un
paquet identique peut être réinstallé explicitement avec la même empreinte. Un
retour à une ancienne version ou une modification sous la même version est refusé.
Il n’existe aucune purge de données implicite.

## Routes BFF

Toutes les mutations gardent session, CSRF, Origin et secret BFF/Core. Le Core
revérifie les droits courants, y compris entre deux appels d’un même handler.

| Route sous `/api/platform/`        | Accès                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET admin/plugins`                | Administrateur plateforme ; métadonnées, sans code source.                                                                                     |
| `POST admin/plugins/validate`      | Administrateur plateforme ; `{artifact}`. Validation du format, compatibilité et exports dans le moteur isolé.                                 |
| `POST admin/plugins/install`       | Administrateur plateforme ; `{artifact,digest,confirmId,expectedPreviousDigest}`.                                                              |
| `POST admin/plugins/:id/grants`    | Administrateur plateforme ; `{confirmId,organizationId,roleId,permissions}`. Liste explicite des droits de ce plugin à conserver pour ce rôle. |
| `POST admin/plugins/:id/remove`    | Administrateur plateforme ; `{confirmId,digest}`.                                                                                              |
| `GET plugins`                      | Appartenance à l’organisation active ; extensions actives et métadonnées frontend.                                                             |
| `POST plugins/:id/actions/:action` | Session, organisation active et permission déclarée par l’action. Entrée JSON, résultat sous `{result}`.                                       |
| `modules/:id/data/...`             | CRUD existant, autorisé et borné aux entités du module.                                                                                        |

Les audits enregistrent installation, mise à jour, retrait, droits et succès/échec
d’exécution, sans code, payload, secrets ou exception brute.

## Frontend compatible

Le frontend n’exécute aucun bundle React arbitraire. L’API déclarative 1 expose
liste, création, modification et suppression confirmée des ressources texte.
Les routes restent dans l’URL, les thèmes et traductions sont ceux de l’hôte.
Les labels et contenus sont échappés par React ; pas de HTML, script, CSS ou URL
fourni par le plugin. Les icônes viennent de `AppIcon` et les contrôles de
`@orkobi/sdk-ui`, conformément à [UI_SDK.md](UI_SDK.md).
Une évolution vers un frontend personnalisé devra conserver une vraie séparation
d’origine et un pont contrôlé ; elle ne consiste pas à importer du JS tiers dans
le shell authentifié.

## Distribution locale du SDK

```sh
pnpm sdk:pack
pnpm sdk:test
```

Les archives de `@orkobi/contracts`, `@orkobi/sdk-types`, `@orkobi/sdk-core` et
`@orkobi/sdk-ui` sont dans `output/sdk/`, avec versions et SHA-256 dans
`manifest.json`. Le test installe réellement les tarballs dans un projet
temporaire extérieur au workspace puis vérifie les imports et le typage du plugin.
Ces artefacts ne sont pas publiés automatiquement sur npm.

Avec pnpm 12, placer les overrides des dépendances locales dans
`pnpm-workspace.yaml`, **pas** dans `package.json`. Le fichier généré
`pnpm-workspace.example.yaml` fournit le mapping vers les archives voisines.
Les quatre archives doivent être disponibles pour résoudre les dépendances
internes sans chercher des packages Orkobi sur un registre externe.

## Isolation et limites

Le worker Node charge uniquement le moteur et son pont de confiance. Le code tiers
est évalué **uniquement par QuickJS/WASM**, dans une VM fraîche, avec mémoire
limitée à 16 Mio et pile à 256 Kio. Le worker reçoit un environnement vide, une
limite mémoire Node et une terminaison forcée à l’échéance. Deux exécutions
simultanées par Core, 100 appels RPC par exécution, requêtes et réponses bornées.
Une boucle infinie ne bloque pas la boucle HTTP du Core.

C’est une frontière de moteur et de capabilities, pas une sandbox OS ni une
protection contre une vulnérabilité du moteur Wasm/Node. Le pont est volontairement
petit. Référence : [QuickJS Emscripten](https://github.com/justjake/quickjs-emscripten).

Les effets SQL autorisés déjà validés peuvent être committés avant un timeout ou
une interruption ; il n’existe pas de transaction métier englobant un handler.
Une action de données acquiert l’autorisation dans sa propre transaction. Comme
pour le Job Engine, prévoir des opérations idempotentes lors des retries. Aucun
exactly-once ou rollback global des effets n’est promis.

## Validation

`pnpm check`, `pnpm typecheck`, `pnpm sdk:test`, `pnpm plugin:build`,
`pnpm plugin:validate output/plugins/community.cards.json` et `pnpm infra:test`.
Les tests de moteur exercent imports interdits, absence des API hôte, tentative
d’évasion, exception expurgée, mémoire, boucle infinie et quota RPC.
La recette Docker utilise le plugin TypeScript externe de l’exemple, PostgreSQL,
Core et BFF réels. La recette navigateur `tests/browser/phase4.mjs` utilise Chrome
headless et des API synthétiques pour les états et interactions FR/EN,
clair/sombre, ordinateur/mobile ; `WEB_TEST_MODE=dev` vérifie aussi Vite.
Les preuves détaillées sont dans [REVIEW_PHASE_4.md](REVIEW_PHASE_4.md).

## Projet de plugin hors du monorepo

Les commandes `plugin:*` ci-dessus sont lancées depuis le checkout Orkobi ; le
répertoire fourni peut être extérieur au workspace. Pour typer un projet séparé,
copier `plugin.ts` et `manifest.json` de l’exemple, puis installer les archives
SDK locales. Remplacer les dépendances `workspace:*` par les chemins `file:` des
archives et utiliser le mapping d’overrides dans `pnpm-workspace.yaml`.
Ne pas conserver le `extends: ../../tsconfig.base.json` de l’exemple interne ;
utiliser un fichier autonome :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": []
  },
  "include": ["plugin.ts"]
}
```

Le `package.json` de ce projet définit `"type": "module"`. Garder une version
exacte de TypeScript, puis exécuter `tsc -p tsconfig.json` avant de construire le
paquet. Le SDK n’exige aucune dépendance NestJS, pilote PostgreSQL ou QuickJS dans
le projet du plugin ; le moteur et ses adaptateurs appartiennent au Core.
