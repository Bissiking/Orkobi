// lib/security/src/index.ts
import type { OrganizationContext, OrganizationId, PermissionKey, RoleId } from '@orkobi/contracts';
import type { Membership } from '@orkobi/identity';

export interface Role {
  readonly id: RoleId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly permissions: readonly PermissionKey[];
}

export interface AuthorizationRequest {
  readonly context: OrganizationContext;
  readonly permission: PermissionKey;
}

export type AuthorizationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'no_active_membership' | 'permission_denied' };

export interface AuthorizationService {
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}

/** Évalue uniquement des appartenances et rôles de confiance chargés par le Core. */
export function evaluateAuthorization(
  request: AuthorizationRequest,
  memberships: readonly Membership[],
  roles: readonly Role[],
): AuthorizationDecision {
  const activeMemberships = memberships.filter(
    (membership) =>
      membership.userId === request.context.userId &&
      membership.organizationId === request.context.organizationId &&
      membership.status === 'active',
  );

  if (activeMemberships.length === 0) {
    return { allowed: false, reason: 'no_active_membership' };
  }

  const allowed = roles.some(
    (role) =>
      role.organizationId === request.context.organizationId &&
      activeMemberships.some((membership) => membership.roleIds.includes(role.id)) &&
      role.permissions.includes(request.permission),
  );

  return allowed ? { allowed: true } : { allowed: false, reason: 'permission_denied' };
}
