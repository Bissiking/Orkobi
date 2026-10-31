/** Complément append-only : protection contre le rejeu TOTP et suppression des facteurs. */
export const identityHardeningMigration = {
  id: '0007_identity_hardening',
  sql: `ALTER TABLE orkobi_core.mfa_factors ADD COLUMN last_used_step bigint;
GRANT DELETE ON orkobi_core.mfa_factors, orkobi_core.oidc_pending TO orkobi_app;`,
} as const;
