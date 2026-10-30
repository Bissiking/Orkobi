export interface PlatformConfig {
  readonly setupToken: string;
  readonly secureCookies: boolean;
}
export const PLATFORM_CONFIG = Symbol('PLATFORM_CONFIG');
export const localPlatformConfig: PlatformConfig = Object.freeze({
  setupToken: '',
  secureCookies: false,
});
