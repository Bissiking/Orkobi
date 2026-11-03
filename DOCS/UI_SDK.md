# Kit UI Orkobi — guide pour développeurs et IA

## Règle de base

Le frontend et les futurs plugins utilisent **`@orkobi/sdk-ui`**, dans `sdk/ui/`.
Ses composants et sa feuille CSS sont la source commune. Aucun framework
CSS externe (Tailwind, Bootstrap, Bulma…), bibliothèque de composants visuels,
CSS-in-JS ou CDN CSS ne doit être ajouté. React Router et les icônes Lucide déjà
présents restent des dépendances fonctionnelles ; ce ne sont pas des frameworks CSS.

Le package reste privé et expérimental, synchronisé avec la version racine.
Il est réellement consommé par `apps/web`, pas seulement préparé pour le SDK.
La distribution, le chargeur et l’isolation des plugins tiers restent en Phase 4.

## Avant une modification

1. Lire `PRODUCT.md`, `DESIGN.md`, ce guide et le guide de la fonctionnalité.
2. Chercher les composants existants avant d’en créer un autre.
3. Importer les primitives depuis l’export public ; ne jamais importer `src/` ou `dist/`.
4. Conserver les thèmes clair/sombre, le français/anglais, les états vide,
   chargement, erreur et refus de permission ; garder la navigation dans l’URL.
5. Faire respecter les droits par le Core : masquer un contrôle ne suffit pas.

## Installation et imports

Déclarer `@orkobi/sdk-ui: workspace:*` dans le consommateur du monorepo.
Les peers sont React 19 et React Router 8 (versions exactes du workspace dans
`package.json`). Compiler avec `pnpm build` avant de consommer les exports.

```tsx
import { Button, Field, Notice } from '@orkobi/sdk-ui';
import '@orkobi/sdk-ui/styles.css'; // une fois, à l’entrée de l’application

export function PluginForm() {
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <Field label="Nom" name="name" maxLength={120} autoComplete="name" />
      <Button variant="primary" type="submit">
        Enregistrer
      </Button>
      <Notice tone="info">Les champs marqués sont obligatoires.</Notice>
    </form>
  );
}
```

Les libellés de cet exemple doivent passer par les traductions du plugin.
Un plugin hébergé dans Orkobi n’importe pas une seconde copie de la feuille CSS.
Un projet autonome l’importe une fois. Un `Button` utilisant `to` exige un Router.

## Contrats des composants

