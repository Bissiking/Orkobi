import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OnApplicationBootstrap, BeforeApplicationShutdown } from '@nestjs/common';
import { createId, isModuleManifest } from '@orkobi/contracts';
import type { ModuleTaskDeclaration, OrganizationContext, ScheduleJob } from '@orkobi/contracts';
import type { JobOutcome, PlatformTransaction } from '@orkobi/database';
import { CoreDatabase } from '../database.service.js';
import { ModuleDataService } from '../modules/data.js';
import { JOB_CONFIG } from './config.js';
import type { JobConfig } from './config.js';
import { JobRegistry } from './registry.js';

export type { ModuleTaskExecution as TaskExecution } from '@orkobi/sdk-core';

@Injectable()
export class JobEngine implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | undefined;
  private current: Promise<void> | undefined;
  private controller: AbortController | undefined;
  private stopping = false;
  private readonly metrics = {
    completed: 0,
    failed: 0,
    polls: 0,
    pollErrors: 0,
    lastDurationMs: 0,
  };
  constructor(
    @Inject(CoreDatabase) private readonly database: CoreDatabase,
    @Inject(JOB_CONFIG) private readonly config: JobConfig,
    @Inject(JobRegistry) private readonly registry: JobRegistry,
    @Inject(ModuleDataService) private readonly data: ModuleDataService,
  ) {}
  onApplicationBootstrap() {
    if (this.config.enabled) {
      this.timer = setInterval(() => void this.tick(), this.config.pollMs);
      this.timer.unref();
    }
  }
  async beforeApplicationShutdown() {
    this.stopping = true;
    clearInterval(this.timer);
    this.controller?.abort();
    // Un handler doit coopérer avec AbortSignal ; on ne libère jamais son verrou avant sa fin.
    await this.current;
  }
  status() {
    return { enabled: this.config.enabled, ...this.metrics };
  }

  async declaration(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    moduleId: string,
    task: string,
  ): Promise<ModuleTaskDeclaration> {
    const user = await repo.user(userId),
      org = await repo.organization(organizationId),
      member = await repo.membership(organizationId, userId);
    const module = await repo.module(moduleId),
      activations = await repo.organizationModules(organizationId);
    if (
      !user?.active ||
      !org?.active ||
      !member?.active ||
      !module?.enabled ||
      !activations.some((item) => item.moduleId === moduleId && item.enabled)
    )
      throw new ForbiddenException();
    if (!isModuleManifest(module.manifest)) throw new ForbiddenException();
    const declaration = module.manifest.tasks?.find((item) => item.key === task);
    if (!declaration || !(await this.registry.has(moduleId, task, repo)))
      throw new NotFoundException();
    const role = await repo.role(organizationId, member.roleId);
    if (!role?.permissions.includes(declaration.permission)) throw new ForbiddenException();
    return declaration;
  }
  async schedule(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    if (typeof body.moduleId !== 'string' || typeof body.task !== 'string')
      throw new BadRequestException();
    await this.declaration(repo, organizationId, userId, body.moduleId, body.task);
    if (
      body.runAt !== undefined &&
      (typeof body.runAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(body.runAt) ||
        !Number.isFinite(Date.parse(body.runAt)))
    )
      throw new BadRequestException();
    if (
      body.intervalSeconds !== undefined &&
      (!Number.isInteger(body.intervalSeconds) ||
        Number(body.intervalSeconds) < 60 ||
        Number(body.intervalSeconds) > 31536000)
    )
      throw new BadRequestException();
    const input: ScheduleJob = {
      moduleId: body.moduleId,
      task: body.task,
      ...(body.runAt ? { runAt: body.runAt as string } : {}),
      ...(body.intervalSeconds ? { intervalSeconds: Number(body.intervalSeconds) } : {}),
    };
    const id = randomUUID();
    if (!(await repo.createJob(id, organizationId, userId, input)))
      throw new ConflictException('File de tâches pleine.');
    await repo.audit(randomUUID(), userId, 'job.scheduled', organizationId, id);
    return { id };
  }
  async change(
    repo: PlatformTransaction,
    organizationId: string,
    userId: string,
    id: string,
    action: 'retry' | 'cancel',
  ) {
    const job = await repo.job(organizationId, id);
    if (!job) throw new NotFoundException();
    // Un autre utilisateur ne peut pas reprendre les droits du créateur par un retry.
    if (job.createdBy !== userId) throw new ForbiddenException();
    if (action === 'retry')
      await this.declaration(repo, organizationId, userId, job.moduleId, job.task);
    if (action === 'retry' && !['failed', 'suspended'].includes(job.status))
      throw new ConflictException();
    if (action === 'retry' && !(await repo.tryJobLock(organizationId, job.moduleId, job.task)))
      throw new ConflictException();
    if (action === 'cancel' && !['pending', 'running', 'suspended'].includes(job.status))
      throw new ConflictException();
    await repo.changeJob(
      organizationId,
      id,
      action === 'retry' ? 'pending' : 'cancelled',
      action === 'retry',
    );
    await repo.audit(
      randomUUID(),
      userId,
      action === 'retry' ? 'job.retried' : 'job.cancelled',
      organizationId,
      id,
    );
  }
  tick(): Promise<void> {
    if (this.stopping || this.current) return this.current ?? Promise.resolve();
    this.current = this.run()
      .catch(() => {
        this.metrics.pollErrors++;
      })
      .finally(() => {
        this.current = undefined;
      });
    return this.current;
  }
  private async run() {
    this.metrics.polls++;
    const store = await this.database.jobs(),
      lease = await store.claim();
    if (!lease) return;
    const started = performance.now(),
      job = lease.job,
      controller = new AbortController();
    this.controller = controller;
    let outcome: JobOutcome = 'succeeded',
      declaration: ModuleTaskDeclaration | undefined;
    const disconnected = () => {
      outcome = 'suspended';
      controller.abort();
    };
    lease.lost.addEventListener('abort', disconnected, { once: true });
    let checkPending: Promise<unknown> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined,
      monitor: ReturnType<typeof setInterval> | undefined;
    try {
      const repository = await this.database.repository();
      const authorize = () =>
        repository.transaction(async (repo) => {
          await repo.lockAdministration();
          const current = await repo.job(job.organizationId, job.id);
          if (current?.status !== 'running') throw new ForbiddenException();
          return this.declaration(repo, job.organizationId, job.createdBy, job.moduleId, job.task);
        });
      try {
        declaration = await authorize();
      } catch {
        outcome = 'suspended';
        return;
      }
      if (job.attempts > declaration.maxAttempts) {
        outcome = 'failed';
        return;
      }
      timer = setTimeout(() => {
        outcome = 'timeout';
        controller.abort();
      }, declaration.timeoutMs);
      let checking = false;
      monitor = setInterval(
        () => {
          if (checking) return;
          checking = true;
          checkPending = authorize()
            .catch(() => {
              outcome = 'suspended';
              controller.abort();
            })
            .finally(() => {
              checking = false;
            });
        },
        Math.min(1000, this.config.pollMs),
      );
      const context: OrganizationContext = Object.freeze({
        userId: createId<'user'>(job.createdBy),
        organizationId: createId<'organization'>(job.organizationId),
      });
      const handler = this.registry.get(job.moduleId, job.task);
      if (!handler) throw new Error('Task unavailable.');
      await handler(
        Object.freeze({
          id: job.id,
          context,
          signal: controller.signal,
          idempotencyKey: job.cycleId,
          data: Object.freeze({
            list: async (entity: string) =>
              repository.transaction(async (repo) => {
                controller.signal.throwIfAborted();
                await repo.lockAdministration();
                controller.signal.throwIfAborted();
                if ((await repo.job(job.organizationId, job.id))?.status !== 'running')
                  throw new ForbiddenException();
                await this.declaration(
                  repo,
                  job.organizationId,
                  job.createdBy,
                  job.moduleId,
                  job.task,
                );
                const result = await this.data.list(
                  repo,
                  job.organizationId,
                  job.createdBy,
                  job.moduleId,
                  entity,
                );
                return result;
              }),
          }),
        }),
      );
      if (this.stopping) outcome = 'suspended';
    } catch {
      if (!controller.signal.aborted) outcome = 'failed';
    } finally {
      clearTimeout(timer);
      clearInterval(monitor);
      await checkPending;
      if (this.stopping && outcome === 'succeeded') outcome = 'suspended';
      lease.lost.removeEventListener('abort', disconnected);
      this.controller = undefined;
      const durationMs = performance.now() - started;
      this.metrics.lastDurationMs = Math.round(durationMs);
      if (outcome === 'succeeded') this.metrics.completed++;
      else this.metrics.failed++;
      try {
        await lease.finish(outcome, declaration?.maxAttempts ?? 1, durationMs);
      } finally {
        await lease.release();
      }
    }
  }
}
