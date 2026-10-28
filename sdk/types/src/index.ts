// sdk/types/src/index.ts
import type { CapabilityKey, ModuleId, OrganizationId, PermissionKey, UserId } from '@orkobi/contracts';

// Liste publique explicite ; aucun export global des bibliothèques internes.
export type {
  CapabilityKey, CoreError, ErrorCode, ModuleId, OrganizationContext,
  OrganizationId, PermissionKey, Result, UserId,
} from '@orkobi/contracts';

export interface UserSummary {
  readonly id: UserId;
  readonly displayName: string;
}

export interface OrganizationSummary {
  readonly id: OrganizationId;
  readonly name: string;
}

export interface CapabilityRequirement {
  readonly key: CapabilityKey;
  readonly required: boolean;
}

export interface PermissionDeclaration {
  readonly key: PermissionKey;
  readonly description: string;
}

/** Déclaration descriptive ; ne charge pas de module et n'accorde aucun droit. */
export interface ModuleRequirements {
  readonly moduleId: ModuleId;
  readonly capabilities: readonly CapabilityRequirement[];
  readonly permissions: readonly PermissionDeclaration[];
}
