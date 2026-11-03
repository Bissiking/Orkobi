import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { JobSummary } from '@orkobi/contracts';

export const jobColumns = `id, organization_id AS "organizationId", module_id AS "moduleId", task,
  created_by AS "createdBy",status,attempts,run_at::text AS "runAt",interval_seconds AS "intervalSeconds",last_error AS "lastError"`;
export interface ClaimedJob extends JobSummary {
  readonly cycleId: string;
}
export type JobOutcome = 'succeeded' | 'failed' | 'timeout' | 'suspended' | 'cancelled';
export interface JobLease {
  readonly job: ClaimedJob;
  readonly lost: AbortSignal;
  finish(outcome: JobOutcome, maxAttempts: number, durationMs: number): Promise<void>;
  release(): Promise<void>;
}

/** Connexion dédiée : le verrou de session reste détenu hors transaction SQL.
 * Un crash libère le verrou ; aucun lease temporel ne permet de doubler un handler lent.
 */
export class JobRepository {
  constructor(private readonly pool: Pool) {}
  async claim(): Promise<JobLease | undefined> {
    const client = await this.pool.connect();
    let lock: string | undefined;
    try {
      const candidates = await client.query<ClaimedJob>(`SELECT ${jobColumns},cycle_id AS "cycleId"
        FROM orkobi_core.jobs WHERE status IN ('pending','running') AND run_at<=now()
        ORDER BY run_at,id LIMIT 50`);
      for (const candidate of candidates.rows) {
        const key = `${candidate.organizationId}/${candidate.moduleId}/${candidate.task}`;
        const acquired = await client.query<{ locked: boolean }>(
          'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
          [key],
        );
        if (!acquired.rows[0]?.locked) continue;
        lock = key;
        await client.query('BEGIN');
        const updated = await client.query<ClaimedJob>(
          `UPDATE orkobi_core.jobs SET status='running',attempts=attempts+1,updated_at=now()
          WHERE id=$1 AND status IN ('pending','running') AND run_at<=now()
          RETURNING ${jobColumns},cycle_id AS "cycleId"`,
          [candidate.id],
        );
        const job = updated.rows[0];
        if (!job) {
          await client.query('ROLLBACK');
          await unlock(client, key);
          lock = undefined;
          continue;
        }
        // Les runs sans fin appartiennent à un processus ayant perdu sa connexion/verrou.
        await client.query(
          "UPDATE orkobi_core.job_runs SET finished_at=now(),outcome='interrupted' WHERE job_id=$1 AND finished_at IS NULL",
          [job.id],
        );
        const runId = randomUUID();
        await client.query(
          'INSERT INTO orkobi_core.job_runs(id,job_id,attempt) VALUES ($1,$2,$3)',
          [runId, job.id, job.attempts],
        );
        await audit(client, job, 'job.started');
        await client.query('COMMIT');
        const disconnected = new AbortController();
        const onError = () => disconnected.abort();
        client.on('error', onError);
        let released = false;
        return {
          job,
          lost: disconnected.signal,
          finish: async (outcome, maxAttempts, durationMs) => {
            await client.query('BEGIN');
            try {
              const current = await client.query<{ status: string }>(
                'SELECT status FROM orkobi_core.jobs WHERE id=$1 FOR UPDATE',
                [job.id],
              );
              const status = current.rows[0]?.status;
              const result = status === 'cancelled' || status === 'suspended' ? status : outcome;
              const retry =
                (result === 'failed' || result === 'timeout') && job.attempts < maxAttempts;
              const recurring = result === 'succeeded' && job.intervalSeconds !== null;
              await client.query(
                `UPDATE orkobi_core.jobs SET status=$2,last_error=$3,updated_at=now(),
                run_at=CASE WHEN $4::boolean THEN now()+($5::integer * interval '1 second') WHEN $6::boolean THEN now()+($7::integer * interval '1 second') ELSE run_at END,
                attempts=CASE WHEN $4::boolean THEN 0 ELSE attempts END,
                cycle_id=CASE WHEN $4::boolean THEN $8::uuid ELSE cycle_id END WHERE id=$1`,
                [
                  job.id,
                  recurring || retry ? 'pending' : result,
                  result === 'succeeded' ? null : result,
                  recurring,
                  job.intervalSeconds,
                  retry,
                  Math.min(300, 2 ** Math.min(job.attempts, 8)),
                  randomUUID(),
                ],
              );
              await client.query(
                'UPDATE orkobi_core.job_runs SET finished_at=now(),outcome=$2,duration_ms=$3 WHERE id=$1',
                [runId, result, Math.min(2147483647, Math.round(durationMs))],
              );
              await audit(client, job, `job.${result}`);
              await client.query('COMMIT');
            } catch (error) {
              await client.query('ROLLBACK');
              throw error;
            }
          },
          release: async () => {
            if (released) return;
            released = true;
            try {
              await unlock(client, key);
              client.release();
            } catch {
              client.release(true);
            } finally {
              client.off('error', onError);
            }
          },
        };
      }
      client.release();
      return undefined;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
        if (lock) await unlock(client, lock);
      } finally {
        client.release(true);
      }
      throw error;
    }
  }
}
async function unlock(client: PoolClient, key: string) {
  await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]);
}
async function audit(client: PoolClient, job: ClaimedJob, event: string) {
  await client.query(
    'INSERT INTO orkobi_core.audit_events(id,actor_id,event,organization_id,target_id) VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), job.createdBy, event, job.organizationId, job.id],
  );
}
