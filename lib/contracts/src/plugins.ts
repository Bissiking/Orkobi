import { isModuleManifest, entityNamePattern } from './modules.js';
import type { ModuleManifest } from './modules.js';

export const pluginApiVersion = 1 as const;
export type PluginIcon =
  'contacts' | 'invoices' | 'projects' | 'stocks' | 'members' | 'documents' | 'notes';
export interface PluginPage {
  readonly key: string;
  readonly title: { readonly fr: string; readonly en: string };
  readonly entity: string;
  readonly icon: PluginIcon;
}
export interface PluginMigration {
  readonly version: number;
  readonly entities: readonly string[];
}
export interface PluginManifest {
  readonly apiVersion: 1;
  readonly sdk: string;
  readonly module: ModuleManifest;
  readonly dependencyVersions: Readonly<Record<string, string>>;
  readonly migrations: readonly PluginMigration[];
  readonly frontend: { readonly apiVersion: 1; readonly pages: readonly PluginPage[] };
  readonly actions: readonly {
    readonly key: string;
    readonly permission: string;
    readonly timeoutMs: number;
  }[];
}
export interface PluginArtifact {
  readonly manifest: PluginManifest;
  readonly code: string;
}
export interface PluginSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly digest: string;
  readonly installed: boolean;
  readonly installedAt: string;
  readonly pages: readonly PluginPage[];
}
const icons = new Set([
  'contacts',
  'invoices',
  'projects',
  'stocks',
  'members',
  'documents',
  'notes',
]);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const short = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && v.trim() === v;
/** Validation fermée du manifeste ; aucune exécution ni accès système. */
export function isPluginArtifact(value: unknown): value is PluginArtifact {
  if (
    !record(value) ||
    !record(value.manifest) ||
    typeof value.code !== 'string' ||
    value.code.length < 1 ||
    value.code.length > 48000
  )
    return false;
  const m = value.manifest;
  if (m.apiVersion !== 1 || !short(m.sdk, 80) || !isModuleManifest(m.module)) return false;
  const module = m.module;
  const dependencyVersions = m.dependencyVersions;
  if (
    !record(dependencyVersions) ||
    Object.keys(dependencyVersions).length !== module.dependencies.length ||
    module.dependencies.some((id) => !short(dependencyVersions[id], 80))
  )
    return false;
  if (module.tasks?.some((task) => task.timeoutMs > 5000)) return false;
  if (module.id.startsWith('orkobi.') || module.id.length > 48 || module.entities.length > 10)
    return false;
  if (module.permissions.some((p) => !p.key.startsWith(`${module.id}:`))) return false;
  const schema = `orkobi_ext_${module.id.replaceAll('.', '_')}`;
  if (
    module.entities.some(
      (e) =>
        e.table !== `${schema}.${e.entity}` ||
        e.fields.some(
          (f) =>
            f.max === undefined ||
            f.max > 4000 ||
            !record(f.label) ||
            !short(f.label.fr, 120) ||
            !short(f.label.en, 120),
        ),
    )
  )
    return false;
  if (
    !Array.isArray(m.migrations) ||
    !m.migrations.length ||
    m.migrations.length > 50 ||
    !m.migrations.every(
      (step, index) =>
        record(step) &&
        step.version === index + 1 &&
        Array.isArray(step.entities) &&
        step.entities.length > 0 &&
        step.entities.every(
          (name) => typeof name === 'string' && module.entities.some((e) => e.entity === name),
        ) &&
        new Set(step.entities).size === step.entities.length,
    )
  )
    return false;
  const migrated = new Set(m.migrations.flatMap((step) => step.entities));
  if (module.entities.some((entity) => !migrated.has(entity.entity))) return false;
  if (
    !record(m.frontend) ||
    m.frontend.apiVersion !== 1 ||
    !Array.isArray(m.frontend.pages) ||
    m.frontend.pages.length > 10 ||
    !m.frontend.pages.every(
      (p) =>
        record(p) &&
        short(p.key, 40) &&
        entityNamePattern.test(p.key) &&
        record(p.title) &&
        short(p.title.fr, 120) &&
        short(p.title.en, 120) &&
        typeof p.entity === 'string' &&
        module.entities.some((e) => e.entity === p.entity) &&
        typeof p.icon === 'string' &&
        icons.has(p.icon),
    )
  )
    return false;
  if (new Set(m.frontend.pages.map((p) => p.key)).size !== m.frontend.pages.length) return false;
  if (
    !Array.isArray(m.actions) ||
    m.actions.length > 20 ||
    !m.actions.every(
      (a) =>
        record(a) &&
        short(a.key, 40) &&
        entityNamePattern.test(a.key) &&
        module.permissions.some((p) => p.key === a.permission) &&
        Number.isInteger(a.timeoutMs) &&
        Number(a.timeoutMs) >= 100 &&
        Number(a.timeoutMs) <= 5000,
    )
  )
    return false;
  const keys = [...m.actions.map((a) => a.key), ...(module.tasks ?? []).map((t) => t.key)];
  return new Set(keys).size === keys.length;
}
