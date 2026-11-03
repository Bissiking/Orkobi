/** Stockage des modules officiels ; aucun DDL ni SQL du module consommateur. */
export const businessMigration = {
  id: '0011_business',
  sql: `
CREATE SCHEMA orkobi_business;
CREATE TABLE orkobi_business.records (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),
 module_id text NOT NULL REFERENCES orkobi_core.modules(id),entity text NOT NULL,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),state text NOT NULL,
 reference_key text,amount_minor bigint NOT NULL DEFAULT 0,parent_id uuid,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_by uuid NOT NULL REFERENCES orkobi_core.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),UNIQUE(organization_id,module_id,entity,reference_key),
 FOREIGN KEY(organization_id,parent_id) REFERENCES orkobi_business.records(organization_id,id)
);
CREATE INDEX business_records_scope ON orkobi_business.records(organization_id,module_id,entity,id);
CREATE INDEX business_records_parent ON orkobi_business.records(organization_id,parent_id,state);
CREATE TABLE orkobi_business.counters (
 organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),series text NOT NULL,
 counter integer NOT NULL CHECK(counter>0),PRIMARY KEY(organization_id,series)
);
CREATE TABLE orkobi_business.operations (
 organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),user_id uuid NOT NULL REFERENCES orkobi_core.users(id),
 operation_key uuid NOT NULL,request_hash text NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(organization_id,user_id,operation_key)
);
CREATE TABLE orkobi_business.attachments (
 record_id uuid PRIMARY KEY,organization_id uuid NOT NULL,content_base64 text NOT NULL,
 sha256 text NOT NULL,size integer NOT NULL CHECK(size BETWEEN 1 AND 49152),media_type text NOT NULL,
 FOREIGN KEY(organization_id,record_id) REFERENCES orkobi_business.records(organization_id,id)
);
GRANT USAGE ON SCHEMA orkobi_business TO orkobi_app;
GRANT SELECT,INSERT,UPDATE ON orkobi_business.records,orkobi_business.counters TO orkobi_app;
GRANT SELECT,INSERT ON orkobi_business.operations,orkobi_business.attachments TO orkobi_app;
`,
} as const;
