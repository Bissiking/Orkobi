/** Ajout uniquement : ne jamais modifier 0005 ni une migration appliquée. */
export const identityAdvancedMigration = {
  id: '0005_identity_advanced',
  sql: `
CREATE TABLE orkobi_core.mfa_factors (
  user_id uuid PRIMARY KEY REFERENCES orkobi_core.users(id),
  secret text NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orkobi_core.mfa_recovery_codes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES orkobi_core.users(id),
  code_hash text NOT NULL UNIQUE,
  used_at timestamptz
);
CREATE INDEX mfa_recovery_user_idx ON orkobi_core.mfa_recovery_codes(user_id);
CREATE TABLE orkobi_core.mfa_challenges (
  challenge_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES orkobi_core.users(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE orkobi_core.oidc_pending (
  state_hash text PRIMARY KEY,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  link_user_id uuid REFERENCES orkobi_core.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE orkobi_core.sessions ADD COLUMN user_agent text;
ALTER TABLE orkobi_core.oidc_identities ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
GRANT SELECT, INSERT, UPDATE ON orkobi_core.mfa_factors, orkobi_core.mfa_recovery_codes,
  orkobi_core.mfa_challenges, orkobi_core.oidc_pending, orkobi_core.oidc_identities TO orkobi_app;
GRANT DELETE ON orkobi_core.mfa_recovery_codes, orkobi_core.mfa_challenges,
  orkobi_core.oidc_identities TO orkobi_app;
`,
} as const;
