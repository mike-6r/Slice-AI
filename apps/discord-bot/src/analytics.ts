import { PrismaClient } from '../generated/prisma/index.js';

export type AnalyticsOutcome = 'SUCCESS' | 'USER_VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
export type AnalyticsPeriod = '24h' | '7d' | '30d';
export type AnalyticsHealth = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';

/** Daily aggregates contain no message text or command arguments. Keep them for
 * 13 months to support year-over-year operational comparisons.  Worker
 * heartbeats are operational telemetry, not historical analytics, and expire
 * after 90 days. */
export const ANALYTICS_DAILY_RETENTION_DAYS = 400;
export const ANALYTICS_HEARTBEAT_RETENTION_DAYS = 90;

export function analyticsDay(value = new Date()): Date { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }
export function analyticsPeriodStart(period: AnalyticsPeriod, now = new Date()): Date { return new Date(now.getTime() - (period === '24h' ? 1 : period === '7d' ? 7 : 30) * 86_400_000); }
export function analyticsRetentionStart(days: number, now = new Date()): Date { return analyticsDay(new Date(now.getTime() - days * 86_400_000)); }

/** Analytics writes are caller-isolated: callers always invoke through capture(). */
export class DiscordAnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}
  async capture(action: () => Promise<void>): Promise<void> { try { await action(); } catch { /* telemetry must never fail the originating Discord action */ } }
  async message(input: { guildId: string; channelId: string; actorId: string; support: boolean; at?: Date }): Promise<void> {
    const day = analyticsDay(input.at); await this.prisma.$transaction([
      this.prisma.discordAnalyticsDailyGuild.upsert({ where: { guildId_day: { guildId: input.guildId, day } }, create: { guildId: input.guildId, day, messages: input.support ? 0 : 1, supportMessages: input.support ? 1 : 0 }, update: input.support ? { supportMessages: { increment: 1 } } : { messages: { increment: 1 } } }),
      this.prisma.discordAnalyticsDailyMemberActivity.upsert({ where: { guildId_discordUserId_day: { guildId: input.guildId, discordUserId: input.actorId, day } }, create: { guildId: input.guildId, discordUserId: input.actorId, day, messaged: true }, update: { messaged: true } }),
      ...(input.support ? [] : [this.prisma.discordAnalyticsDailyChannel.upsert({ where: { guildId_channelId_day: { guildId: input.guildId, channelId: input.channelId, day } }, create: { guildId: input.guildId, channelId: input.channelId, day, messages: 1 }, update: { messages: { increment: 1 } } })]),
    ]);
  }
  async memberChange(guildId: string, joined: boolean, at = new Date()): Promise<void> { const day = analyticsDay(at); await this.prisma.discordAnalyticsDailyGuild.upsert({ where: { guildId_day: { guildId, day } }, create: { guildId, day, ...(joined ? { joins: 1 } : { leaves: 1 }) }, update: joined ? { joins: { increment: 1 } } : { leaves: { increment: 1 } } }); }
  async command(input: { guildId: string; actorId: string; commandName: string; subcommand?: string; outcome: AnalyticsOutcome; durationMs: number; at?: Date }): Promise<void> {
    const day = analyticsDay(input.at); const subcommand = input.subcommand ?? ''; const outcome = outcomeCounters(input.outcome); const duration = BigInt(Math.max(0, Math.min(Math.round(input.durationMs), 120_000)));
    await this.prisma.$transaction([
      this.prisma.discordAnalyticsDailyGuild.upsert({ where: { guildId_day: { guildId: input.guildId, day } }, create: { guildId: input.guildId, day, commandRuns: 1, ...guildOutcomeCounters(input.outcome) }, update: { commandRuns: { increment: 1 }, ...incrementCounters(guildOutcomeCounters(input.outcome)) } }),
      this.prisma.discordAnalyticsDailyCommand.upsert({ where: { guildId_day_commandName_subcommand: { guildId: input.guildId, day, commandName: input.commandName, subcommand } }, create: { guildId: input.guildId, day, commandName: input.commandName, subcommand, runs: 1, durationTotalMs: duration, ...outcome }, update: { runs: { increment: 1 }, durationTotalMs: { increment: duration }, ...incrementCounters(outcome) } }),
      this.prisma.discordAnalyticsDailyMemberActivity.upsert({ where: { guildId_discordUserId_day: { guildId: input.guildId, discordUserId: input.actorId, day } }, create: { guildId: input.guildId, discordUserId: input.actorId, day, usedCommand: true }, update: { usedCommand: true } }),
    ]);
  }
  async communityInteraction(guildId: string, actorId: string, at = new Date()): Promise<void> { const day = analyticsDay(at); await this.prisma.discordAnalyticsDailyMemberActivity.upsert({ where: { guildId_discordUserId_day: { guildId, discordUserId: actorId, day } }, create: { guildId, discordUserId: actorId, day, communityInteraction: true }, update: { communityInteraction: true } }); }
  async heartbeat(input: { workerName: string; instanceId: string; successfulScan?: boolean; failed?: boolean; metadata?: Record<string, string | number | boolean> }): Promise<void> { const now = new Date(); await this.prisma.discordWorkerHeartbeat.upsert({ where: { workerName: input.workerName }, create: { workerName: input.workerName, instanceId: input.instanceId, lastStartedAt: now, lastHeartbeatAt: now, ...(input.successfulScan ? { lastSuccessfulScanAt: now } : {}), ...(input.failed ? { lastErrorAt: now, status: 'DEGRADED' } : {}), metadata: input.metadata }, update: { instanceId: input.instanceId, lastHeartbeatAt: now, ...(input.successfulScan ? { lastSuccessfulScanAt: now, status: 'HEALTHY' } : {}), ...(input.failed ? { lastErrorAt: now, status: 'DEGRADED' } : {}), metadata: input.metadata } }); }
  async pruneRetention(now = new Date()): Promise<void> {
    const dailyBefore = analyticsRetentionStart(ANALYTICS_DAILY_RETENTION_DAYS, now);
    const heartbeatBefore = new Date(now.getTime() - ANALYTICS_HEARTBEAT_RETENTION_DAYS * 86_400_000);
    await this.prisma.$transaction([
      this.prisma.discordAnalyticsDailyChannel.deleteMany({ where: { day: { lt: dailyBefore } } }),
      this.prisma.discordAnalyticsDailyCommand.deleteMany({ where: { day: { lt: dailyBefore } } }),
      this.prisma.discordAnalyticsDailyMemberActivity.deleteMany({ where: { day: { lt: dailyBefore } } }),
      this.prisma.discordAnalyticsDailyGuild.deleteMany({ where: { day: { lt: dailyBefore } } }),
      this.prisma.discordWorkerHeartbeat.deleteMany({ where: { lastHeartbeatAt: { lt: heartbeatBefore } } }),
    ]);
  }
  async overview(guildId: string, period: AnalyticsPeriod, memberCount: number) {
    const start = analyticsPeriodStart(period); const priorStart = new Date(start.getTime() - (Date.now() - start.getTime())); const [daily, priorDaily, active, channels, commands, ticketGroups, ticketOpened, ticketResolved, suggestions, polls, giveaways, memes, publications, runs] = await Promise.all([
      this.prisma.discordAnalyticsDailyGuild.aggregate({ where: { guildId, day: { gte: analyticsDay(start) } }, _sum: analyticsSums() }),
      this.prisma.discordAnalyticsDailyGuild.aggregate({ where: { guildId, day: { gte: analyticsDay(priorStart), lt: analyticsDay(start) } }, _sum: analyticsSums() }),
      this.prisma.discordAnalyticsDailyMemberActivity.count({ where: { guildId, day: { gte: analyticsDay(start) }, OR: [{ messaged: true }, { usedCommand: true }, { communityInteraction: true }] } }),
      this.prisma.discordAnalyticsDailyChannel.groupBy({ by: ['channelId'], where: { guildId, day: { gte: analyticsDay(start) } }, _sum: { messages: true }, orderBy: { _sum: { messages: 'desc' } }, take: 10 }),
      this.prisma.discordAnalyticsDailyCommand.groupBy({ by: ['commandName', 'subcommand'], where: { guildId, day: { gte: analyticsDay(start) } }, _sum: { runs: true, successes: true, internalErrors: true }, orderBy: { _sum: { runs: 'desc' } }, take: 15 }),
      this.prisma.discordTicket.groupBy({ by: ['status'], where: { guildId }, _count: { _all: true } }),
      this.prisma.discordTicket.count({ where: { guildId, createdAt: { gte: start } } }), this.prisma.discordTicket.count({ where: { guildId, resolvedAt: { gte: start } } }),
      this.prisma.discordSuggestion.count({ where: { guildId, createdAt: { gte: start } } }), this.prisma.discordPoll.count({ where: { guildId, createdAt: { gte: start } } }),
      this.prisma.discordGiveaway.count({ where: { guildId, createdAt: { gte: start } } }), this.prisma.discordMemeCompetition.count({ where: { guildId, createdAt: { gte: start } } }),
      this.prisma.discordEmbedPublication.count({ where: { guildId, publishedAt: { gte: start }, deletedAt: null } }), this.prisma.discordScheduledPublicationRun.groupBy({ by: ['status'], where: { schedule: { guildId }, createdAt: { gte: start } }, _count: { _all: true } }),
    ]);
    return { period, memberCount, totals: daily._sum, priorTotals: priorDaily._sum, activeMembers: active, channels: channels.map((row) => ({ channelId: row.channelId, messages: row._sum.messages ?? 0 })), commands: commands.map((row) => ({ command: row.commandName, subcommand: row.subcommand || undefined, runs: row._sum.runs ?? 0, successes: row._sum.successes ?? 0, internalErrors: row._sum.internalErrors ?? 0 })), support: { open: ticketGroups.filter((row) => !['RESOLVED', 'CLOSED'].includes(row.status)).reduce((sum, row) => sum + row._count._all, 0), unassigned: await this.prisma.discordTicket.count({ where: { guildId, status: { notIn: ['RESOLVED', 'CLOSED'] }, assignedStaffId: null } }), opened: ticketOpened, resolved: ticketResolved, byStatus: Object.fromEntries(ticketGroups.map((row) => [row.status, row._count._all])) }, community: { suggestions, polls, giveaways, memes }, publishing: { publications, runs: Object.fromEntries(runs.map((row) => [row.status, row._count._all])) } };
  }
  async health(now = new Date()) { const rows = await this.prisma.discordWorkerHeartbeat.findMany(); return rows.map((row) => ({ workerName: row.workerName, status: heartbeatStatus(row.lastHeartbeatAt, now, row.status), lastHeartbeatAt: row.lastHeartbeatAt, lastSuccessfulScanAt: row.lastSuccessfulScanAt })); }
  async exportRows(guildId: string, period: AnalyticsPeriod) { const start = analyticsDay(analyticsPeriodStart(period)); return this.prisma.discordAnalyticsDailyGuild.findMany({ where: { guildId, day: { gte: start } }, orderBy: { day: 'asc' }, select: { day: true, messages: true, supportMessages: true, joins: true, leaves: true, commandRuns: true, commandSuccesses: true, commandUserErrors: true, commandDenied: true, commandFailures: true } }); }
}
function analyticsSums() { return { messages: true, supportMessages: true, joins: true, leaves: true, commandRuns: true, commandSuccesses: true, commandUserErrors: true, commandDenied: true, commandFailures: true } as const; }
function outcomeCounters(outcome: AnalyticsOutcome) { return outcome === 'SUCCESS' ? { successes: 1 } : outcome === 'PERMISSION_DENIED' ? { permissionDenied: 1 } : outcome === 'INTERNAL_ERROR' ? { internalErrors: 1 } : { userErrors: 1 }; }
function guildOutcomeCounters(outcome: AnalyticsOutcome) { return outcome === 'SUCCESS' ? { commandSuccesses: 1 } : outcome === 'PERMISSION_DENIED' ? { commandDenied: 1 } : outcome === 'INTERNAL_ERROR' ? { commandFailures: 1 } : { commandUserErrors: 1 }; }
function incrementCounters(value: Record<string, number | undefined>): Record<string, { increment: number }> { return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number').map(([key, amount]) => [key, { increment: amount }])); }
export function heartbeatStatus(lastHeartbeatAt: Date, now: Date, stored: string): AnalyticsHealth { if (stored === 'UNHEALTHY') return 'UNHEALTHY'; const age = now.getTime() - lastHeartbeatAt.getTime(); return age <= 5 * 60_000 ? 'HEALTHY' : age <= 20 * 60_000 ? 'DEGRADED' : 'UNHEALTHY'; }
