import { Inject, Injectable } from '@nestjs/common';
import type { CoreSdk } from '@orkobi/sdk-core';
import type { OrganizationContext } from '@orkobi/sdk-types';
import {
  CORE_CAPABILITIES,
  CORE_IDENTITY,
  CORE_ORGANIZATIONS,
  CORE_PERMISSIONS,
} from './contracts.js';
import type {
  ContextualSdkFactory,
  CoreCapabilityService,
  CoreIdentityService,
  CoreOrganizationService,
  CorePermissionService,
} from './contracts.js';

@Injectable()
export class CoreSdkFactory implements ContextualSdkFactory {
  constructor(
    @Inject(CORE_IDENTITY) private readonly identity: CoreIdentityService,
    @Inject(CORE_ORGANIZATIONS) private readonly organizations: CoreOrganizationService,
    @Inject(CORE_PERMISSIONS) private readonly permissions: CorePermissionService,
    @Inject(CORE_CAPABILITIES) private readonly capabilities: CoreCapabilityService,
  ) {}

  forAuthorizedContext(authorizedContext: OrganizationContext): CoreSdk {
    // Copie explicite : une mutation de l'objet d'origine ne doit pas changer l'organisation.
    const context: OrganizationContext = Object.freeze({
      userId: authorizedContext.userId,
      organizationId: authorizedContext.organizationId,
      ...(authorizedContext.correlationId === undefined
        ? {}
        : { correlationId: authorizedContext.correlationId }),
    });
    const identity: CoreSdk['identity'] = {
      currentUser: () => this.identity.currentUser(context),
      currentOrganization: () => this.organizations.currentOrganization(context),
    };
    const permissions: CoreSdk['permissions'] = {
      can: (permission) => this.permissions.can(context, permission),
    };
    const capabilities: CoreSdk['capabilities'] = {
      has: (capability) => this.capabilities.has(context, capability),
    };
    return Object.freeze({
      context,
      identity: Object.freeze(identity),
      permissions: Object.freeze(permissions),
      capabilities: Object.freeze(capabilities),
    });
  }
}
