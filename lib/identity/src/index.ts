// lib/identity/src/index.ts
import type { MembershipId, OrganizationId, RoleId, UserId } from '@orkobi/contracts';

export interface User {
  readonly id: UserId;
  readonly displayName: string;
  readonly status: 'active' | 'disabled';
}

export interface Organization {
  readonly id: OrganizationId;
  readonly name: string;
  readonly status: 'active' | 'disabled';
}

export interface Membership {
  readonly id: MembershipId;
  readonly userId: UserId;
  readonly organizationId: OrganizationId;
  readonly status: 'active' | 'suspended';
  readonly roleIds: readonly RoleId[];
}

/** La paire issuer/subject identifie une identité chez un fournisseur OIDC. */
export interface ExternalOidcIdentity {
  readonly userId: UserId;
  readonly issuer: string;
  readonly subject: string;
}
