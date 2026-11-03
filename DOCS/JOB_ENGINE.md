# Services optionnels et Job Engine — Phase 3.3/3.4

## Exécution minimale

SQL est la file durable : PostgreSQL de référence, MariaDB/MySQL alternatifs
depuis la [Phase 5](PHASE_5.md). Les noms de schémas ci-dessous sont ceux de
PostgreSQL ; les autres moteurs utilisent des tables préfixées et GET_LOCK. Redis est un cache jetable facultatif : aucune
session, autorisation, révocation ou tâche n’en dépend. Sans SQL prêt, le Core HTTP
reste vivant et le worker ne lance rien. `JOBS_ENABLED=false` arrête le polling
sans supprimer ni les tâches ni leur historique. Valeurs par défaut : worker actif,
`JOBS_POLL_MS=1000` (100–60000 ms), une exécution à la fois par processus.

La migration append-only `0008_jobs` crée `orkobi_core.jobs` et `job_runs`, leurs
index et les droits du compte runtime. Les migrations 0001–0007 sont inchangées.
Sauvegarder avant la mise à niveau d’une instance utilisée ; aucune migration ou
mise à jour de l’instance existante n’est lancée automatiquement par ce travail.

## Déclarer une tâche officielle

Le manifeste possède un tableau facultatif `tasks`. Chaque déclaration contient
une clé unique, une description, une permission **déclarée par le module**, un
timeout (100–300000 ms) et un nombre maximal de tentatives (1–5).

```ts
// Fragment de ModuleManifest, à côté des permissions et entités du module.
const tasks = [
  {
    key: 'verify_notes',
    description: 'Vérifier la lecture des notes.',
    permission: 'demo:read',
    timeoutMs: 10000,
    maxAttempts: 3,
  },
] as const;
```

Le handler typé `ModuleTaskHandler` est exporté par le module et enregistré dans
le registre **interne** du Core (`jobs/registry.ts`). Les déclarations ne chargent
aucun fichier et n’accordent aucun droit. Le module officiel `modules/demo`
importe uniquement `@orkobi/sdk-core` et `@orkobi/sdk-types`.

```ts
import type { ModuleTaskHandler } from '@orkobi/sdk-core';

export const verifyNotes: ModuleTaskHandler = async (execution) => {
  execution.signal.throwIfAborted();
  await execution.data.list('notes');
  execution.signal.throwIfAborted();
};
```

`execution` fournit un contexte utilisateur/organisation gelé, l’identifiant du
job, un signal d’arrêt coopératif, une clé d’idempotence et un accès `data.list`
borné au module, à ses entités, à ses permissions et à l’organisation courante.
L’accès actuel est en lecture, limité à 100 entrées comme le Data Access Manager.
Il ne fournit ni SQL, ni pool, ni accès système. Pour un futur effet externe,
utiliser `idempotencyKey` chez le destinataire et supporter la répétition.
Les plugins externes sont raccordés depuis la [Phase 4](PHASE_4.md) via
`PluginHandler` et `PluginSdk` : leur code tourne dans QuickJS/WASM, avec une
terminaison forcée du worker, et leurs appels `sdk.jobs` sont bornés au module.
Ils ne partagent pas le moteur JavaScript des handlers officiels. `sdk.execution`
leur transmet aussi l’identifiant et la clé d’idempotence du job. Le SDK `CoreSdk`
existant conserve son contrat pour les modules officiels.

## API et écran utilisateur

Les routes BFF suivantes utilisent session, Origin, CSRF et secret interne BFF/Core :

