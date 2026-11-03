# Carnet partagé — exemple de plugin externe

Ce projet est compilé séparément. Le Core n’importe pas `plugin.ts` : seul le
paquet produit est transmis au moteur QuickJS/WASM après installation explicite.

Depuis la racine d’Orkobi :

```sh
pnpm plugin:build
pnpm plugin:validate output/plugins/community.cards.json
```

Importer ce fichier dans **Administration → Extensions**, vérifier les droits et
l’empreinte puis installer. Activer le module sur la plateforme, accorder ses
permissions à un rôle et l’activer dans l’organisation choisie.

Le [guide Phase 4](../../DOCS/PHASE_4.md) décrit le format, le SDK, les migrations,
les pages déclaratives et les règles d’isolation. `pnpm sdk:test` vérifie aussi la
consommation des archives dans un projet temporaire hors workspace.
