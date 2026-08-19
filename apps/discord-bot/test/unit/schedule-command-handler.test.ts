import { describe, expect, it } from 'vitest';
import { handleScheduleButton, handleScheduleCommand, type ScheduleSessions } from '../../src/schedule-command-handler.js';
import { DiscordPaginator } from '../../src/paginator.js';
import type { AnnouncementSchedule } from '../../src/persistence/announcement-schedule-repository.js';

const schedule = (overrides: Partial<AnnouncementSchedule> = {}): AnnouncementSchedule => ({ id: 'schedule-1', guildId: 'guild-1', draftId: 'draft-1', createdByDiscordUserId: 'staff-1', name: 'Weekly report', scheduleType: 'WEEKLY', timezone: 'UTC', localTime: '09:00', date: null, weekdays: ['MON'], dayOfMonth: null, payloadMode: 'SNAPSHOT', payloadSnapshot: { title: 'Report' }, linkButtonsSnapshot: [], targetChannelId: 'channel-1', status: 'SCHEDULED', nextRunAt: new Date('2026-08-24T09:00:00Z'), lastRunAt: null, processingStartedAt: null, leaseExpiresAt: null, workerToken: null, version: 1, ...overrides });
const permissions = { has: () => true };

describe('schedule command safety', () => {
  it('requires an owner-bound confirmation before a manual run is queued', async () => {
    const sessions: ScheduleSessions = new Map(); const replies: unknown[] = [];
    const interaction = { customId: 'slice:schedule:schedule-1:run', guildId: 'guild-1', user: { id: 'staff-1' }, memberPermissions: permissions, isButton: () => true, reply: async (value: unknown) => { replies.push(value); }, update: async () => {} };
    const repository = { get: async () => schedule(), runNow: async () => { throw new Error('must not run before confirmation'); } };
    await handleScheduleButton(interaction as never, repository as never, sessions);
    expect(replies).toHaveLength(1); expect(sessions.size).toBe(1); expect(String((replies[0] as { embeds: Array<{ data: { title?: string } }> }).embeds[0]?.data.title)).toContain('Confirm');
  });
  it('queues a run only after the matching confirmation is accepted', async () => {
    const sessions: ScheduleSessions = new Map([['key-1', { actorId: 'staff-1', guildId: 'guild-1', scheduleId: 'schedule-1', expiresAt: Date.now() + 60_000 }]]); let calls = 0;
    const interaction = { customId: 'slice:schedule:run-confirm:key-1:confirm', guildId: 'guild-1', user: { id: 'staff-1' }, memberPermissions: permissions, isButton: () => true, reply: async () => {}, update: async () => {} };
    const repository = { get: async () => schedule(), runNow: async () => { calls++; return schedule({ version: 2, nextRunAt: new Date() }); } };
    await handleScheduleButton(interaction as never, repository as never, sessions);
    expect(calls).toBe(1); expect(sessions.size).toBe(0);
  });
  it('rejects a manual-run confirmation from anyone other than its owner', async () => {
    const sessions: ScheduleSessions = new Map([['key-1', { actorId: 'staff-1', guildId: 'guild-1', scheduleId: 'schedule-1', expiresAt: Date.now() + 60_000 }]]); let calls = 0; const replies: unknown[] = [];
    const interaction = { customId: 'slice:schedule:run-confirm:key-1:confirm', guildId: 'guild-1', user: { id: 'staff-2' }, memberPermissions: permissions, isButton: () => true, reply: async (value: unknown) => { replies.push(value); }, update: async () => {} };
    const repository = { get: async () => schedule(), runNow: async () => { calls++; return schedule(); } };
    await handleScheduleButton(interaction as never, repository as never, sessions);
    expect(calls).toBe(0); expect(replies).toHaveLength(1); expect(sessions.size).toBe(1);
  });
  it('paginates schedule list results instead of clipping them into one embed', async () => {
    const replies: Array<{ components?: unknown[] }> = []; const rows = Array.from({ length: 7 }, (_, index) => schedule({ id: `schedule-${index}`, name: `Schedule ${index}` }));
    const interaction = { guildId: 'guild-1', guild: {}, user: { id: 'staff-1' }, memberPermissions: permissions, options: { getSubcommand: () => 'list', getString: () => 'ALL' }, reply: async (value: { components?: unknown[] }) => { replies.push(value); } };
    const repository = { list: async () => rows };
    await handleScheduleCommand(interaction as never, repository as never, {} as never, new Map(), new DiscordPaginator());
    expect(replies).toHaveLength(1); expect(replies[0]?.components).toHaveLength(1);
  });
});