| Route sous `/api/platform/` | Contrôle                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET jobs`                  | Organisation active, `modules:read` ; uniquement les tâches du créateur connecté, 100 entrées récentes.                  |
| `POST jobs`                 | `modules:write`, appartenance active, module activé et permission propre à la tâche.                                     |
| `POST jobs/:id/cancel`      | Même organisation et créateur, `modules:write`. Possible aussi après désactivation du module.                            |
| `POST jobs/:id/retry`       | Même organisation et créateur, `modules:write`, tâche et permission toujours disponibles ; état `failed` ou `suspended`. |
| `GET admin/runtime`         | Administrateur plateforme ; métriques du processus, mode cache et état du worker, sans configuration secrète.            |

La création attend `{ moduleId, task, runAt?, intervalSeconds? }`. `runAt` est une
date avec fuseau explicite ; omission = dès que possible. L’intervalle est un
entier de 60 à 31536000 secondes ; omission = ponctuel. La file est bornée à
1000 tâches non terminées par organisation. Aucun payload arbitraire n’est stocké.
L’écran `/jobs` conserve l’organisation active, expose les états réels, le bouton
d’actualisation et les actions. La démo permet la lecture de ses notes ; aucun
effet métier artificiel n’est annoncé.

## Cycle, concurrence et récupération

`pending → running → succeeded` pour une tâche ponctuelle. En cas d’échec ou
timeout, reprise après 2, 4, 8… secondes (plafond 300), jusqu’à `maxAttempts`,
puis `failed`. Une récurrence réussie est replanifiée depuis **la fin** du run ;
les occurrences manquées ne provoquent pas de rattrapage en rafale. Une récurrence
qui épuise ses retries reste en échec jusqu’à une action explicite.

Un verrou consultatif PostgreSQL de session est détenu pour
`organisation/module/tâche`, y compris entre deux jobs distincts de cette tâche.
Il utilise un pool worker séparé du pool HTTP, sans transaction SQL retenue durant
le handler. Le verrou reste détenu après timeout tant que le handler n’a pas fini.
Le timeout déclenche `AbortSignal` ; il ne peut pas tuer du JavaScript synchrone
ou un module qui ignore son signal. Le worker continue à vérifier les droits
pendant une exécution ; chaque lecture de données les vérifie à nouveau.

À la perte de la connexion PostgreSQL, le signal est interrompu. Après un crash,
un autre worker peut prendre le verrou libéré, marquer l’ancienne tentative
`interrupted` et reprendre le job avec la **même clé d’idempotence** et un compteur
supplémentaire. Il n’existe pas de garantie exactly-once pour un effet externe :
un processus dont le réseau SQL est coupé doit coopérer avec le signal et ses
effets doivent être idempotents. Un nouveau cycle récurrent reçoit une nouvelle clé.

La désactivation d’un module suspend les jobs en attente et marque ceux en cours
dans la même transaction. Les lectures suivantes sont refusées et le signal est
interrompu au prochain contrôle. La réactivation ne relance rien implicitement.
Annuler ne défait pas les effets déjà réalisés. Les tâches terminées et les runs
sont conservés ; aucune purge silencieuse n’est ajoutée. Prévoir une politique
opérateur de rétention avant un usage prolongé.

## Cache technique

`TechnicalCache` propose `get`, `set`, `delete` par namespace et clé. Valeurs JSON
copiées, 64 Kio maximum, TTL obligatoire de 1 ms à une heure ; mémoire de 1000
entrées maximum avec éviction et expiration. Compteurs hits/misses/erreurs/écritures
consultables via l’API administrateur. Il s’agit d’un point d’extension interne,
pas d’un cache automatique des requêtes métier. Les décisions de sécurité restent
lues depuis PostgreSQL à chaque opération.

`REDIS_URL` vide sélectionne la mémoire. Avec une URL `redis://` ou `rediss://`,
l’adaptateur utilise le client officiel `@redis/client`, une file réseau bornée,
un timeout de 300 ms, sans offline queue. Une panne revient à la mémoire et la
connexion est retentée après cinq secondes. Les replis locaux ne constituent pas
un cache cohérent entre processus : utiliser uniquement des données recomputables,
avec TTL, jamais une décision qui exige une invalidation partagée immédiate.

Compose propose Redis dans le profil `cache`, sans port publié ni volume :

```sh
# Pour une instance que l’opérateur souhaite mettre à niveau :
# régler REDIS_URL=redis://redis:6379 dans son environnement, puis
# docker compose --profile cache up --build --wait
```

Le profil de test utilise son propre Redis. La pile par défaut fonctionne sans
Redis. Configurer TLS et une authentification si Redis quitte le réseau privé.
Référence du client : [connexion node-redis](https://redis.io/docs/latest/develop/clients/nodejs/connect/).

## Mesures et tests

`pnpm bench:services` compile le Core puis mesure 1000 écritures et lectures du
cache. Si des paramètres SQL sont explicitement fournis, il mesure aussi 100
readiness et transactions en lecture. Le script n’utilise pas implicitement `.env`.
Les percentiles sont des microbenchmarks séquentiels locaux, pas une capacité de
production. Mesurer le vrai débit avant d’augmenter le nombre de workers.
Les premiers axes à suivre sont l’attente du verrou global d’administration,
les readiness répétées et la croissance de l’historique ; aucune optimisation
des autorisations ne doit introduire de cache de droits.

`pnpm infra:test` construit une pile isolée et exécute migrations et permissions SQL,
les phases 1/2/3.1/3.2, puis `tests/jobs.integration.mjs` (BFF, deux Core, PostgreSQL)
et `tests/cache.integration.mjs` (Redis réel, partage et panne forcée).
Il vérifie ensuite panne SQL, redémarrage et recréation des conteneurs avec volume
conservé. Ses conteneurs optionnels sont arrêtés aussi lors du nettoyage.
Les volumes de test sont conservés conformément au script existant.
