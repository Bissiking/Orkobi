import { createHash, createPublicKey, KeyObject, sign, verify } from 'node:crypto';
import type { KeyLike } from 'node:crypto';
import { isPluginArtifact, parseVersion } from '@orkobi/contracts';
import type {
  PluginArtifact,
  SignedStoreCatalog,
  StoreCatalog,
  StoreRelease,
} from '@orkobi/contracts';
export const catalogLimit = 262144,
  artifactLimit = 90000;
export const repositoryIdPattern = /^[a-z][a-z0-9-]{0,39}$/u;
export const digestPattern = /^[a-f0-9]{64}$/u;
export class StoreTrustError extends Error {
  constructor() {
    super('Catalogue ou paquet non vérifié.');
  }
}
export class StoreUnavailableError extends Error {
  constructor() {
    super('Dépôt momentanément indisponible.');
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const artifactDigest = (artifact: PluginArtifact) =>
  createHash('sha256').update(canonical(artifact)).digest('hex');
export const catalogDigest = (catalog: StoreCatalog) =>
  createHash('sha256').update(canonical(catalog)).digest('hex');
export function publicKeyId(publicKey: KeyLike) {
  if (
    !(publicKey instanceof KeyObject) &&
    !String(publicKey).startsWith('-----BEGIN PUBLIC KEY-----\n')
  )
    throw new StoreTrustError();
  const key = publicKey instanceof KeyObject ? publicKey : createPublicKey(publicKey);
  if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new StoreTrustError();
  return createHash('sha256')
    .update(key.export({ format: 'der', type: 'spki' }))
    .digest('hex');
}
const signedBytes = (catalog: StoreCatalog) =>
  Buffer.from(`orkobi-store-catalog-v1\n${canonical(catalog)}`);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const stamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value));
