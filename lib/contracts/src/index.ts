// lib/contracts/src/index.ts

declare const identifierBrand: unique symbol;

export type IdKind = 'user' | 'organization' | 'membership' | 'role' | 'module' | 'event';
export type Id<Kind extends IdKind> = string & { readonly [identifierBrand]: Kind };
export type UserId = Id<'user'>;
export type OrganizationId = Id<'organization'>;
export type MembershipId = Id<'membership'>;
export type RoleId = Id<'role'>;
export type ModuleId = Id<'module'>;
export type EventId = Id<'event'>;

/** Marque un identifiant existant ; sa génération et son unicité relèvent du Core. */
export function createId<Kind extends IdKind>(value: string): Id<Kind> {
  if (value.length === 0 || value.trim() !== value) {
    throw new TypeError('Un identifiant doit être non vide et sans espaces périphériques.');
  }
  return value as Id<Kind>;
}

export type PermissionKey = `${string}:${string}`;
export type CapabilityKey = `${string}.${string}`;

/** Contexte établi par le Core après vérification de l'identité et de l'appartenance. */
export interface OrganizationContext {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly correlationId?: string;
}

export type ErrorCode = 'invalid_argument' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable';

export interface CoreError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly correlationId?: string;
}

export type Result<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: CoreError };
