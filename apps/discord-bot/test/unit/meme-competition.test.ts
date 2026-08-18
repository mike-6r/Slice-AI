import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { handleMemeCommand, hasMemeManagementPermission, memeCommand, memeCompetitionPayload } from '../../src/commands/meme.js';
import { explicitReactionVotes, hasMemeMedia, selectMemeWinner } from '../../src/meme-competition.js';
import { processDueMemeCompetitions } from '../../src/meme-competition-worker.js';
import type { MemeCompetition } from '../../src/persistence/meme-competition-repository.js';

const open = (overrides: Partial<MemeCompetition> = {}): MemeCompetition => ({ id: 'ckMemeOpaqueId', guildId: 'guild-a', channelId: 'channel-a', periodKey: '2026-34', announcementMessageId: 'announcement-a', startsAt: new Date('2026-08-17T00:00:00Z'), endsAt: new Date('2026-08-24T00:00:00Z'), status: 'OPEN', rewardXp: 100, winnerDiscordUserId: null, winningSubmissionId: null, closedAt: null, awardedAt: null, resultAnnouncedAt: null, submissions: [], award: null, ...overrides });

describe('Discord meme competition domain', () => {
  it('registers one minimal top-level meme command with member and admin subcommands', () => {
    const command = memeCommand.toJSON();
    expect(command.default_member_permissions).toBeUndefined();
    expect(command.options?.filter((option) => option.type === 1).map((option) => option.name)).toEqual(['submit', 'status', 'end', 'cancel']);
  });

  it('uses a runtime Manage Server check for only administrative operations', () => {
    expect(hasMemeManagementPermission({ memberPermissions: null })).toBe(false);
    expect(hasMemeManagementPermission({ memberPermissions: { has: (permission: bigint) => permission === PermissionFlagsBits.ManageGuild } } as never)).toBe(true);
  });

  it('rejects an unauthorized close before any competition lookup', async () => {
    const replies: unknown[] = [];
    const interaction = { guildId: 'guild-a', guild: {}, user: { id: 'member-a' }, memberPermissions: null, options: { getSubcommand: () => 'end' }, reply: async (payload: unknown) => { replies.push(payload); } };
    await handleMemeCommand(interaction as never, {} as never, '🔥', async () => null);
    expect(JSON.stringify(replies)).toContain('Manage Server');
  });

  it('accepts image and GIF media but rejects plain text', () => {
    expect(hasMemeMedia({ attachments: new Map([['a', { contentType: 'image/gif', name: 'meme.gif' }]]), content: '', embeds: [] })).toBe(true);
    expect(hasMemeMedia({ attachments: new Map(), content: 'just a thought', embeds: [] })).toBe(false);
    expect(hasMemeMedia({ attachments: new Map(), content: 'https://cdn.example/meme.webp', embeds: [] })).toBe(true);
  });

  it('looks up the configured vote emoji explicitly rather than by reaction order', () => {
    const votes = explicitReactionVotes([
      { emoji: { name: '👍' }, voters: [{ id: 'other', bot: false }] },
      { emoji: { name: '🔥' }, voters: [{ id: 'owner', bot: false }, { id: 'bot', bot: true }, { id: 'voter-a', bot: false }, { id: 'voter-a', bot: false }, { id: 'voter-b', bot: false }] }
    ], '🔥', 'owner');
    expect(votes).toBe(2);
  });

  it('selects the highest valid vote count', () => {
    expect(selectMemeWinner([{ submissionId: 'a', discordUserId: 'a', voteCount: 3 }, { submissionId: 'b', discordUserId: 'b', voteCount: 5 }], () => 0)?.submissionId).toBe('b');
  });

  it('resolves ties with the injected secure-choice contract after stable sorting', () => {
    const winner = selectMemeWinner([{ submissionId: 'z', discordUserId: 'z', voteCount: 4 }, { submissionId: 'a', discordUserId: 'a', voteCount: 4 }], () => 1);
    expect(winner?.submissionId).toBe('z');
  });

  it('renders a premium open announcement with duration, reward, submission, and vote instructions', () => {
    const payload = memeCompetitionPayload(open(), '🔥');
    expect(payload.embeds[0]?.data.description).toContain('/meme submit');
    expect(payload.embeds[0]?.data.description).toContain('100 XP');
    expect(payload.embeds[0]?.data.description).toContain('🔥');
  });

  it('renders a no-winner result without fabricating participation', () => {
    const payload = memeCompetitionPayload(open({ status: 'CLOSED', closedAt: new Date() }), '🔥', 'result');
    expect(payload.embeds[0]?.data.description).toContain('No valid meme submission');
  });

  it('does not republish a result closed in the same worker pass', async () => {
    const competition = open({ endsAt: new Date(Date.now() - 1) });
    const awarded = open({ status: 'AWARDED', winnerDiscordUserId: 'winner', winningSubmissionId: 'submission', closedAt: new Date(), awardedAt: new Date() });
    const published: string[] = [];
    const result = await processDueMemeCompetitions({ due: async () => [competition], pendingResultAnnouncements: async () => [awarded] } as never, async () => ({ competition: awarded, closedNow: true }), async (row) => { published.push(row.id); return true; });
    expect(result).toEqual({ scanned: 1, closed: 1, published: 1 });
    expect(published).toEqual([awarded.id]);
  });

  it('does not publish or re-close a worker retry that was already finalized', async () => {
    const competition = open({ endsAt: new Date(Date.now() - 1) });
    const result = await processDueMemeCompetitions({ due: async () => [competition], pendingResultAnnouncements: async () => [] } as never, async () => ({ competition, closedNow: false }), async () => true);
    expect(result).toEqual({ scanned: 1, closed: 0, published: 0 });
  });
});
