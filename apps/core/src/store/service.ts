import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  artifactLimit,
  catalogLimit,
  fetchStoreJson,
  verifyCatalog,
  verifyArtifact,
  catalogDigest,
  canonical,
  publicKeyId,
  StoreTrustError,
  StoreUnavailableError,
} from '@orkobi/store';
import type { StoreRepositoryConfig } from '@orkobi/store';
import type { PlatformTransaction } from '@orkobi/database';
import type {
  PluginArtifact,
  SignedStoreCatalog,
  StoreRelease,
  StoreReview,
  StoreRepositorySummary,
} from '@orkobi/contracts';
import { satisfiesRange } from '@orkobi/contracts';
import { STORE_CONFIG } from './config.js';
import { PluginManager } from '../plugins/manager.js';
import { CapabilityRegistry } from '../modules/capability-registry.js';
import { CoreDatabase } from '../database.service.js';
import { coreVersion } from '../version.js';
export type StoreTransaction = <T>(
  operation: (repo: PlatformTransaction, userId: string) => Promise<T>,
) => Promise<T>;
interface Pending {
  readonly review: StoreReview;
  readonly artifact: PluginArtifact;
  readonly userId: string;
}
@Injectable()
export class StoreService {
  private active = 0;
  private readonly reviews = new Map<string, Pending>();
  constructor(
    @Inject(STORE_CONFIG) private readonly repositories: readonly StoreRepositoryConfig[],
    @Inject(PluginManager) private readonly plugins: PluginManager,
    @Inject(CapabilityRegistry) private readonly capabilities: CapabilityRegistry,
    @Inject(CoreDatabase) private readonly database: CoreDatabase,
  ) {}
  private repository(id: unknown) {
    const repo = this.repositories.find((repo) => repo.id === id);
    if (!repo) throw new NotFoundException();
    return repo;
  }
  private async catalog(repo: StoreRepositoryConfig) {
    return verifyCatalog(
      await fetchStoreJson(repo, 'v1/catalog', catalogLimit + 1024),
      repo.id,
      repo.publicKeys,
    );
  }
  private async checkpoint(
    repo: PlatformTransaction,
    config: StoreRepositoryConfig,
    snapshot: SignedStoreCatalog,
  ) {
    const { catalog, keyId } = snapshot,
      digest = catalogDigest(catalog),
      old = await repo.storeCheckpoint(config.id);
    if (
      catalog.sequence < (config.minimumSequence ?? 1) ||
      (old &&
        (catalog.sequence < Number(old.sequence) ||
          (catalog.sequence === Number(old.sequence) && old.digest !== digest)))
    )
      throw new StoreTrustError();
    if (!old || Number(old.sequence) !== catalog.sequence || old.keyId !== keyId)
      await repo.saveStoreCheckpoint(config.id, catalog.sequence, digest, keyId);
  }
  private async available() {
    const { capabilities } = await this.capabilities.status();
    return new Set(capabilities.filter((c) => c.availability !== 'unavailable').map((c) => c.key));
  }
  private async reasons(
    repo: PlatformTransaction,
    release: StoreRelease,
    available: ReadonlySet<string>,
    known?: ReadonlyMap<string, { version: string; installed: boolean | null }>,
  ) {
    const m = release.manifest,
      reasons: string[] = [];
    if (!satisfiesRange(coreVersion, m.module.core)) reasons.push('core');
    if (!satisfiesRange(coreVersion, m.sdk)) reasons.push('sdk');
    if (!this.database.engine || !release.sqlEngines.includes(this.database.engine))
      reasons.push('sql');
    for (const cap of m.module.capabilities)
      if (cap.required && !available.has(cap.key)) reasons.push(`capability:${cap.key}`);
    for (const [id, range] of Object.entries(m.dependencyVersions)) {
      if (known) {
        const dependency = known.get(id);
        if (
          !dependency ||
          dependency.installed === false ||
          !satisfiesRange(dependency.version, range)
        )
          reasons.push(`dependency:${id}`);
        continue;
      }
      const dependency = await repo.module(id),
        plugin = await repo.plugin(id);
      if (!dependency || plugin?.installed === false || !satisfiesRange(dependency.version, range))
        reasons.push(`dependency:${id}`);
    }
    return reasons;
  }
  async execute(
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown>,
    transaction: StoreTransaction,
  ) {
    const userId = await transaction(async (_repo, userId) => userId);
    if (this.active >= 2) throw new HttpException('Réessayer ultérieurement.', 429);
    this.active++;
    for (const [key, pending] of this.reviews)
      if (Date.parse(pending.review.expiresAt) <= Date.now()) this.reviews.delete(key);
    try {
      if (method === 'GET' && path === 'admin/store') return await this.list(transaction);
      if (method === 'POST' && path === 'admin/store/review')
        return await this.review(body, userId, transaction);
      if (method === 'POST' && path === 'admin/store/install')
        return await this.install(body, userId, transaction);
      throw new NotFoundException();
    } catch (error) {
      if (error instanceof StoreTrustError) throw new ConflictException('Dépôt non vérifié.');
      if (error instanceof StoreUnavailableError) throw new ServiceUnavailableException();
      throw error;
    } finally {
      this.active--;
    }
  }
  private async list(transaction: StoreTransaction) {
    const snapshots = await Promise.all(
        this.repositories.map(async (config) => {
          try {
            return { config, snapshot: await this.catalog(config), state: 'ready' as const };
          } catch (error) {
            return {
              config,
              snapshot: null,
              state:
                error instanceof StoreTrustError
                  ? ('untrusted' as const)
                  : ('unavailable' as const),
            };
          }
        }),
      ),
      available = await this.available();
    return transaction(async (repo) => {
      const repositories: StoreRepositorySummary[] = [];
      const known = new Map((await repo.storeModules()).map((module) => [module.id, module]));
      for (const entry of snapshots) {
        const base = {
          id: entry.config.id,
          name: entry.config.name,
          channel: entry.config.channel,
          keyId: publicKeyId(entry.config.publicKeys[0]!),
          checkedAt: new Date().toISOString(),
        };
        if (!entry.snapshot) {
          repositories.push({ ...base, state: entry.state, releases: [] });
          continue;
        }
        try {
          await this.checkpoint(repo, entry.config, entry.snapshot);
          const releases = [];
          for (const release of entry.snapshot.catalog.releases) {
            const id = release.manifest.module.id,
              installed = known.get(id),
              reasons = await this.reasons(repo, release, available, known);
            releases.push({
              id,
              name: release.manifest.module.name,
              icon: release.manifest.frontend.pages[0]?.icon ?? 'notes',
              description: release.manifest.module.description,
              version: release.manifest.module.version,
              digest: release.digest,
              sqlEngines: release.sqlEngines,
              installedVersion: installed?.installed ? installed.version : null,
              installedDigest: installed?.installed ? installed.digest : null,
              update:
                !!installed?.installed &&
                satisfiesRange(release.manifest.module.version, `>${installed.version}`),
              compatible: reasons.length === 0,
              reasons,
            });
          }
          releases.sort(
            (a, b) =>
              a.id.localeCompare(b.id) || (satisfiesRange(a.version, `>${b.version}`) ? -1 : 1),
          );
          repositories.push({ ...base, keyId: entry.snapshot.keyId, state: 'ready', releases });
        } catch (error) {
          if (!(error instanceof StoreTrustError)) throw error;
          repositories.push({ ...base, state: 'untrusted', releases: [] });
        }
      }
      return { repositories };
    });
  }
  private selection(snapshot: SignedStoreCatalog, body: Record<string, unknown>) {
    const release = snapshot.catalog.releases.find(
      (r) =>
        r.manifest.module.id === body.id &&
        r.manifest.module.version === body.version &&
        r.digest === body.digest,
    );
    if (!release) throw new ConflictException('Version de catalogue modifiée.');
    return release;
  }
  private async review(
    body: Record<string, unknown>,
    userId: string,
    transaction: StoreTransaction,
  ) {
    const config = this.repository(body.repositoryId),
      snapshot = await this.catalog(config),
      release = this.selection(snapshot, body);
    await transaction(async (repo) => this.checkpoint(repo, config, snapshot));
    const artifact = verifyArtifact(
      await fetchStoreJson(config, `v1/artifacts/${release.digest}`, artifactLimit),
      release,
    );
    await this.plugins.validate(artifact);
    const available = await this.available();
    return transaction(async (repo) => {
      const previous = await repo.plugin(release.manifest.module.id),
        module = await repo.module(release.manifest.module.id),
        origin = await repo.storeOrigin(release.manifest.module.id);
      const reasons = await this.reasons(repo, release, available);
      if (
        previous &&
        !(previous.installed === false && previous.digest === release.digest) &&
        !satisfiesRange(
          release.manifest.module.version,
          `>${previous.artifact.manifest.module.version}`,
        )
      )
        reasons.push('version');
      const review: StoreReview = {
        reviewId: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        repository: {
          id: config.id,
          name: config.name,
          channel: config.channel,
          keyId: snapshot.keyId,
        },
        release,
        previousDigest: previous?.digest ?? null,
        previousVersion: previous?.artifact.manifest.module.version ?? null,
        previousOrigin: origin ?? null,
        newPermissions: release.manifest.module.permissions
          .map((p) => p.key)
          .filter(
            (key) => !previous?.artifact.manifest.module.permissions.some((old) => old.key === key),
          ),
        reasons,
        requiresDeactivation:
          !!module?.enabled || (await repo.organizationModuleCount(release.manifest.module.id)) > 0,
      };
      if (this.reviews.size >= 50) throw new HttpException('Réessayer ultérieurement.', 429);
      this.reviews.set(review.reviewId, { review, artifact, userId });
      return review;
    });
  }
  private async install(
    body: Record<string, unknown>,
    userId: string,
    transaction: StoreTransaction,
  ) {
    const pending = typeof body.reviewId === 'string' ? this.reviews.get(body.reviewId) : undefined;
    if (!pending) throw new ConflictException('Revérifiez le paquet.');
    if (pending.userId !== userId) throw new ForbiddenException();
    const { review, artifact } = pending,
      id = review.release.manifest.module.id;
    if (
      body.confirmId !== id ||
      body.digest !== review.release.digest ||
      body.expectedPreviousDigest !== review.previousDigest ||
      body.acknowledgeSource !== true ||
      (review.newPermissions.length && body.acknowledgeNewPermissions !== true)
    )
      throw new BadRequestException();
    const config = this.repository(review.repository.id),
      snapshot = await this.catalog(config);
    this.selection(snapshot, {
      id,
      version: review.release.manifest.module.version,
      digest: review.release.digest,
    });
    if (snapshot.keyId !== review.repository.keyId)
      throw new ConflictException('Clé du dépôt modifiée.');
    await this.plugins.validate(artifact);
    const available = await this.available();
    const result = await transaction(async (repo) => {
      await this.checkpoint(repo, config, snapshot);
      const previous = await repo.plugin(id),
        origin = await repo.storeOrigin(id);
      if (
        (previous?.digest ?? null) !== review.previousDigest ||
        canonical(origin ?? null) !== canonical(review.previousOrigin)
      )
        throw new ConflictException('Extension modifiée depuis la revue.');
      if ((await this.reasons(repo, review.release, available)).length)
        throw new ConflictException('Extension incompatible.');
      const result = await this.plugins.install(
        repo,
        userId,
        {
          artifact,
          digest: review.release.digest,
          confirmId: id,
          expectedPreviousDigest: review.previousDigest,
        },
        {
          repositoryId: config.id,
          keyId: snapshot.keyId,
          catalogSequence: snapshot.catalog.sequence,
          digest: review.release.digest,
          verified: true,
        },
      );
      await repo.audit(randomUUID(), userId, 'store.plugin_installed', null, `${config.id}/${id}`);
      return result;
    });
    this.reviews.delete(review.reviewId);
    return result;
  }
}
