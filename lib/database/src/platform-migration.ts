/** Ajout uniquement : ne jamais modifier 0001 ni une migration appliquée. */
export const platformMigration = {
  id: '0002_platform',
  sql: `
CREATE TABLE orkobi_core.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orkobi_core.installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  administrator_id uuid NOT NULL REFERENCES orkobi_core.users(id),
  initialized_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orkobi_core.organizations (
  id uuid PRIMARY KEY, name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('business', 'association')),
  active boolean NOT NULL DEFAULT true,
  locale text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en')),
  timezone text NOT NULL DEFAULT 'Europe/Paris'
);
CREATE TABLE orkobi_core.roles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),
  name text NOT NULL,
  permissions text[] NOT NULL CHECK (permissions <@ ARRAY['organization:read','organization:write','members:read','members:write','roles:write','audit:read']::text[]),
  builtin text CHECK (builtin IN ('admin', 'member')),
  UNIQUE (organization_id, id), UNIQUE (organization_id, name), UNIQUE (organization_id, builtin)
);
CREATE TABLE orkobi_core.memberships (
  organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),
  user_id uuid NOT NULL REFERENCES orkobi_core.users(id),
  role_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id, role_id) REFERENCES orkobi_core.roles(organization_id, id)
);
CREATE TABLE orkobi_core.sessions (
  token_hash text PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES orkobi_core.users(id),
  csrf_token text NOT NULL,
  active_organization_id uuid REFERENCES orkobi_core.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);
CREATE INDEX sessions_user_idx ON orkobi_core.sessions(user_id);
CREATE TABLE orkobi_core.oidc_identities (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES orkobi_core.users(id),
  issuer text NOT NULL, subject text NOT NULL, UNIQUE (issuer, subject)
);
CREATE TABLE orkobi_core.authentication_attempts (
  key_hash text PRIMARY KEY, attempts integer NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orkobi_core.audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES orkobi_core.users(id),
  organization_id uuid REFERENCES orkobi_core.organizations(id),
  event text NOT NULL, target_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_org_idx ON orkobi_core.audit_events(organization_id, created_at DESC);
GRANT USAGE ON SCHEMA orkobi_core TO orkobi_app;
GRANT SELECT, INSERT, UPDATE ON orkobi_core.users, orkobi_core.installation,
  orkobi_core.organizations, orkobi_core.roles, orkobi_core.memberships,
  orkobi_core.sessions, orkobi_core.authentication_attempts TO orkobi_app;
GRANT SELECT, INSERT ON orkobi_core.audit_events TO orkobi_app;
`,
} as const;
