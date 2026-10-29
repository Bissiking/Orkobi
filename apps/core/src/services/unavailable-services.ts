import { Injectable } from '@nestjs/common';
import type { OrganizationContext, Result } from '@orkobi/sdk-types';
import type {
  CoreCapabilityService,
  CoreIdentityService,
  CoreOrganizationService,
  CorePermissionService,
} from './contracts.js';

function unavailable(context: OrganizationContext): Result<never> {
  return {
    ok: false,
    error: {
      code: 'unavailable',
      message: 'Service du Core non implémenté.',
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    },
  };
}

/** Fournisseurs explicites d'indisponibilité, sans utilisateur ni permission fictifs. */
@Injectable()
export class UnavailableCoreServices
  implements
    CoreIdentityService,
    CoreOrganizationService,
    CorePermissionService,
    CoreCapabilityService
{
  async currentUser(context: OrganizationContext): Promise<Result<never>> {
    return unavailable(context);
  }

  async currentOrganization(context: OrganizationContext): Promise<Result<never>> {
    return unavailable(context);
  }

  async can(context: OrganizationContext): Promise<Result<never>> {
    return unavailable(context);
  }

  async has(context: OrganizationContext): Promise<Result<never>> {
    return unavailable(context);
  }
}
