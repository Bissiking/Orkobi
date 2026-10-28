// sdk/core/src/index.ts
import type {
  CapabilityKey, OrganizationContext, OrganizationSummary,
  PermissionKey, Result, UserSummary,
} from '@orkobi/sdk-types';

export interface IdentityService {
  currentUser(): Promise<Result<UserSummary>>;
  currentOrganization(): Promise<Result<OrganizationSummary>>;
}

export interface PermissionService {
  /** Vérification informative ; chaque opération du Core doit revérifier les droits. */
  can(permission: PermissionKey): Promise<Result<boolean>>;
}

export interface CapabilityService {
  has(capability: CapabilityKey): Promise<Result<boolean>>;
}

/** Façade liée à une organisation et fournie par le Core au module. */
export interface CoreSdk {
  readonly context: OrganizationContext;
  readonly identity: IdentityService;
  readonly permissions: PermissionService;
  readonly capabilities: CapabilityService;
}
