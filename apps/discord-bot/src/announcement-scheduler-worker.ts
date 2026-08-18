import { randomUUID } from 'node:crypto';
import type { Client } from 'discord.js';
import { EmbedPublicationError, publishEmbed } from './embed-publication.js';
import type { PrismaEmbedRepository } from './persistence/embed-repository.js';
import type { PrismaAnnouncementScheduleRepository } from './persistence/announcement-schedule-repository.js';

export class AnnouncementSchedulerWorker {
  private running = false;
  constructor(private readonly client: Client, private readonly schedules: PrismaAnnouncementScheduleRepository, private readonly embeds: PrismaEmbedRepository, private readonly graceMinutes: number, private readonly concurrency: number, private readonly warn: (event: string, fields: Record<string, unknown>) => void) {}
  async scan(): Promise<{ claimed: number; published: number; failed: number; missed: number; recovered: number }> {
    if (this.running) return { claimed: 0, published: 0, failed: 0, missed: 0, recovered: 0 };
    this.running = true; const workerToken = randomUUID(); let published = 0; let failed = 0;
    try {
      const [missed, recovered] = await Promise.all([this.schedules.markMissed(this.graceMinutes), this.schedules.recoverExpiredLeases()]);
      const claimed = await this.schedules.claimDue(workerToken, this.graceMinutes, Math.max(this.concurrency * 3, this.concurrency));
      for (let index = 0; index < claimed.length; index += this.concurrency) {
        const result = await Promise.all(claimed.slice(index, index + this.concurrency).map(async ({ schedule, run }) => {
          try {
            const draft = schedule.payloadMode === 'LIVE_DRAFT'
              ? await this.embeds.get(schedule.draftId ?? '', schedule.guildId)
              : await this.embeds.getForPublication(schedule.draftId ?? '', schedule.guildId);
            if (!draft) return await this.schedules.fail(run, schedule, workerToken, 'DRAFT_MISSING', 'The source draft is unavailable.', true);
            const payload = schedule.payloadMode === 'SNAPSHOT' ? schedule.payloadSnapshot : draft.payload;
            const buttons = schedule.payloadMode === 'SNAPSHOT' ? schedule.linkButtonsSnapshot : draft.buttons;
            if (!payload || !buttons) return await this.schedules.fail(run, schedule, workerToken, 'PAYLOAD_INVALID', 'The stored announcement payload is unavailable.', true);
            const result = await publishEmbed({ client: this.client, guildId: schedule.guildId, draft, actorId: `system:scheduler:${workerToken}`, channelId: schedule.targetChannelId, payload, buttons, repository: this.embeds });
            await this.schedules.complete(run, schedule, workerToken, result.publication); published += 1;
          } catch (error) {
            const code = error instanceof EmbedPublicationError ? error.code : 'DISCORD_ERROR';
            const blocked = code === 'CHANNEL_MISSING' || code === 'PERMISSION_DENIED' || code === 'PAYLOAD_INVALID';
            await this.schedules.fail(run, schedule, workerToken, code, error instanceof Error ? error.message : 'Announcement execution failed.', blocked); failed += 1;
            this.warn('announcement_scheduler.execution_failed', { scheduleId: schedule.id, runId: run.id, code });
          }
        })); void result;
      }
      return { claimed: claimed.length, published, failed, missed, recovered };
    } finally { this.running = false; }
  }
}
