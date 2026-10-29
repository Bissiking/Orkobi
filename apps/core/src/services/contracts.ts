import type { CoreSdk } from '@orkobi/sdk-core';
import type {
  CapabilityKey,
  OrganizationContext,
  OrganizationSummary,
  PermissionKey,
  Result,
  UserSummary,
} from '@orkobi/sdk-types';

/** Contrats internes : le Core établit le contexte, jamais le client ou un module. */
export interface CoreIdentityService {
  currentUser(context: OrganizationContext): Promise<Result<UserSummary>>;
}

export interface CoreOrganizationService {
  currentOrganization(context: OrganizationContext): Promise<Result<OrganizationSummary>>;
}

export interface CorePermissionService {
  /** Chaque implémentation doit relire les droits courants, sans accord implicite. */
  can(context: OrganizationContext, permission: PermissionKey): Promise<Result<boolean>>;
}

export interface CoreCapabilityService {
  /** Une capability disponible ne constitue jamais une autorisation. */
  has(context: OrganizationContext, capability: CapabilityKey): Promise<Result<boolean>>;
}

export interface ContextualSdkFactory {
  /** Adaptation seulement ; le contexte doit déjà avoir été autorisé par le Core. */
  forAuthorizedContext(context: OrganizationContext): CoreSdk;
}

export const CORE_IDENTITY = Symbol('CORE_IDENTITY');
export const CORE_ORGANIZATIONS = Symbol('CORE_ORGANIZATIONS');
export const CORE_PERMISSIONS = Symbol('CORE_PERMISSIONS');
export const CORE_CAPABILITIES = Symbol('CORE_CAPABILITIES');
