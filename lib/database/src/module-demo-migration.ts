/** Tables du module officiel orkobi.demo ; la propriété appartient à ce module. */
export const moduleDemoMigration = {
  id: '0004_module_demo',
  module: 'orkobi.demo',
  sql: `ALTER TABLE orkobi_core.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE orkobi_core.roles ADD CONSTRAINT roles_permissions_check CHECK (permissions <@ ARRAY['organization:read','organization:write','members:read','members:write','roles:write','audit:read','modules:read','modules:write','demo:read','demo:write']::text[]);
UPDATE orkobi_core.roles SET permissions = permissions || ARRAY['demo:read','demo:write']
  WHERE builtin = 'admin' AND NOT permissions @> ARRAY['demo:read','demo:write'];
CREATE SCHEMA orkobi_demo;
CREATE TABLE orkobi_demo.notes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_by uuid REFERENCES orkobi_core.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_organization_idx ON orkobi_demo.notes(organization_id, created_at DESC);
GRANT USAGE ON SCHEMA orkobi_demo TO orkobi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON orkobi_demo.notes TO orkobi_app;`,
} as const;
