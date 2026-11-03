import type { PluginManifest, PluginIcon } from './plugins.js';
export type StoreSqlEngine = 'postgresql' | 'mariadb' | 'mysql';
export interface StoreRelease {
  readonly manifest: PluginManifest;
  readonly digest: string;
  readonly sqlEngines: readonly StoreSqlEngine[];
  readonly publishedAt: string;
}
export interface StoreCatalog {
  readonly apiVersion: 1;
  readonly repositoryId: string;
  readonly sequence: number;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly releases: readonly StoreRelease[];
}
export interface SignedStoreCatalog {
  readonly catalog: StoreCatalog;
  readonly keyId: string;
  readonly signature: string;
}
export interface StoreOrigin {
  readonly repositoryId: string;
  readonly keyId: string;
  readonly catalogSequence: number;
  readonly digest: string;
  readonly verified: boolean;
}
export interface StoreReleaseSummary {
  readonly icon: PluginIcon;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly digest: string;
  readonly sqlEngines: readonly StoreSqlEngine[];
  readonly installedVersion: string | null;
  readonly installedDigest: string | null;
  readonly update: boolean;
  readonly compatible: boolean;
  readonly reasons: readonly string[];
}
export interface StoreRepositorySummary {
  readonly id: string;
  readonly name: string;
  readonly channel: 'official' | 'community' | 'private';
  readonly state: 'ready' | 'unavailable' | 'untrusted';
  readonly keyId: string;
  readonly checkedAt: string;
  readonly releases: readonly StoreReleaseSummary[];
}
export interface StoreReview {
  readonly reviewId: string;
  readonly expiresAt: string;
  readonly repository: {
    readonly id: string;
    readonly name: string;
    readonly channel: 'official' | 'community' | 'private';
    readonly keyId: string;
  };
  readonly release: StoreRelease;
  readonly previousDigest: string | null;
  readonly previousVersion: string | null;
  readonly previousOrigin: StoreOrigin | null;
  readonly newPermissions: readonly string[];
  readonly reasons: readonly string[];
  readonly requiresDeactivation: boolean;
}
