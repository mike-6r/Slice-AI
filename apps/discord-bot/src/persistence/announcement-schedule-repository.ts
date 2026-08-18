import { Prisma, PrismaClient } from '../../generated/prisma/index.js';
import type { EmbedPayload, LinkButton } from '../embed-builder.js';
import { nextOccurrence, type PayloadMode, type ScheduleTiming, type ScheduleType, type Weekday } from '../announcement-schedule.js';

export type AnnouncementSchedule = {
  id: string; guildId: string; draftId: string | null; createdByDiscordUserId: string; name: string;
  scheduleType: ScheduleType; timezone: string; localTime: string; date: string | null; weekdays: Weekday[]; dayOfMonth: number | null;
  payloadMode: PayloadMode; payloadSnapshot: EmbedPayload | null; linkButtonsSnapshot: LinkButton[] | null; targetChannelId: string;
  status: string; nextRunAt: Date | null; lastRunAt: Date | null; processingStartedAt: Date | null; leaseExpiresAt: Date | null; workerToken: string | null; version: number;
};
export type ScheduleRun = { id: string; scheduleId: string; scheduledFor: Date; status: string; publicationId: string | null; discordChannelId: string | null; discordMessageId: string | null; errorCode: string | null; errorSummary: string | null; attemptCount: number };
export type CreateSchedule = { guildId: string; draftId: string; actorId: string; name: string; timing: ScheduleTiming; payloadMode: PayloadMode; payloadSnapshot?: EmbedPayload; linkButtonsSnapshot?: LinkButton[]; targetChannelId: string };

