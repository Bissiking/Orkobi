export interface JobConfig {
  readonly enabled: boolean;
  readonly pollMs: number;
}
export const JOB_CONFIG = Symbol('JOB_CONFIG');
export const defaultJobConfig: JobConfig = Object.freeze({ enabled: true, pollMs: 1000 });
export function loadJobConfig(env: NodeJS.ProcessEnv): JobConfig {
  const enabled = env.JOBS_ENABLED ?? 'true',
    poll = env.JOBS_POLL_MS ?? '1000';
  if (
    !['true', 'false'].includes(enabled) ||
    !/^\d+$/u.test(poll) ||
    Number(poll) < 100 ||
    Number(poll) > 60000
  )
    throw new Error('JOBS_ENABLED ou JOBS_POLL_MS invalide.');
  return Object.freeze({ enabled: enabled === 'true', pollMs: Number(poll) });
}

export const PLUGIN_JOBS = Symbol('PLUGIN_JOBS');
