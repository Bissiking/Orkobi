import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isModuleManifest } from '@orkobi/contracts';
import type {
  CapabilityKey,
  ModuleManifest,
  ModuleSummary,
  RegisteredModule,
} from '@orkobi/contracts';
import type { PlatformTransaction, StoredModule } from '@orkobi/database';
import { demoManifest } from '@orkobi/module-demo';
import { CoreDatabase } from '../database.service.js';
import { coreVersion } from '../version.js';
import { CapabilityRegistry } from './capability-registry.js';
import { satisfiesRange } from './range.js';

/** Registre des modules officiels livrés avec le Core. */
export const officialModules: readonly ModuleManifest[] = Object.freeze([demoManifest]);

function requireManifest(module: StoredModule): ModuleManifest {
  if (!isModuleManifest(module.manifest))
    throw new ConflictException('Manifeste de module invalide.');
  return module.manifest;
}

/** Registre central : synchronisation des manifestes, compatibilité et dépendances. */
@Injectable()
export class ModuleManager {
  constructor(
    @Inject(CoreDatabase) private readonly database: CoreDatabase,
    @Inject(CapabilityRegistry) private readonly capabilities: CapabilityRegistry,
  ) {}

  /** Upsert des manifestes officiels compatibles ; conserve l'état d'activation. */
  async sync(repo: PlatformTransaction): Promise<void> {
    for (const manifest of officialModules) {
      if (!isModuleManifest(manifest)) throw new ConflictException('Manifeste officiel invalide.');
      if (!satisfiesRange(coreVersion, manifest.core)) continue;
      await repo.registerModule(manifest.id, manifest.version, manifest.name, manifest);
    }
  }

  private missingCapabilities(
    manifest: ModuleManifest,
    available: ReadonlySet<CapabilityKey>,
  ): readonly CapabilityKey[] {
    return manifest.capabilities
      .filter((requirement) => requirement.required && !available.has(requirement.key))
      .map((requirement) => requirement.key);
  }

  private async availableCapabilities(): Promise<ReadonlySet<CapabilityKey>> {
    const { capabilities } = await this.capabilities.status();
    return new Set(
      capabilities
        .filter((capability) => capability.availability !== 'unavailable')
        .map((capability) => capability.key),
    );
  }

  async listForOrganization(
    repo: PlatformTransaction,
    organizationId: string,
  ): Promise<{ modules: ModuleSummary[] }> {
    await this.sync(repo);
    const modules = await repo.modules();
    const activations = await repo.organizationModules(organizationId);
    const activeIds = new Set(
      activations
        .filter((activation) => activation.enabled)
        .map((activation) => activation.moduleId),
    );
    const summaries: ModuleSummary[] = [];
    const available = await this.availableCapabilities();
    for (const module of modules) {
      const manifest = requireManifest(module);
      summaries.push({
        id: module.id,
        version: module.version,
        name: module.name,
        description: manifest.description,
        enabled: module.enabled,
        active: module.enabled && activeIds.has(module.id),
        missingCapabilities: this.missingCapabilities(manifest, available),
        unsatisfiedDependencies: manifest.dependencies.filter(
          (dependency) => !activeIds.has(dependency),
        ),
      });
    }
    return { modules: summaries };
  }

  async listForAdministration(repo: PlatformTransaction): Promise<{ modules: RegisteredModule[] }> {
    await this.sync(repo);
    const modules = await repo.modules();
    const registered: RegisteredModule[] = [];
    const available = await this.availableCapabilities();
    for (const module of modules) {
      const manifest = requireManifest(module);
      registered.push({
        id: module.id,
        version: module.version,
        name: module.name,
        description: manifest.description,
        enabled: module.enabled,
        active: false,
        missingCapabilities: this.missingCapabilities(manifest, available),
        unsatisfiedDependencies: [],
        organizationCount: await repo.organizationModuleCount(module.id),
      });
    }
    return { modules: registered };
  }

  async setPlatformEnabled(
    repo: PlatformTransaction,
    actorId: string,
    moduleId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.sync(repo);
    const module = await repo.module(moduleId);
    if (!module) throw new NotFoundException();
    // Valide le manifeste stocké avant tout changement d'état.
    requireManifest(module);
    if (!enabled) {
      if ((await repo.organizationModuleCount(moduleId)) > 0)
        throw new ConflictException('Ce module est encore activé dans des organisations.');
      for (const other of await repo.modules()) {
        if (!other.enabled || other.id === moduleId) continue;
        if (requireManifest(other).dependencies.includes(moduleId))
          throw new ConflictException('Un module dépendant est encore actif.');
      }
    }
    await repo.setModuleEnabled(moduleId, enabled);
    await repo.audit(
      randomUUID(),
      actorId,
      enabled ? 'module.enabled' : 'module.disabled',
      null,
      moduleId,
    );
  }

  async setOrganizationActive(
    repo: PlatformTransaction,
    actorId: string,
    organizationId: string,
    moduleId: string,
    active: boolean,
  ): Promise<void> {
    await this.sync(repo);
    const module = await repo.module(moduleId);
    if (!module) throw new NotFoundException();
    const manifest = requireManifest(module);
    const activations = await repo.organizationModules(organizationId);
    const activeIds = new Set(
      activations
        .filter((activation) => activation.enabled)
        .map((activation) => activation.moduleId),
    );
    if (active) {
      if (!module.enabled) throw new ConflictException('Module indisponible sur cette instance.');
      if (this.missingCapabilities(manifest, await this.availableCapabilities()).length)
        throw new ConflictException('Le module requiert des capabilities indisponibles.');
      if (!satisfiesRange(coreVersion, manifest.core))
        throw new ConflictException('Version du module incompatible avec ce Core.');
      const unsatisfied = manifest.dependencies.filter((dependency) => !activeIds.has(dependency));
      if (unsatisfied.length)
        throw new ConflictException('Activez d’abord les dépendances de ce module.');
    } else {
      for (const id of activeIds) {
        if (id === moduleId) continue;
        const dependent = await repo.module(id);
        if (!dependent?.enabled) continue;
        if (requireManifest(dependent).dependencies.includes(moduleId))
          throw new ConflictException(
            'Ce module est requis par un module actif de l’organisation.',
          );
      }
    }
    await repo.setOrganizationModule(organizationId, moduleId, active);
    await repo.audit(
      randomUUID(),
      actorId,
      active ? 'module.organization_activated' : 'module.organization_deactivated',
      organizationId,
      moduleId,
    );
  }
}