| Composant | Usage et garanties                                                                                                                                                                                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`  | Variantes `plain`, `primary`, `secondary`, `text`, `icon`. Bouton natif par défaut avec `type="button"`. Déclarer `type="submit"` pour soumettre. Avec `to`, lien React Router ; `disabled` expose `aria-disabled`, retire l’accès par tabulation et bloque le clic. Les attributs natifs du bouton ou du lien sont typés.                                                        |
| `Field`   | Label associé à un identifiant unique, aide et erreur reliées par `aria-describedby`, `aria-invalid` si erreur. `value` est la **valeur initiale non contrôlée** ; utiliser un champ natif pour un état contrôlé. Obligatoire par défaut, `required={false}` pour un champ facultatif. Définir explicitement `minLength`, `maxLength`, `autoComplete`, `pattern` selon le métier. |
| `Notice`  | Tons `info`, `success`, `error`. `role="status"` ou `role="alert"` pour une erreur ; contenu React, jamais de HTML injecté.                                                                                                                                                                                                                                                       |

Un bouton icône doit avoir un nom accessible (`aria-label`). Le focus est visible.
`TaskForm`, `ResourceNotice` et le wrapper `Field` dans `platform/components.tsx`
restent applicatifs : ils connaissent traductions, requêtes, messages et règles
de mot de passe de la plateforme. Ne pas les importer dans un plugin.

## CSS, thèmes et périmètre

`sdk/ui/src/styles.css` possède les variables sémantiques des deux thèmes et
les classes des primitives : `.button`, `.primary`, `.secondary`, `.text-button`,
`.text-link`, `.icon-button`, `.platform-field`, `.form-error`, `.form-success`.
Ces noms historiques sont conservés pour éviter une migration visuelle inutile.
Le thème est piloté par `data-theme="dark"` sur la racine du document.

Utiliser `var(--surface)`, `var(--ink)`, `var(--muted)`, `var(--line)`,
`var(--accent)`, `var(--on-accent)`, `var(--ring)` et les variables d’état ;
aucune couleur claire codée en dur dans une surface qui suit le thème.
La typographie Manrope reste auto-hébergée par l’application ; le kit n’impose
aucun téléchargement de fonte. Les styles de layout restent dans `apps/web`.
La feuille du kit n’installe pas de reset universel ni de styles de table globaux.
Préfixer les classes propres à un plugin (`demo-*`, par exemple), sans redéfinir
les primitives partagées ou les variables globales pour tout l’hôte.

## Ajouter une primitive

Extraire un motif réellement répété, avec une API typée et des contrôles natifs.
Placer le composant dans `sdk/ui/src`, l’exporter dans `index.ts`, placer ses
styles dans la feuille du kit et documenter propriétés, erreurs et accessibilité.
Migrer les usages et retirer l’ancienne implémentation dans le même lot.
Ne pas introduire un design system parallèle dans un plugin.

## Vérification et prompt de reprise

Lancer `pnpm check`, `pnpm typecheck` et vérifier le rendu ordinateur/mobile,
clair/sombre et FR/EN. `tests/ui.test.mjs` vérifie les garanties sémantiques.
La recette `tests/browser/phase3-sdk.mjs` utilise Puppeteer fourni par l’environnement :
`PUPPETEER_MODULE=<module ESM ou paquet installé> CHROME_EXECUTABLE=<Chrome> node tests/browser/phase3-sdk.mjs`.
Ajouter `WEB_TEST_MODE=dev` pour Vite. Ses API sont synthétiques ; elle ne prouve
pas les permissions PostgreSQL, couvertes par `pnpm infra:test`.

Prompt de départ conseillé :

> Lis DOCS/UI_SDK.md, DOCS/SDK.md, PRODUCT.md et DESIGN.md. Réutilise
> @orkobi/sdk-ui et ses styles CSS natifs, sans framework CSS externe. Préserve
> les thèmes, FR/EN, la navigation URL et les contrôles Core. Implémente les
> états chargement/vide/erreur et vérifie les parcours réels. Distingue les
> preuves unitaires, synthétiques, PostgreSQL et de production.

## Icônes des applications : Papicons

Le SDK expose `AppIcon` :

```tsx
import { AppIcon } from '@orkobi/sdk-ui';

<AppIcon name="notes" size={24} />; // décorative à côté d’un texte
<AppIcon name="documents" label="Documents" />; // nom accessible si isolée
```

Noms disponibles : `contacts`, `invoices`, `projects`, `stocks`, `members`,
`documents`, `notes`. Le catalogue et le module de démonstration les consomment.
Les icônes d’actions et de navigation existantes restent dans Lucide.

Les tracés proviennent de [Papicons](https://github.com/PapillonApp/Papicons),
présenté dans la [documentation Papillon](https://docs.papillon.bzh/developper/getting-started/architecture).
La sélection est intégrée sous forme de SVG React locaux, utilisant `currentColor` :
aucun appel réseau, aucune police d’icônes ni dépendance React Native.
Le paquet npm inspecté (`@getpapillon/papicons` 0.2.3) inclut `react-native-svg` ;
ce sous-ensemble SVG évite d’introduire ces dépendances natives dans le monorepo web.

`sdk/ui/papicons-sources.json` enregistre les chemins et identifiants des blobs
Git amont. `sdk/ui/src/papicons.ts` conserve les tracés ; seuls les attributs
React et la couleur héritée sont adaptés. Ajouter un dessin nécessite de reprendre
un SVG amont, d’actualiser cette provenance et le catalogue typé, puis de vérifier
le rendu. Ne pas injecter un SVG/HTML fourni par un plugin avec `dangerouslySetInnerHTML`.
La licence MIT complète est conservée dans `sdk/ui/PAPICONS_LICENSE.txt`, incluse
dans le package SDK et copiée dans le build web à `/licenses/papicons.txt`.
