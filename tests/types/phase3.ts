import type {
  IntegrationScope,
  IntegrationTokenSummary,
  LinkedIdentity,
  MfaStatus,
  OidcStatus,
  SessionSummary,
} from '@orkobi/contracts';
const scope: IntegrationScope = 'modules:read';
// @ts-expect-error Le catalogue de scopes n'accepte pas les jokers.
const denied: IntegrationScope = '*';
const mfa: MfaStatus = { enabled: true, pending: false, recoveryCodesRemaining: 10 };
const oidc: OidcStatus = { enabled: false, label: null };
const identity: LinkedIdentity = {
  issuer: 'https://issuer.example',
  subject: 'user',
  createdAt: '2026-10-31T00:00:00Z',
};
const token: IntegrationTokenSummary = {
  id: 'token',
  name: 'API',
  organizationId: null,
  organizationName: null,
  scopes: [scope],
  createdAt: '',
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
};
const session: SessionSummary = {
  id: 'session',
  createdAt: '',
  expiresAt: '',
  lastSeenAt: '',
  userAgent: null,
  current: true,
};
void [denied, mfa, oidc, identity, token, session];
