import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { giveawayCommand, giveawayPayload, handleGiveawayButton, hasGiveawayManagementPermission } from '../../src/commands/giveaway.js';
import { GiveawayValidationError, parseGiveawayDuration, selectGiveawayWinners } from '../../src/giveaways.js';
import type { Giveaway } from '../../src/persistence/giveaway-repository.js';
import { processDueGiveaways } from '../../src/giveaway-worker.js';

const open = (overrides: Partial<Giveaway> = {}): Giveaway => ({ id: 'ckopaqueGiveawayId', guildId: 'guild-a', channelId: 'channel-a', messageId: 'message-a', createdByDiscordUserId: 'admin', title: 'Collector community bundle', description: 'A community-only giveaway.', startsAt: new Date('2026-08-18T00:00:00Z'), endsAt: new Date('2026-08-18T01:00:00Z'), status: 'OPEN', winnerCount: 1, endedAt: null, endedByDiscordUserId: null, cancelledAt: null, cancelledByDiscordUserId: null, completionAnnouncedAt: null, entryCount: 2, winners: [], ...overrides });

describe('Discord giveaway domain', () => {
  it('parses bounded compact durations', () => {
    expect(parseGiveawayDuration('10m')).toBe(600_000);
    expect(parseGiveawayDuration('2h')).toBe(7_200_000);
    expect(parseGiveawayDuration('3d')).toBe(259_200_000);
  });

  it('rejects invalid or unsafe giveaway durations', () => {
    expect(() => parseGiveawayDuration('0m')).toThrow(GiveawayValidationError);
    expect(() => parseGiveawayDuration('31d')).toThrow(GiveawayValidationError);
    expect(() => parseGiveawayDuration('forever')).toThrow(GiveawayValidationError);
  });

  it('selects winners from arbitrary unordered entrants without relying on reactions', () => {
    const entrants = ['member-z', 'member-a', 'member-k', 'member-q'];
    const winners = selectGiveawayWinners(entrants, 2, (max) => max - 1);
    expect(winners).toHaveLength(2);
    expect(new Set(winners).size).toBe(2);
    expect(winners.every((winner) => entrants.includes(winner))).toBe(true);
  });

  it('enforces winner-count bounds and deduplicates the source entrant set', () => {
    expect(selectGiveawayWinners(['a', 'a', 'b'], 2, () => 0)).toEqual(['a', 'b']);
    expect(() => selectGiveawayWinners(['a'], 0)).toThrow(GiveawayValidationError);
    expect(() => selectGiveawayWinners(['a'], 2)).toThrow(GiveawayValidationError);
  });

  it('registers all administrative subcommands with a management permission gate', () => {
    const command = giveawayCommand.toJSON();
    expect(command.default_member_permissions).toBe(PermissionFlagsBits.ManageGuild.toString());
    expect(command.options?.filter((option) => option.type === 1).map((option) => option.name)).toEqual(['start', 'end', 'reroll', 'delete']);
    expect(hasGiveawayManagementPermission({ memberPermissions: null })).toBe(false);
    expect(hasGiveawayManagementPermission({ memberPermissions: { has: (permission: bigint) => permission === PermissionFlagsBits.ManageGuild } } as never)).toBe(true);
  });

  it('renders a premium open state with an opaque durable entry component and a native timestamp', () => {
    const payload = giveawayPayload(open());
    expect(payload.components[0]?.components[0]?.data.custom_id).toBe('slice:giveaway:enter:ckopaqueGiveawayId');
    expect(payload.embeds[0]?.data.description).toContain('<t:');
    expect(payload.embeds[0]?.data.description).toContain('Entries:** 2');
  });

  it('removes entry controls for ended and cancelled giveaways', () => {
    expect(giveawayPayload(open({ status: 'ENDED', winners: [{ discordUserId: 'winner', selectionType: 'ORIGINAL', rerollSequence: 0, selectedAt: new Date(), selectedByDiscordId: 'system' }] })).components).toEqual([]);
    expect(giveawayPayload(open({ status: 'CANCELLED' })).components).toEqual([]);
  });

  it('uses a durable repository lookup after process state loss and returns a friendly duplicate state', async () => {
    const replies: unknown[] = [];
    const repository = { enter: async () => 'ALREADY_ENTERED', get: async () => open() };
    const interaction = { customId: 'slice:giveaway:enter:ckopaqueGiveawayId', guildId: 'guild-a', guild: {}, user: { id: 'member-a' }, reply: async (payload: unknown) => { replies.push(payload); }, memberPermissions: null };
    await expect(handleGiveawayButton(interaction as never, repository as never, async () => true)).resolves.toBe(true);
    expect(JSON.stringify(replies)).toContain('already entered');
  });

  it('denies forged/wrong-guild, closed, and cancelled component entries through current durable state', async () => {
    const replies: unknown[] = [];
    const repository = { enter: async () => 'UNAVAILABLE', get: async () => null };
    const interaction = { customId: 'slice:giveaway:enter:ckopaqueGiveawayId', guildId: 'other-guild', guild: {}, user: { id: 'member-a' }, reply: async (payload: unknown) => { replies.push(payload); }, memberPermissions: null };
    await expect(handleGiveawayButton(interaction as never, repository as never, async () => true)).resolves.toBe(true);
    expect(JSON.stringify(replies)).toContain('closed, cancelled, expired');
  });

  it('runs due completion once without countdown-message churn or a duplicate publish pass', async () => {
    const giveaway = open({ endsAt: new Date(Date.now() - 1), status: 'OPEN' });
    const completed = open({ status: 'ENDED', endedAt: new Date(), winners: [] });
    const published: string[] = [];
    const repository = { due: async () => [giveaway], complete: async () => ({ giveaway: completed, completedNow: true }), pendingCompletionAnnouncements: async () => [completed] };
    await expect(processDueGiveaways(repository, async (row) => { published.push(row.id); return true; })).resolves.toEqual({ scanned: 1, completed: 1, published: 1 });
    expect(published).toEqual([giveaway.id]);
  });
});
