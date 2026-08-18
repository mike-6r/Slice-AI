import { describe, expect, it, vi } from 'vitest';
import { runCommunityJob } from '../../src/community-scheduler.js';

describe('community scheduler isolation', () => {
  it('reports a failed job and allows later community jobs to run', async () => {
    const report = vi.fn(); const laterJob = vi.fn(async () => 'completed');
    await expect(runCommunityJob('birthday_announcement', async () => { throw new Error('Discord unavailable'); }, report)).resolves.toBeUndefined();
    await expect(runCommunityJob('daily_conversation', laterJob, report)).resolves.toBe('completed');
    expect(report).toHaveBeenCalledWith('community.scheduler_job_failed', { job: 'birthday_announcement', name: 'Error' });
    expect(laterJob).toHaveBeenCalledOnce();
  });
});
