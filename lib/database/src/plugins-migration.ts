/** Stockage des tables logiques d'extensions, sans DDL ni identifiants SQL fournis par un plugin. */
export const pluginsMigration = {
  id: '0009_plugins',
  sql: `ALTER TABLE orkobi_core.roles DROP CONSTRAINT roles_permissions_check;
CREATE FUNCTION orkobi_core.valid_permission_keys(keys text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT cardinality(keys)<=200 AND array_position(keys,NULL) IS NULL
 AND coalesce(bool_and(value ~ '^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*:[a-z][a-z0-9_]*$'),true) FROM unnest(keys) AS value $$;
ALTER TABLE orkobi_core.roles ADD CONSTRAINT roles_permissions_check CHECK(orkobi_core.valid_permission_keys(permissions));
CREATE TABLE orkobi_core.plugins (
 id text PRIMARY KEY REFERENCES orkobi_core.modules(id),
 artifact jsonb NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 installed boolean NOT NULL DEFAULT true,
 installed_by uuid NOT NULL REFERENCES orkobi_core.users(id),
 installed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orkobi_core.plugin_records (
 id uuid PRIMARY KEY,
 plugin_id text NOT NULL REFERENCES orkobi_core.plugins(id),
 entity text NOT NULL,
 organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),
 values jsonb NOT NULL CHECK(jsonb_typeof(values)='object'),
 created_by uuid NOT NULL REFERENCES orkobi_core.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plugin_records_scope_idx ON orkobi_core.plugin_records(plugin_id,organization_id,entity,created_at DESC);
GRANT SELECT, INSERT, UPDATE ON orkobi_core.plugins TO orkobi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON orkobi_core.plugin_records TO orkobi_app;`,
} as const;
