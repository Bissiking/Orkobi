import type { CapabilityKey, PermissionKey } from './index.js';

/** Manifeste standard des modules. Une déclaration n'accorde aucun droit. */
export interface ModuleCapabilityRequirement {
  readonly key: CapabilityKey;
  readonly required: boolean;
}

export interface ModulePermissionDeclaration {
  readonly key: PermissionKey;
  readonly description: string;
}

export interface ModuleFieldDeclaration {
  readonly name: string;
  readonly type: 'text';
  readonly required: boolean;
  readonly max?: number;
}

export interface ModuleEntityDeclaration {
  readonly entity: string;
  readonly table: string;
  readonly read: PermissionKey;
  readonly write: PermissionKey;
  readonly fields: readonly ModuleFieldDeclaration[];
}

export interface ModuleManifest {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly core: string;
  readonly dependencies: readonly string[];
  readonly capabilities: readonly ModuleCapabilityRequirement[];
  readonly permissions: readonly ModulePermissionDeclaration[];
  readonly entities: readonly ModuleEntityDeclaration[];
}

export const moduleIdPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/u;
export const moduleVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/u;
export const permissionKeyPattern = /^[a-z][a-z0-9]*:[a-z][a-z0-9_]*$/u;
export const capabilityKeyPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/u;
export const entityNamePattern = /^[a-z][a-z0-9_]*$/u;
/** Chaque table de module appartient à un schéma préfixé orkobi_, jamais au schéma système. */
export const moduleTablePattern =
  /^orkobi_(?!core\.|infrastructure\.)[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/u;
const systemFields = new Set(['id', 'organization_id', 'created_by', 'created_at', 'updated_at']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function plainString(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value
  );
}
function stringArray(value: unknown, pattern: RegExp, max: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((item) => typeof item === 'string' && pattern.test(item))
  );
}

export function isModuleManifest(value: unknown): value is ModuleManifest {
  if (!record(value)) return false;
  if (!plainString(value.id, 80) || !moduleIdPattern.test(value.id)) return false;
  if (!plainString(value.version, 40) || !moduleVersionPattern.test(value.version)) return false;
  if (!plainString(value.name, 120) || !plainString(value.description, 500)) return false;
  if (!plainString(value.core, 80)) return false;
  if (
    !value.core
      .split(/\s+/u)
      .every((part) => moduleVersionPattern.test(part.replace(/^(>=|<=|>|<|=)/u, '')))
  )
    return false;
  if (!stringArray(value.dependencies, moduleIdPattern, 20)) return false;
  if (new Set(value.dependencies).size !== value.dependencies.length) return false;
  if (value.dependencies.includes(value.id)) return false;
  if (
    !Array.isArray(value.capabilities) ||
    value.capabilities.length > 50 ||
    !value.capabilities.every(
      (item) =>
        record(item) &&
        plainString(item.key, 80) &&
        capabilityKeyPattern.test(item.key) &&
        typeof item.required === 'boolean',
    )
  )
    return false;
  if (new Set(value.capabilities.map((item) => item.key)).size !== value.capabilities.length)
    return false;
  if (
    !Array.isArray(value.permissions) ||
    value.permissions.length > 50 ||
    !value.permissions.every(
      (item) =>
        record(item) &&
        plainString(item.key, 80) &&
        permissionKeyPattern.test(item.key) &&
        plainString(item.description, 300),
    )
  )
    return false;
  const permissions = new Set(value.permissions.map((item) => item.key));
  if (permissions.size !== value.permissions.length) return false;
  if (
    !Array.isArray(value.entities) ||
    value.entities.length > 20 ||
    !value.entities.every(
      (entity) =>
        record(entity) &&
        plainString(entity.entity, 60) &&
        entityNamePattern.test(entity.entity) &&
        plainString(entity.table, 80) &&
        moduleTablePattern.test(entity.table) &&
        plainString(entity.read, 80) &&
        permissionKeyPattern.test(entity.read) &&
        permissions.has(entity.read) &&
        plainString(entity.write, 80) &&
        permissionKeyPattern.test(entity.write) &&
        permissions.has(entity.write) &&
        Array.isArray(entity.fields) &&
        entity.fields.length > 0 &&
        entity.fields.length <= 20 &&
        entity.fields.every(
          (field) =>
            record(field) &&
            plainString(field.name, 60) &&
            entityNamePattern.test(field.name) &&
            !systemFields.has(field.name) &&
            field.type === 'text' &&
            typeof field.required === 'boolean' &&
            (field.max === undefined ||
              (typeof field.max === 'number' &&
                Number.isInteger(field.max) &&
                field.max > 0 &&
                field.max <= 10000)),
        ) &&
        new Set((entity.fields as readonly { name: string }[]).map((field) => field.name)).size ===
          (entity.fields as readonly unknown[]).length,
    )
  )
    return false;
  const entities = value.entities as readonly { entity: string; table: string }[];
  return (
    new Set(entities.map((entity) => entity.entity)).size === entities.length &&
    new Set(entities.map((entity) => entity.table)).size === entities.length
  );
}

/** Vue d'un registre pour l'organisation courante ; aucun droit implicite. */
export interface ModuleSummary {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly missingCapabilities: readonly CapabilityKey[];
  readonly unsatisfiedDependencies: readonly string[];
}

/** Vue administrateur : registre complet et nombre d'organisations activant le module. */
export interface RegisteredModule extends ModuleSummary {
  readonly organizationCount: number;
}

export type CapabilityAvailability = 'available' | 'limited' | 'unavailable';

export interface CapabilityStatus {
  readonly key: CapabilityKey;
  readonly description: string;
  readonly availability: CapabilityAvailability;
}

/** Entrée générique d'une entité de module ; seuls les champs déclarés sont exposés. */
export interface ModuleEntry {
  readonly id: string;
  readonly values: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