export class PrismaAnnouncementScheduleRepository {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}
  async create(input: CreateSchedule): Promise<AnnouncementSchedule> {
    const nextRunAt = nextOccurrence(input.timing, new Date(this.now().getTime() - 1));
    if (!nextRunAt) throw new Error('Invalid schedule timing.');
    const row = await this.prisma.discordAnnouncementSchedule.create({ data: {
      guildId: input.guildId, draftId: input.draftId, createdByDiscordUserId: input.actorId, name: input.name,
      scheduleType: input.timing.type, timezone: input.timing.timezone, localTime: input.timing.localTime, localDate: input.timing.date,
      weekdays: input.timing.weekdays ? input.timing.weekdays as Prisma.InputJsonValue : undefined,
      dayOfMonth: input.timing.dayOfMonth, payloadMode: input.payloadMode,
      payloadSnapshot: input.payloadSnapshot as Prisma.InputJsonValue | undefined, linkButtonsSnapshot: input.linkButtonsSnapshot as Prisma.InputJsonValue | undefined,
      targetChannelId: input.targetChannelId, nextRunAt,
      auditEvents: { create: { actorDiscordUserId: input.actorId, action: 'SCHEDULE_CREATED', details: { payloadMode: input.payloadMode, nextRunAt: nextRunAt.toISOString() } } },
    } });
    return map(row);
  }
  async guildTimezone(guildId: string): Promise<string | null> { const row = await this.prisma.discordGuildConfig.findUnique({ where: { guildId }, select: { settings: true } }); const settings = row?.settings as { announcementSchedulerTimezone?: unknown } | null; return typeof settings?.announcementSchedulerTimezone === 'string' ? settings.announcementSchedulerTimezone : null; }
  async setGuildTimezone(guildId: string, timezone: string): Promise<void> { const row = await this.prisma.discordGuildConfig.findUnique({ where: { guildId }, select: { settings: true } }); const settings = { ...((row?.settings as Record<string, unknown> | null) ?? {}), announcementSchedulerTimezone: timezone }; await this.prisma.discordGuildConfig.upsert({ where: { guildId }, create: { guildId, settings: settings as Prisma.InputJsonValue }, update: { settings: settings as Prisma.InputJsonValue } }); }
  async get(id: string, guildId: string): Promise<AnnouncementSchedule | null> { const row = await this.prisma.discordAnnouncementSchedule.findFirst({ where: { id, guildId } }); return row ? map(row) : null; }
  async list(guildId: string, status?: string): Promise<AnnouncementSchedule[]> { return (await this.prisma.discordAnnouncementSchedule.findMany({ where: { guildId, ...(status && status !== 'ALL' ? { status: status as never } : {}) }, orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'desc' }], take: 50 })).map(map); }
  async update(id: string, guildId: string, actorId: string, version: number, input: Partial<Pick<CreateSchedule, 'name' | 'payloadMode' | 'targetChannelId'>> & { timing?: ScheduleTiming; payloadSnapshot?: EmbedPayload; linkButtonsSnapshot?: LinkButton[] }): Promise<AnnouncementSchedule | null> {
    const current = await this.get(id, guildId); if (!current || !['SCHEDULED', 'PAUSED', 'FAILED', 'BLOCKED'].includes(current.status)) return null;
    const timing = input.timing ?? timingOf(current); const nextRunAt = current.status === 'PAUSED' ? null : nextOccurrence(timing, this.now());
    const result = await this.prisma.discordAnnouncementSchedule.updateMany({ where: { id, guildId, version, status: { in: ['SCHEDULED', 'PAUSED', 'FAILED', 'BLOCKED'] } }, data: {
      ...(input.name ? { name: input.name } : {}), ...(input.targetChannelId ? { targetChannelId: input.targetChannelId } : {}),
      ...(input.payloadMode ? { payloadMode: input.payloadMode } : {}), ...(input.payloadSnapshot ? { payloadSnapshot: input.payloadSnapshot as Prisma.InputJsonValue } : {}), ...(input.linkButtonsSnapshot ? { linkButtonsSnapshot: input.linkButtonsSnapshot as Prisma.InputJsonValue } : {}),
      ...(input.timing ? { scheduleType: timing.type, timezone: timing.timezone, localTime: timing.localTime, localDate: timing.date, weekdays: timing.weekdays as Prisma.InputJsonValue | undefined, dayOfMonth: timing.dayOfMonth, nextRunAt } : {}), version: { increment: 1 },
    } });
    if (!result.count) return null;
    await this.audit(id, actorId, 'SCHEDULE_UPDATED'); return this.get(id, guildId);
  }
  async pause(id: string, guildId: string, actorId: string, version: number): Promise<AnnouncementSchedule | null> { const result = await this.prisma.discordAnnouncementSchedule.updateMany({ where: { id, guildId, version, status: { in: ['SCHEDULED', 'FAILED', 'BLOCKED'] } }, data: { status: 'PAUSED', pausedAt: this.now(), nextRunAt: null, version: { increment: 1 } } }); if (!result.count) return null; await this.audit(id, actorId, 'SCHEDULE_PAUSED'); return this.get(id, guildId); }
  async resume(id: string, guildId: string, actorId: string, version: number): Promise<AnnouncementSchedule | null> { const row = await this.get(id, guildId); if (!row) return null; const nextRunAt = nextOccurrence(timingOf(row), this.now()); if (!nextRunAt) return null; const result = await this.prisma.discordAnnouncementSchedule.updateMany({ where: { id, guildId, version, status: 'PAUSED' }, data: { status: 'SCHEDULED', pausedAt: null, nextRunAt, version: { increment: 1 } } }); if (!result.count) return null; await this.audit(id, actorId, 'SCHEDULE_RESUMED', { nextRunAt: nextRunAt.toISOString() }); return this.get(id, guildId); }
  async cancel(id: string, guildId: string, actorId: string, version: number): Promise<boolean> { const result = await this.prisma.discordAnnouncementSchedule.updateMany({ where: { id, guildId, version, status: { notIn: ['CANCELLED', 'COMPLETED', 'PROCESSING'] } }, data: { status: 'CANCELLED', cancelledAt: this.now(), nextRunAt: null, version: { increment: 1 } } }); if (!result.count) return false; await this.audit(id, actorId, 'SCHEDULE_CANCELLED'); return true; }
  async history(id: string, guildId: string): Promise<ScheduleRun[]> { return (await this.prisma.discordScheduledPublicationRun.findMany({ where: { scheduleId: id, schedule: { guildId } }, orderBy: { createdAt: 'desc' }, take: 20 })).map(runMap); }
  async claimDue(workerToken: string, graceMinutes: number, limit = 10): Promise<Array<{ schedule: AnnouncementSchedule; run: ScheduleRun }>> {
    const now = this.now(); const candidates = await this.prisma.discordAnnouncementSchedule.findMany({ where: { status: 'SCHEDULED', nextRunAt: { lte: now, gte: new Date(now.getTime() - graceMinutes * 60_000) } }, orderBy: { nextRunAt: 'asc' }, take: limit }); const claimed: Array<{ schedule: AnnouncementSchedule; run: ScheduleRun }> = [];
    for (const candidate of candidates) {
      const result = await this.prisma.discordAnnouncementSchedule.updateMany({ where: { id: candidate.id, status: 'SCHEDULED', nextRunAt: candidate.nextRunAt }, data: { status: 'PROCESSING', processingStartedAt: now, leaseExpiresAt: new Date(now.getTime() + 5 * 60_000), workerToken } });
      if (!result.count) continue;
      try { const run = await this.prisma.discordScheduledPublicationRun.create({ data: { scheduleId: candidate.id, scheduledFor: candidate.nextRunAt!, workerToken } }); await this.audit(candidate.id, `system:scheduler:${workerToken}`, 'SCHEDULE_EXECUTION_STARTED'); claimed.push({ schedule: map({ ...candidate, status: 'PROCESSING', processingStartedAt: now, leaseExpiresAt: new Date(now.getTime() + 5 * 60_000), workerToken }), run: runMap(run) }); }
      catch { await this.prisma.discordAnnouncementSchedule.updateMany({ where: { id: candidate.id, workerToken, status: 'PROCESSING' }, data: { status: 'BLOCKED', workerToken: null, leaseExpiresAt: null } }); }
    }
    return claimed;
  }
  async markMissed(graceMinutes: number): Promise<number> {
    const cutoff = new Date(this.now().getTime() - graceMinutes * 60_000);
    const rows = await this.prisma.discordAnnouncementSchedule.findMany({ where: { status: 'SCHEDULED', nextRunAt: { lt: cutoff } }, take: 100 });
    for (const row of rows) {
      const next = row.scheduleType === 'ONE_TIME' ? null : nextOccurrence(timingOf(map(row)), this.now());
      await this.prisma.$transaction([
        this.prisma.discordScheduledPublicationRun.upsert({ where: { scheduleId_scheduledFor: { scheduleId: row.id, scheduledFor: row.nextRunAt! } }, create: { scheduleId: row.id, scheduledFor: row.nextRunAt!, status: 'MISSED', finishedAt: this.now(), errorCode: 'MISSED_GRACE' }, update: {} }),
        this.prisma.discordAnnouncementSchedule.update({ where: { id: row.id }, data: { status: row.scheduleType === 'ONE_TIME' ? 'COMPLETED' : 'SCHEDULED', nextRunAt: next, lastRunAt: row.nextRunAt, version: { increment: 1 } } }),
      ]);
    }
    return rows.length;
  }
  async recoverExpiredLeases(): Promise<number> { const now = this.now(); const expired = await this.prisma.discordAnnouncementSchedule.findMany({ where: { status: 'PROCESSING', leaseExpiresAt: { lt: now } }, take: 50 }); for (const schedule of expired) await this.prisma.$transaction([this.prisma.discordScheduledPublicationRun.updateMany({ where: { scheduleId: schedule.id, status: 'PROCESSING' }, data: { status: 'UNKNOWN_DELIVERY_STATE', finishedAt: now, errorCode: 'LEASE_EXPIRED', errorSummary: 'Worker lease expired after a possible Discord delivery.' } }), this.prisma.discordAnnouncementSchedule.update({ where: { id: schedule.id }, data: { status: 'BLOCKED', workerToken: null, leaseExpiresAt: null } })]); return expired.length; }
  async complete(run: ScheduleRun, schedule: AnnouncementSchedule, workerToken: string, publication: { id: string; channelId: string; messageId: string }): Promise<void> {
    const now = this.now(); const next = schedule.scheduleType === 'ONE_TIME' ? null : nextOccurrence(timingOf(schedule), now);
    await this.prisma.$transaction([
      this.prisma.discordScheduledPublicationRun.update({ where: { id: run.id }, data: { status: 'PUBLISHED', finishedAt: now, publicationId: publication.id, discordChannelId: publication.channelId, discordMessageId: publication.messageId } }),
      this.prisma.discordAnnouncementSchedule.updateMany({ where: { id: schedule.id, status: 'PROCESSING', workerToken }, data: { status: schedule.scheduleType === 'ONE_TIME' ? 'COMPLETED' : 'SCHEDULED', lastRunAt: run.scheduledFor, nextRunAt: next, processingStartedAt: null, leaseExpiresAt: null, workerToken: null, version: { increment: 1 } } }),
    ]);
    await this.audit(schedule.id, `system:scheduler:${workerToken}`, 'SCHEDULE_PUBLISHED', { runId: run.id });
  }
  async fail(run: ScheduleRun, schedule: AnnouncementSchedule, workerToken: string, code: string, summary: string, blocked = false): Promise<void> { const now = this.now(); const uncertain = code === 'UNKNOWN_DELIVERY_STATE'; const shouldBlock = blocked || uncertain; await this.prisma.$transaction([this.prisma.discordScheduledPublicationRun.update({ where: { id: run.id }, data: { status: uncertain ? 'UNKNOWN_DELIVERY_STATE' : shouldBlock ? 'BLOCKED' : 'FAILED', finishedAt: now, errorCode: code, errorSummary: summary.slice(0, 500) } }), this.prisma.discordAnnouncementSchedule.updateMany({ where: { id: schedule.id, status: 'PROCESSING', workerToken }, data: { status: shouldBlock ? 'BLOCKED' : 'FAILED', processingStartedAt: null, leaseExpiresAt: null, workerToken: null } })]); await this.audit(schedule.id, `system:scheduler:${workerToken}`, shouldBlock ? 'SCHEDULE_BLOCKED' : 'SCHEDULE_FAILED', { code }); }
  async retry(id: string, guildId: string, actorId: string, version: number): Promise<AnnouncementSchedule | null> { const latest = await this.prisma.discordScheduledPublicationRun.findFirst({ where: { scheduleId: id, schedule: { guildId } }, orderBy: { createdAt: 'desc' } }); if (latest?.status === 'UNKNOWN_DELIVERY_STATE') return null; const result = await this.prisma.discordAnnouncementSchedule.updateMany({ where: { id, guildId, version, status: { in: ['FAILED', 'BLOCKED'] } }, data: { status: 'SCHEDULED', nextRunAt: this.now(), version: { increment: 1 } } }); if (!result.count) return null; await this.audit(id, actorId, 'SCHEDULE_RETRY_REQUESTED'); return this.get(id, guildId); }
  async runNow(id: string, guildId: string, actorId: string, version: number): Promise<AnnouncementSchedule | null> { const result = await this.prisma.discordAnnouncementSchedule.updateMany({ where: { id, guildId, version, status: { in: ['SCHEDULED', 'PAUSED'] } }, data: { status: 'SCHEDULED', nextRunAt: this.now(), version: { increment: 1 } } }); if (!result.count) return null; await this.audit(id, actorId, 'SCHEDULE_MANUAL_RUN'); return this.get(id, guildId); }
  private async audit(scheduleId: string, actorDiscordUserId: string, action: 'SCHEDULE_CREATED' | 'SCHEDULE_UPDATED' | 'SCHEDULE_PAUSED' | 'SCHEDULE_RESUMED' | 'SCHEDULE_CANCELLED' | 'SCHEDULE_EXECUTION_STARTED' | 'SCHEDULE_PUBLISHED' | 'SCHEDULE_FAILED' | 'SCHEDULE_BLOCKED' | 'SCHEDULE_RETRY_REQUESTED' | 'SCHEDULE_MANUAL_RUN', details?: Record<string, string>) { await this.prisma.discordAnnouncementScheduleAuditEvent.create({ data: { scheduleId, actorDiscordUserId, action, details: details as Prisma.InputJsonValue | undefined } }); }
}

