/** Ajout uniquement : checkpoints anti-rejeu et provenance courante des plugins. */
export const storeMigration = {
  id: '0010_store',
  sql: `
CREATE TABLE orkobi_core.store_checkpoints (
 repository_id text PRIMARY KEY, catalog_sequence bigint NOT NULL CHECK(catalog_sequence>0), digest text NOT NULL,
 key_id text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orkobi_core.plugin_origins (
 plugin_id text PRIMARY KEY REFERENCES orkobi_core.plugins(id), repository_id text NOT NULL,
 key_id text NOT NULL, catalog_sequence bigint NOT NULL, digest text NOT NULL,
 verified boolean NOT NULL DEFAULT true
);
GRANT SELECT,INSERT,UPDATE ON orkobi_core.store_checkpoints,orkobi_core.plugin_origins TO orkobi_app;
`,
} as const;