export function validateCatalog(
  value: unknown,
  repositoryId: string,
  now = Date.now(),
): StoreCatalog {
  if (
    !object(value) ||
    value.apiVersion !== 1 ||
    value.repositoryId !== repositoryId ||
    !repositoryIdPattern.test(repositoryId) ||
    !Number.isSafeInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    !stamp(value.issuedAt) ||
    !stamp(value.expiresAt) ||
    Date.parse(value.issuedAt) > now + 60000 ||
    Date.parse(value.expiresAt) <= now ||
    Date.parse(value.expiresAt) - Date.parse(value.issuedAt) > 7 * 86400000 ||
    Date.parse(value.expiresAt) <= Date.parse(value.issuedAt) ||
    !Array.isArray(value.releases) ||
    value.releases.length > 40
  )
    throw new StoreTrustError();
  const unique = new Set<string>();
  for (const release of value.releases) {
    if (
      !object(release) ||
      !object(release.manifest) ||
      !isPluginArtifact({ manifest: release.manifest, code: 'export {};' }) ||
      !digestPattern.test(String(release.digest)) ||
      !stamp(release.publishedAt) ||
      Date.parse(release.publishedAt) > Date.parse(value.issuedAt) ||
      !Array.isArray(release.sqlEngines) ||
      !release.sqlEngines.length ||
      release.sqlEngines.some(
        (engine) =>
          typeof engine !== 'string' || !['postgresql', 'mariadb', 'mysql'].includes(engine),
      ) ||
      new Set(release.sqlEngines).size !== release.sqlEngines.length
    )
      throw new StoreTrustError();
    const manifest = release.manifest as unknown as StoreRelease['manifest'];
    if (!parseVersion(manifest.module.version)) throw new StoreTrustError();
    const identity = `${manifest.module.id}@${manifest.module.version}`;
    if (unique.has(identity)) throw new StoreTrustError();
    unique.add(identity);
  }
  if (Buffer.byteLength(canonical(value)) > catalogLimit) throw new StoreTrustError();
  return value as unknown as StoreCatalog;
}
export function signCatalog(catalog: StoreCatalog, privateKey: KeyLike): SignedStoreCatalog {
  validateCatalog(catalog, catalog.repositoryId);
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  return {
    catalog,
    keyId: publicKeyId(publicKey),
    signature: sign(null, signedBytes(catalog), privateKey).toString('base64'),
  };
}
export function verifyCatalog(
  value: unknown,
  repositoryId: string,
  publicKeys: readonly string[],
  now = Date.now(),
): SignedStoreCatalog {
  try {
    if (
      !object(value) ||
      typeof value.keyId !== 'string' ||
      typeof value.signature !== 'string' ||
      !/^[A-Za-z0-9+/]{86}==$/u.test(value.signature)
    )
      throw new StoreTrustError();
    const catalog = validateCatalog(value.catalog, repositoryId, now),
      key = publicKeys.find((key) => publicKeyId(key) === value.keyId);
    if (!key || !verify(null, signedBytes(catalog), key, Buffer.from(value.signature, 'base64')))
      throw new StoreTrustError();
    return { catalog, keyId: value.keyId, signature: value.signature };
  } catch {
    throw new StoreTrustError();
  }
}
export function verifyArtifact(value: unknown, release: StoreRelease): PluginArtifact {
  if (
    !isPluginArtifact(value) ||
    Buffer.byteLength(JSON.stringify(value)) > artifactLimit ||
    artifactDigest(value) !== release.digest ||
    canonical(value.manifest) !== canonical(release.manifest)
  )
    throw new StoreTrustError();
  return value;
}
export interface StoreRepositoryConfig {
  readonly id: string;
  readonly name: string;
  readonly channel: 'official' | 'community' | 'private';
  readonly url: string;
  readonly publicKeys: readonly string[];
  readonly token?: string;
  readonly allowHttp?: boolean;
  readonly minimumSequence?: number;
}
/** Configuration de confiance serveur uniquement. Aucune URL ni clé reçue du navigateur. */
export function loadRepositories(value: string | undefined): readonly StoreRepositoryConfig[] {
  try {
    const rows: unknown = JSON.parse(value ?? '[]');
    if (!Array.isArray(rows) || rows.length > 5) throw new Error();
    const ids = new Set();
    for (const repo of rows) {
      if (
        !object(repo) ||
        typeof repo.id !== 'string' ||
        !repositoryIdPattern.test(repo.id) ||
        ids.has(repo.id) ||
        typeof repo.name !== 'string' ||
        !repo.name.trim() ||
        repo.name.length > 120 ||
        typeof repo.channel !== 'string' ||
        !['official', 'community', 'private'].includes(repo.channel) ||
        typeof repo.url !== 'string' ||
        !Array.isArray(repo.publicKeys) ||
        !repo.publicKeys.length ||
        repo.publicKeys.length > 3 ||
        repo.publicKeys.some((key) => typeof key !== 'string' || key.length > 1024)
      )
        throw new Error();
      const url = new URL(repo.url);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.endsWith('/') ||
        url.href.length > 2048 ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && repo.allowHttp === true)) ||
        (repo.allowHttp !== undefined && typeof repo.allowHttp !== 'boolean') ||
        (repo.token !== undefined &&
          (typeof repo.token !== 'string' || !/^[-A-Za-z0-9_]{32,256}$/u.test(repo.token))) ||
        (repo.channel === 'private' && !repo.token) ||
        (repo.minimumSequence !== undefined &&
          (!Number.isSafeInteger(repo.minimumSequence) || Number(repo.minimumSequence) < 1))
      )
        throw new Error();
      for (const key of repo.publicKeys) publicKeyId(String(key));
      ids.add(repo.id);
    }
    return Object.freeze(rows.map((row) => Object.freeze(row as StoreRepositoryConfig)));
  } catch {
    throw new Error('Configuration des dépôts Store invalide.');
  }
}
export async function fetchStoreJson(
  repo: StoreRepositoryConfig,
  path: string,
  limit: number,
): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, repo.url), {
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
      headers: {
        accept: 'application/json',
        ...(repo.token ? { authorization: `Bearer ${repo.token}` } : {}),
      },
    });
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'application/json')
      throw new StoreUnavailableError();
    const reader = response.body?.getReader();
    if (!reader) throw new StoreUnavailableError();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new StoreTrustError();
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new StoreTrustError();
    }
  } catch (error) {
    if (error instanceof StoreTrustError) throw error;
    throw new StoreUnavailableError();
  }
}
