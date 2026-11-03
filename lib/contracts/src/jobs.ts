import type { PermissionKey } from './index.js';

/** Intervalles UTC ; aucun fuseau implicite ni expression cron. */
export interface ModuleTaskDeclaration {
  readonly key: string;
  readonly description: string;
  readonly permission: PermissionKey;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
}

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'suspended' | 'cancelled';
export interface JobSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly moduleId: string;
  readonly task: string;
  readonly createdBy: string;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly runAt: string;
  readonly intervalSeconds: number | null;
  readonly lastError: string | null;
}
export interface ScheduleJob {
  readonly moduleId: string;
  readonly task: string;
  readonly runAt?: string;
  readonly intervalSeconds?: number;
}
