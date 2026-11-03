import { Inject, Injectable, Optional } from '@nestjs/common';
import { PLATFORM_CONFIG, localPlatformConfig } from '../platform/config.js';
import type { PlatformConfig } from '../platform/config.js';
import type {
  CapabilityKey,
  CapabilityStatus,
  OrganizationContext,
  Result,
} from '@orkobi/contracts';
import { CoreDatabase } from '../database.service.js';
import type { CoreCapabilityService } from '../services/contracts.js';

interface CatalogueEntry {
  readonly key: CapabilityKey;
  readonly description: string;
  readonly state: 'database' | 'limited' | 'unavailable';
  readonly engines?: readonly string[];
}

/**
 * Catalogue officiel des capabilities du Core. Une capability disponible ne
 * confère aucun droit ; « limited » signale une fonctionnalité réelle mais
 * réduite, documentée dans sa description.
 */
const catalogue: readonly CatalogueEntry[] = Object.freeze([
  {
    key: 'core.sql.arrays',
    description: 'Tableaux SQL natifs PostgreSQL.',
    state: 'database',
    engines: ['postgresql'],
  },
  {
    key: 'core.sql.json',
    description: 'Type JSON natif ; MariaDB utilise un alias texte validé.',
    state: 'database',
    engines: ['postgresql', 'mysql'],
  },
  {
    key: 'core.sql.transactionalddl',
    description: 'DDL transactionnel avec annulation du lot.',
    state: 'database',
    engines: ['postgresql'],
  },
  {
    key: 'core.storage.objects',
    description: 'Stockage objet S3 étudié, fournisseur non implémenté.',
    state: 'unavailable',
  },
  {
    key: 'core.nosql',
    description: 'Moteur documentaire facultatif, non implémenté.',
    state: 'unavailable',
  },
  {
    key: 'core.orchestration.aion',
    description: 'Orchestration externe étudiée, connecteur non implémenté.',
    state: 'unavailable',
  },
  Object.freeze({
    key: 'core.plugins',
    description:
      'Extensions tierces à manifeste versionné, moteur QuickJS/WASM isolé et accès SDK contrôlés.',
    state: 'limited',
  }),
  Object.freeze({
    key: 'core.identity',
    description: 'Comptes, sessions et connexions locales.',
    state: 'database',
  }),
  Object.freeze({
    key: 'core.organizations',
    description: 'Organisations et appartenances multi-organisation.',
    state: 'database',
  }),
  Object.freeze({
    key: 'core.permissions',
    description: 'Rôles et autorisations par organisation.',
    state: 'database',
  }),
  Object.freeze({
    key: 'core.audit',
    description: 'Journal des opérations sensibles.',
    state: 'database',
  }),
  Object.freeze({
    key: 'core.modules',
    description: 'Registre des modules et activation par organisation.',
    state: 'database',
  }),
  Object.freeze({
    key: 'core.data.sql',
    description:
      'Accès SQL des modules, borné à leurs tables et isolé par organisation (isolation applicative, sans RLS).',
    state: 'limited',
  }),
  Object.freeze({
    key: 'core.identity.oidc',
    description: 'Authentification OIDC externe, disponible lorsqu’un fournisseur est configuré.',
    state: 'database',
  }),
  Object.freeze({
    key: 'core.integrations',
    description:
      'API d’intégration en lecture, avec jetons et scopes ; activation administrateur requise.',
    state: 'database',
  }),
  Object.freeze({
    key: 'core.events',
    description: 'Bus d’événements métier entre modules (contrats publiés, bus non implémenté).',
    state: 'unavailable',
  }),
  Object.freeze({
    key: 'core.jobs',
    description: 'File SQL durable, tâches ponctuelles et récurrentes des modules officiels.',
    state: 'database',
  }),
  Object.freeze({
    key: 'core.cache',
    description:
      'Cache technique mémoire borné, Redis optionnel ; jamais une autorité de sécurité.',
    state: 'limited',
  }),
]);

@Injectable()
export class CapabilityRegistry implements CoreCapabilityService {
  constructor(
    @Inject(CoreDatabase) private readonly database: CoreDatabase,
    @Optional()
    @Inject(PLATFORM_CONFIG)
    private readonly config: PlatformConfig = localPlatformConfig,
  ) {}

  private resolve(entry: CatalogueEntry, ready: boolean): CapabilityStatus['availability'] {
    const engine = this.database.engine ?? 'postgresql';
    if (
      !ready ||
      entry.state === 'unavailable' ||
      (entry.engines && !entry.engines.includes(engine)) ||
      (entry.key === 'core.identity.oidc' && !this.config.oidc)
    )
      return 'unavailable';
    return entry.state === 'limited' ? 'limited' : 'available';
  }
  async status(): Promise<{ capabilities: CapabilityStatus[] }> {
    const ready = await this.database.isReady();
    return {
      capabilities: catalogue.map((entry) => ({
        key: entry.key,
        description: entry.description,
        availability: this.resolve(entry, ready),
      })),
    };
  }
  /** Une exigence obligatoire est satisfaite par available ou limited. */
  async availability(key: CapabilityKey): Promise<CapabilityStatus['availability']> {
    const entry = catalogue.find((item) => item.key === key);
    return entry ? this.resolve(entry, await this.database.isReady()) : 'unavailable';
  }

  async has(context: OrganizationContext, capability: CapabilityKey): Promise<Result<boolean>> {
    try {
      const availability = await this.availability(capability);
      return { ok: true, value: availability !== 'unavailable' };
    } catch {
      return {
        ok: false,
        error: {
          code: 'unavailable',
          message: 'Service indisponible.',
          ...(context.correlationId ? { correlationId: context.correlationId } : {}),
        },
      };
    }
  }
}
