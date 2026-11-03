/** File durable ; PostgreSQL reste l'autorité même lorsqu'un cache Redis est configuré. */
export const jobsMigration = {
  id: '0008_jobs',
  sql: `CREATE TABLE orkobi_core.jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES orkobi_core.organizations(id),
  module_id text NOT NULL REFERENCES orkobi_core.modules(id),
  task text NOT NULL,
  created_by uuid NOT NULL REFERENCES orkobi_core.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','suspended','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  run_at timestamptz NOT NULL,
  interval_seconds integer CHECK (interval_seconds BETWEEN 60 AND 31536000),
  last_error text,
  cycle_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_due_idx ON orkobi_core.jobs(run_at) WHERE status IN ('pending','running');
CREATE INDEX jobs_org_idx ON orkobi_core.jobs(organization_id,created_at DESC);
CREATE TABLE orkobi_core.job_runs (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES orkobi_core.jobs(id),
  attempt integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('succeeded','failed','timeout','interrupted','suspended','cancelled')),
  duration_ms integer
);
CREATE INDEX job_runs_job_idx ON orkobi_core.job_runs(job_id,started_at DESC);
GRANT SELECT, INSERT, UPDATE ON orkobi_core.jobs, orkobi_core.job_runs TO orkobi_app;`,
} as const;
