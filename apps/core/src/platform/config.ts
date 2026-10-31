import type { OidcProviderConfig } from './oidc.js';

export interface PlatformConfig {
  readonly setupToken: string;
  readonly secureCookies: boolean;
  /** Jeton partagé BFF ↔ Core ; vide = exigence désactivée (développement local). */
  readonly internalToken: string;
  readonly oidc: OidcProviderConfig | null;
}
export const PLATFORM_CONFIG = Symbol('PLATFORM_CONFIG');
export const localPlatformConfig: PlatformConfig = Object.freeze({
  setupToken: '',
  secureCookies: false,
  internalToken: '',
  oidc: null,
});
