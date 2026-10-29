/** Contrats HTTP versionnés ; aucune preuve d'authentification ou de disponibilité métier. */
export interface CoreHealth {
  readonly status: 'ok';
  readonly service: 'orkobi-core';
}

export type CoreAvailability =
  | { readonly status: 'ok' }
  | {
      readonly status: 'unavailable';
      readonly reason: 'timeout' | 'unreachable' | 'invalid_response';
    };

export interface BffBootstrap {
  readonly schemaVersion: 1;
  readonly product: { readonly name: 'Orkobi'; readonly version: string };
  readonly core: CoreAvailability;
  readonly features: {
    readonly identity: 'unavailable';
    readonly organizations: 'unavailable';
    readonly modules: 'unavailable';
  };
  readonly checkedAt: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCoreHealth(value: unknown): value is CoreHealth {
  return record(value) && value.status === 'ok' && value.service === 'orkobi-core';
}

export function isBffBootstrap(value: unknown): value is BffBootstrap {
  if (!record(value) || value.schemaVersion !== 1) return false;
  const { product, core, features, checkedAt } = value;
  return (
    record(product) &&
    product.name === 'Orkobi' &&
    typeof product.version === 'string' &&
    product.version.length > 0 &&
    product.version.length <= 80 &&
    record(core) &&
    (core.status === 'ok' ||
      (core.status === 'unavailable' &&
        (core.reason === 'timeout' ||
          core.reason === 'unreachable' ||
          core.reason === 'invalid_response'))) &&
    record(features) &&
    features.identity === 'unavailable' &&
    features.organizations === 'unavailable' &&
    features.modules === 'unavailable' &&
    typeof checkedAt === 'string' &&
    Number.isFinite(Date.parse(checkedAt))
  );
}