function map(row: { id: string; guildId: string; draftId: string | null; createdByDiscordUserId: string; name: string; scheduleType: string; timezone: string; localTime: string; localDate: string | null; weekdays: unknown; dayOfMonth: number | null; payloadMode: string; payloadSnapshot: unknown; linkButtonsSnapshot: unknown; targetChannelId: string; status: string; nextRunAt: Date | null; lastRunAt: Date | null; processingStartedAt: Date | null; leaseExpiresAt: Date | null; workerToken: string | null; version: number }): AnnouncementSchedule { return { ...row, scheduleType: row.scheduleType as ScheduleType, payloadMode: row.payloadMode as PayloadMode, weekdays: Array.isArray(row.weekdays) ? row.weekdays as Weekday[] : [], payloadSnapshot: row.payloadSnapshot as EmbedPayload | null, linkButtonsSnapshot: row.linkButtonsSnapshot as LinkButton[] | null, date: row.localDate }; }
function runMap(row: { id: string; scheduleId: string; scheduledFor: Date; status: string; publicationId: string | null; discordChannelId: string | null; discordMessageId: string | null; errorCode: string | null; errorSummary: string | null; attemptCount: number }): ScheduleRun { return row; }
function timingOf(schedule: AnnouncementSchedule): ScheduleTiming { return { type: schedule.scheduleType, timezone: schedule.timezone, localTime: schedule.localTime, weekdays: schedule.weekdays, dayOfMonth: schedule.dayOfMonth ?? undefined, date: schedule.date ?? undefined }; }
