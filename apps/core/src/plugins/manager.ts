import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createId, isPluginArtifact } from '@orkobi/contracts';
import type { PluginArtifact, OrganizationContext, StoreOrigin } from '@orkobi/contracts';
import type { PlatformTransaction } from '@orkobi/database';
import { CoreDatabase } from '../database.service.js';
import { ModuleDataService } from '../modules/data.js';
import { satisfiesRange } from '../modules/range.js';
import { coreVersion } from '../version.js';
import type { JobEngine } from '../jobs/service.js';
import { PLUGIN_JOBS } from '../jobs/config.js';
import type { TaskSignal } from '@orkobi/sdk-core';
import { runPlugin, PluginExecutionError } from './sandbox.js';

import { canonical, artifactDigest } from '@orkobi/store';
export const pluginDigest = artifactDigest;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  return value as Record<string, unknown>;
};

@Injectable()
export class PluginManager {
  private executing = 0;
  constructor(
    @Inject(CoreDatabase) private readonly database: CoreDatabase,
    @Inject(ModuleDataService) private readonly data: ModuleDataService,
    @Inject(ModuleRef) private readonly modules: ModuleRef,
  ) {}
  private artifact(value: unknown): PluginArtifact {
    if (!isPluginArtifact(value)) throw new BadRequestException('Plugin invalide.');
    if (
      !satisfiesRange(coreVersion, value.manifest.module.core) ||
      !satisfiesRange(coreVersion, value.manifest.sdk)
    )
      throw new ConflictException('Version incompatible.');
    return value;
  }
  private handlers(artifact: PluginArtifact) {
    return [
      ...artifact.manifest.actions.map((a) => a.key),
      ...(artifact.manifest.module.tasks ?? []).map((t) => t.key),
    ];
  }
  async validate(value: unknown) {
    const artifact = this.artifact(value);
    await this.sandbox(artifact, null, {}, {}, 500, async () => ({
      ok: false,
      error: { code: 'forbidden', message: 'Accès refusé.' },
    }));
    return { digest: pluginDigest(artifact), manifest: artifact.manifest };
  }
  private async sandbox(
    artifact: PluginArtifact,
    handler: string | null,
    context: unknown,
    input: unknown,
    timeoutMs: number,
    broker: (op: string, args: unknown, signal: AbortSignal) => Promise<unknown>,
    signal?: TaskSignal,
  ) {
    if (this.executing >= 2) throw new HttpException('Réessayer ultérieurement.', 429);
    this.executing++;
    try {
      return await runPlugin(
        {
          code: artifact.code,
          handlers: this.handlers(artifact),
          handler,
          context,
          input,
          timeoutMs,
          ...(signal ? { signal } : {}),
        },
        broker,
      );
    } catch (error) {
      if (error instanceof PluginExecutionError)
        throw new ConflictException('Exécution du plugin interrompue.');
      throw error;
    } finally {
      this.executing--;
    }
  }
  async install(
    repo: PlatformTransaction,
    userId: string,
    body: Record<string, unknown>,
    origin?: StoreOrigin,
  ) {
    const artifact = this.artifact(body.artifact),
      manifest = artifact.manifest,
      module = manifest.module,
      digest = pluginDigest(artifact);
    if (body.confirmId !== module.id || body.digest !== digest) throw new BadRequestException();
    const previous = await repo.plugin(module.id),
      registered = await repo.module(module.id);
    if (body.expectedPreviousDigest !== (previous?.digest ?? null))
      throw new ConflictException('Le plugin a changé.');
    if (registered?.enabled || (await repo.organizationModuleCount(module.id)) > 0)
      throw new ConflictException('Désactivez le plugin avant mise à jour.');
    if (!previous && registered) throw new ConflictException();
    if (!previous && (await repo.plugins()).length >= 100) throw new ConflictException();
    for (const [id, range] of Object.entries(manifest.dependencyVersions)) {
      const dependency = await repo.module(id);
      const external = await repo.plugin(id);
      if (
        !dependency ||
        external?.installed === false ||
        !satisfiesRange(dependency.version, range)
      )
        throw new ConflictException('Dépendance incompatible.');
      const visited = new Set<string>();
      const check = async (current: string): Promise<void> => {
        if (current === module.id) throw new ConflictException();
        if (visited.has(current)) return;
        visited.add(current);
        for (const nested of (await repo.module(current))?.manifest.dependencies ?? [])
          await check(nested);
      };
      await check(id);
    }
    if (previous) {
      if (!isPluginArtifact(previous.artifact)) throw new ConflictException();
      const old = previous.artifact.manifest;
      if (
        !(previous.installed === false && digest === previous.digest) &&
        !satisfiesRange(module.version, `>${old.module.version}`)
      )
        throw new ConflictException('Version non croissante.');
      if (
        canonical(manifest.migrations.slice(0, old.migrations.length)) !== canonical(old.migrations)
      )
        throw new ConflictException('Historique modifié.');
      for (const entity of old.module.entities) {
        const next = module.entities.find((e) => e.entity === entity.entity);
        if (
          !next ||
          entity.fields.some((field) => !next.fields.some((f) => canonical(f) === canonical(field)))
        )
          throw new ConflictException('Migration destructive refusée.');
        const added = next.fields.filter((f) => !entity.fields.some((old) => old.name === f.name));
        if (
          added.some((f) => f.required) ||
          (added.length &&
            !manifest.migrations
              .slice(old.migrations.length)
              .some((m) => m.entities.includes(entity.entity)))
        )
          throw new ConflictException();
      }
      if (
        canonical(old.module.entities) !== canonical(module.entities) &&
        manifest.migrations.length <= old.migrations.length
      )
        throw new ConflictException();
    }
    if (previous) {
      const old = previous.artifact.manifest.module.permissions.map((p) => p.key);
      const next = module.permissions.map((p) => p.key);
      await repo.revokeDeclaredPermissions([
        ...next.filter((key) => !old.includes(key)),
        ...old.filter((key) => !next.includes(key)),
      ]);
    }
    await repo.registerModule(module.id, module.version, module.name, module);
    await repo.savePlugin(artifact, digest, userId);
    if (origin) await repo.saveStoreOrigin(module.id, origin);
    else await repo.clearStoreOrigin(module.id);
    await repo.audit(
      randomUUID(),
      userId,
      previous ? 'plugin.updated' : 'plugin.installed',
      null,
      module.id,
    );
    return { id: module.id, digest };
  }
  async remove(
    repo: PlatformTransaction,
    userId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const plugin = await repo.plugin(id),
      module = await repo.module(id);
    if (!plugin?.installed) throw new NotFoundException();
    if (body.confirmId !== id || body.digest !== plugin.digest) throw new ConflictException();
    if (module?.enabled || (await repo.organizationModuleCount(id)) > 0)
      throw new ConflictException('Désactivez le plugin avant retrait.');
    for (const other of await repo.modules())
      if (other.enabled && other.manifest.dependencies.includes(id)) throw new ConflictException();
    await repo.removePlugin(id);
    await repo.suspendModuleJobs(id);
    await repo.audit(randomUUID(), userId, 'plugin.removed', null, id);
    return { success: true, dataRetained: true };
  }
  async grant(
    repo: PlatformTransaction,
    userId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const plugin = await repo.plugin(id);
    if (!plugin?.installed || body.confirmId !== id) throw new BadRequestException();
    if (
      typeof body.organizationId !== 'string' ||
      typeof body.roleId !== 'string' ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(body.roleId) ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(body.organizationId) ||
      !Array.isArray(body.permissions)
    )
      throw new BadRequestException();
    const role = await repo.role(body.organizationId, body.roleId);
    if (!role) throw new NotFoundException();
    const allowed = plugin.artifact.manifest.module.permissions.map((p) => p.key);
    if (
      body.permissions.some(
        (p) => typeof p !== 'string' || !allowed.includes(p as `${string}:${string}`),
      )
    )
      throw new ForbiddenException();
    const permissions = [
      ...role.permissions.filter((p) => !p.startsWith(`${id}:`)),
      ...new Set(body.permissions as string[]),
    ];
    if (permissions.length > 200) throw new ConflictException('Trop de permissions pour ce rôle.');
    await repo.saveRole(role.id, role.organizationId, role.name, permissions, role.builtin);
    await repo.audit(randomUUID(), userId, 'plugin.permissions_updated', role.organizationId, id);
    return { success: true };
  }
  async authorized(
    repo: PlatformTransaction,
    context: OrganizationContext,
    id: string,
    permission?: string,
  ) {
    const user = await repo.user(context.userId),
      org = await repo.organization(context.organizationId),
      member = await repo.membership(context.organizationId, context.userId);
    const plugin = await repo.plugin(id),
      module = await repo.module(id),
      activations = await repo.organizationModules(context.organizationId);
    if (
      !user?.active ||
      !org?.active ||
      !member?.active ||
      !plugin?.installed ||
      !module?.enabled ||
      !activations.some((m) => m.moduleId === id && m.enabled) ||
      !isPluginArtifact(plugin.artifact) ||
      pluginDigest(plugin.artifact) !== plugin.digest
    )
      throw new ForbiddenException();
    const role = await repo.role(context.organizationId, member.roleId);
    if (!role || (permission && !role.permissions.includes(permission)))
      throw new ForbiddenException();
    return { plugin, role, user, org };
  }
  async invoke(
    context: OrganizationContext,
    id: string,
    action: string,
    input: unknown,
    signal?: TaskSignal,
    jobId?: string,
    idempotencyKey?: string,
  ) {
    const repository = await this.database.repository();
    const artifact = await repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const { plugin } = await this.authorized(repo, context, id);
      const declaration = jobId
        ? plugin.artifact.manifest.module.tasks?.find((a) => a.key === action)
        : plugin.artifact.manifest.actions.find((a) => a.key === action);
      if (!declaration) throw new NotFoundException();
      await this.authorized(repo, context, id, declaration.permission);
      await repo.audit(
        randomUUID(),
        context.userId,
        'plugin.execution_started',
        context.organizationId,
        id,
      );
      return {
        value: plugin.artifact,
        timeoutMs: declaration.timeoutMs,
        permission: declaration.permission,
        digest: plugin.digest,
      };
    });
    const broker = async (op: string, args: unknown, executionSignal: AbortSignal) =>
      repository.transaction(async (repo) => {
        executionSignal.throwIfAborted();
        signal?.throwIfAborted();
        await repo.lockAdministration();
        executionSignal.throwIfAborted();
        signal?.throwIfAborted();
        const auth = await this.authorized(repo, context, id, artifact.permission);
        if (auth.plugin.digest !== artifact.digest) throw new ForbiddenException();
        if (jobId && (await repo.job(context.organizationId, jobId))?.status !== 'running')
          throw new ForbiddenException();
        const body = object(args);
        let value: unknown;
        if (op.startsWith('data.')) {
          if (typeof body.entity !== 'string') throw new BadRequestException();
          const parameters = [
            repo,
            context.organizationId,
            context.userId,
            id,
            body.entity,
          ] as const;
          if (op === 'data.list') value = await this.data.list(...parameters);
          else if (op === 'data.create')
            value = await this.data.create(...parameters, object(body.values));
          else if (op === 'data.update' && typeof body.id === 'string')
            value = await this.data.update(...parameters, body.id, object(body.values));
          else if (op === 'data.remove' && typeof body.id === 'string')
            value = await this.data.remove(...parameters, body.id);
          else throw new ForbiddenException();
        } else if (op === 'identity.currentUser')
          value = { id: auth.user.id, displayName: auth.user.name };
        else if (op === 'identity.currentOrganization')
          value = { id: auth.org.id, name: auth.org.name };
        else if (op === 'permissions.can')
          value =
            typeof body.permission === 'string' &&
            artifact.value.manifest.module.permissions.some((p) => p.key === body.permission) &&
            auth.role.permissions.includes(body.permission);
        else if (op.startsWith('jobs.')) {
          if (!auth.role.permissions.includes('modules:write')) throw new ForbiddenException();
          const jobs = this.modules.get<JobEngine>(PLUGIN_JOBS, { strict: false });
          if (op === 'jobs.schedule')
            value = await jobs.schedule(repo, context.organizationId, context.userId, {
              ...object(body.value),
              moduleId: id,
            });
          else if (op === 'jobs.list')
            value = (await repo.jobs(context.organizationId, context.userId)).filter(
              (j) => j.moduleId === id,
            );
          else if (['jobs.cancel', 'jobs.retry'].includes(op) && typeof body.value === 'string') {
            if ((await repo.job(context.organizationId, body.value))?.moduleId !== id)
              throw new ForbiddenException();
            await jobs.change(
              repo,
              context.organizationId,
              context.userId,
              body.value,
              op === 'jobs.cancel' ? 'cancel' : 'retry',
            );
            value = null;
          } else throw new ForbiddenException();
        } else throw new ForbiddenException();
        return { ok: true, value };
      });
    try {
      const result = await this.sandbox(
        artifact.value,
        action,
        {
          userId: context.userId,
          organizationId: context.organizationId,
          ...(jobId ? { execution: { id: jobId, idempotencyKey: idempotencyKey ?? null } } : {}),
        },
        input,
        artifact.timeoutMs,
        broker,
        signal,
      );
      await repository.transaction((repo) =>
        repo.audit(
          randomUUID(),
          context.userId,
          'plugin.execution_succeeded',
          context.organizationId,
          id,
        ),
      );
      return { result };
    } catch (error) {
      await repository.transaction((repo) =>
        repo.audit(
          randomUUID(),
          context.userId,
          'plugin.execution_failed',
          context.organizationId,
          id,
        ),
      );
      throw error;
    }
  }
  async taskAvailable(repo: PlatformTransaction, id: string, key: string) {
    const plugin = await repo.plugin(id);
    return (
      !!plugin?.installed && !!plugin.artifact.manifest.module.tasks?.some((t) => t.key === key)
    );
  }
  context(userId: string, organizationId: string): OrganizationContext {
    return Object.freeze({
      userId: createId<'user'>(userId),
      organizationId: createId<'organization'>(organizationId),
    });
  }
}
