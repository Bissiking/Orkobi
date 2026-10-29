import type { CoreSdk } from '@orkobi/sdk-core';
import type { OrganizationContext, Result, UserSummary } from '@orkobi/sdk-types';
import type {
  ContextualSdkFactory,
  CoreIdentityService,
  CoreOrganizationService,
  CorePermissionService,
  CoreCapabilityService,
} from '../../apps/core/src/services/contracts.js';
import { context } from './contracts.js';

export async function consumeServices(
  identity: CoreIdentityService,
  organizations: CoreOrganizationService,
  permissions: CorePermissionService,
  capabilities: CoreCapabilityService,
  factory: ContextualSdkFactory,
): Promise<Result<UserSummary>> {
  // @ts-expect-error Les lectures internes doivent recevoir un contexte d'organisation.
  void identity.currentUser();
  // @ts-expect-error Une organisation sans utilisateur ne constitue pas un contexte.
  void organizations.currentOrganization({ organizationId: context.organizationId });
  // @ts-expect-error Les permissions conservent leur convention ressource:action.
  void permissions.can(context, 'contacts.read');
  // @ts-expect-error Les capabilities conservent leur convention namespace.nom.
  void capabilities.has(context, 'core:identity');
  const sdk: CoreSdk = factory.forAuthorizedContext(context);
  // @ts-expect-error Le module ne peut pas choisir l'organisation à chaque appel SDK.
  void sdk.identity.currentUser(context);
  // @ts-expect-error Le contexte public ne peut pas être réaffecté.
  sdk.context.organizationId = context.organizationId;
  const boundContext: OrganizationContext = sdk.context;
  await permissions.can(boundContext, 'contacts:read');
  await capabilities.has(boundContext, 'core.identity');
  return identity.currentUser(boundContext);
}
