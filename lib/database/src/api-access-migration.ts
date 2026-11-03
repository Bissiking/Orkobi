/** Ajout uniquement : ne jamais modifier 0006 ni une migration appliquée. */
export const apiAccessMigration = {
  id: '0006_api_access',
  sql: `
CREATE TABLE orkobi_core.integration_tokens (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  organization_id uuid REFERENCES orkobi_core.organizations(id),
  scopes text[] NOT NULL CHECK (cardinality(scopes) > 0 AND scopes <@ ARRAY['organizations:read','modules:read','audit:read']::text[]),
  created_by uuid NOT NULL REFERENCES orkobi_core.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX integration_tokens_org_idx ON orkobi_core.integration_tokens(organization_id);
CREATE TABLE orkobi_core.platform_settings (
  key text PRIMARY KEY CHECK (key = 'integrations_enabled'),
  value boolean NOT NULL
);
INSERT INTO orkobi_core.platform_settings (key, value) VALUES ('integrations_enabled', false);
ALTER TABLE orkobi_core.organizations ADD COLUMN integrations_enabled boolean NOT NULL DEFAULT true;
GRANT SELECT, INSERT, UPDATE ON orkobi_core.integration_tokens, orkobi_core.platform_settings TO orkobi_app;
`,
} as const;
