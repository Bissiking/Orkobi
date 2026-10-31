/** Contrats HTTP de la plateforme ; aucune donnée secrète n'est exposée ici. */
export const organizationPermissions = [
  'organization:read',
  'organization:write',
  'members:read',
  'members:write',
  'roles:write',
  'audit:read',
  'modules:read',
  'modules:write',
] as const;
export type OrganizationPermission = (typeof organizationPermissions)[number];

/** Catalogue officiel des permissions portées par les modules officiels. */
export const modulePermissions = ['demo:read', 'demo:write'] as const;
export type ModulePermission = (typeof modulePermissions)[number];

/** Rôle administrateur prédéfini : permissions plateforme et permissions des modules officiels. */
export const builtinAdminPermissions: readonly string[] = [
  ...organizationPermissions,
  ...modulePermissions,
];
export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  active: boolean;
  platformAdmin: boolean;
}
export interface PlatformOrganization {
  id: string;
  name: string;
  kind: 'business' | 'association';
  active: boolean;
  locale: 'fr' | 'en';
  timezone: string;
}
export interface OrganizationRole {
  id: string;
  organizationId: string;
  name: string;
  /** Inclut les permissions plateforme et, lorsque le module est accordé, les permissions de module. */
  permissions: string[];
  builtin: 'admin' | 'member' | null;
}
export interface OrganizationMembership {
  userId: string;
  name: string;
  email: string;
  active: boolean;
  roleId: string;
}
export interface AccessibleOrganization extends PlatformOrganization {
  permissions: string[];
}
export interface PlatformSession {
  user: PlatformUser | null;
  csrfToken: string | null;
  activeOrganizationId: string | null;
  organizations: AccessibleOrganization[];
}
export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  organizationId: string | null;
  event: string;
  targetId: string | null;
  targetName: string | null;
  createdAt: string;
}
export interface SessionSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}
export interface InstallationStatus {
  initialized: boolean;
  databaseReady: boolean;
  modulesReady: boolean;
}
