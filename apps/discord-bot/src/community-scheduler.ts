export type CommunitySchedulerReporter = (event: string, fields: Record<string, unknown>) => void;

/** Keeps one best-effort Discord community delivery from starving later scheduled work. */
export async function runCommunityJob<T>(job: string, action: () => Promise<T>, report: CommunitySchedulerReporter): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    report('community.scheduler_job_failed', { job, name: error instanceof Error ? error.name : 'unknown' });
    return undefined;
  }
}
