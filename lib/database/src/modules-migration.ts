/** Registre des modules et activation par organisation ; aucune donnée de module n'est créée ici. */
export const modulesMigration = {
  id: '0003_modules',
  sql: `ALTER TABLE orkobi_core.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE orkobi_core.roles ADD CONSTRAINT roles_permissions_check CHECK (permissions <@ ARRAY['organization:read','organization:write','members:read','members:write','roles:write','audit:read','modules:read','modules:write']::text[]);
UPDATE orkobi_core.roles SET permissions = permissions || ARRAY['modules:read','modules:write']
  WHERE builtin = 'admin' AND NOT permissions @> ARRAY['modules:read','modules:write'];
UPDATE orkobi_core.roles SET permissions = permissions || ARRAY['modules:read']
  WHERE builtin = 'member' AND NOT permissions @> ARRAY['modules:read'];
CREATE TABLE orkobi_core.modules (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)+$'),
  version text NOT NULL,
  name text NOT NULL,
  manifest jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orkobi_core.organization_modules (
  organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),
  module_id text NOT NULL REFERENCES orkobi_core.modules(id),
  enabled boolean NOT NULL DEFAULT true,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, module_id)
);
CREATE INDEX organization_modules_active_idx ON orkobi_core.organization_modules(module_id) WHERE enabled;
GRANT SELECT, INSERT, UPDATE ON orkobi_core.modules, orkobi_core.organization_modules TO orkobi_app;`,
} as const;
