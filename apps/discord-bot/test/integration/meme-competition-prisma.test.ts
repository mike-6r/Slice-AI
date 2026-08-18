import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaMemeCompetitionRepository } from '../../src/persistence/meme-competition-repository.js';
import { testDatabaseUrl } from '../test-database-url.js';

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const prefix = `meme-test-${Date.now()}`;
const ids: string[] = [];
const repository = new PrismaMemeCompetitionRepository(prisma, () => new Date(), () => 0);

async function create(overrides: Partial<{ channelId: string; endsAt: Date; rewardXp: number; periodKey: string }> = {}) {
  const competition = await repository.openWeekly({ guildId: `${prefix}-guild`, channelId: overrides.channelId ?? `${prefix}-channel`, periodKey: overrides.periodKey ?? `${prefix}-${ids.length}`, startsAt: new Date(Date.now() - 1_000), endsAt: overrides.endsAt ?? new Date(Date.now() + 3_600_000), rewardXp: overrides.rewardXp ?? 100 });
  ids.push(competition.competition.id);
  return competition.competition;
}
async function close(competitionId: string, automatic = false, tallies: Array<{ submissionId: string; valid: boolean; voteCount: number; invalidReason?: string }> = []) {
  const competition = await repository.get(competitionId, `${prefix}-guild`);
  if (!competition) throw new Error('Competition missing');
  expect(await repository.claimClose(competition.id, competition.guildId, automatic)).not.toBeNull();
  return repository.finalize(competition.id, competition.guildId, automatic ? 'system:meme-competition' : 'admin', automatic, tallies);
}

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { if (ids.length) await prisma.discordMemeCompetition.deleteMany({ where: { id: { in: ids } } }); await prisma.$disconnect(); });

describe('Prisma meme competition lifecycle authority', () => {
  it('persists one weekly competition and is durable across a fresh repository instance', async () => {
    const competition = await create({ periodKey: `${prefix}-weekly` });
    const duplicate = await repository.openWeekly({ guildId: competition.guildId, channelId: competition.channelId, periodKey: competition.periodKey, startsAt: competition.startsAt, endsAt: competition.endsAt, rewardXp: 100 });
    const restarted = new PrismaMemeCompetitionRepository(prisma);
    expect(duplicate.created).toBe(false);
    expect((await restarted.get(competition.id, competition.guildId))?.periodKey).toBe(competition.periodKey);
    expect(await prisma.discordMemeCompetitionAuditEvent.count({ where: { competitionId: competition.id, action: 'OPENED' } })).toBe(1);
  });

  it('persists a valid submission and prevents concurrent duplicate registration of the same message', async () => {
    const competition = await create();
    const input = { competitionId: competition.id, guildId: competition.guildId, channelId: competition.channelId, messageId: `${prefix}000000000001`, discordUserId: 'member-a' };
    const results = await Promise.all([repository.registerSubmission(input), repository.registerSubmission(input)]);
    expect(results.sort()).toEqual(['DUPLICATE_MESSAGE', 'REGISTERED']);
    expect(await prisma.discordMemeSubmission.count({ where: { competitionId: competition.id, messageId: input.messageId } })).toBe(1);
  });

  it('enforces one active submission per member and guild/channel ownership', async () => {
    const competition = await create();
    expect(await repository.registerSubmission({ competitionId: competition.id, guildId: competition.guildId, channelId: competition.channelId, messageId: `${prefix}000000000002`, discordUserId: 'member-a' })).toBe('REGISTERED');
    expect(await repository.registerSubmission({ competitionId: competition.id, guildId: competition.guildId, channelId: competition.channelId, messageId: `${prefix}000000000003`, discordUserId: 'member-a' })).toBe('ALREADY_SUBMITTED');
    expect(await repository.registerSubmission({ competitionId: competition.id, guildId: competition.guildId, channelId: 'wrong-channel', messageId: `${prefix}000000000004`, discordUserId: 'member-b' })).toBe('UNAVAILABLE');
    expect(await repository.registerSubmission({ competitionId: competition.id, guildId: 'wrong-guild', channelId: competition.channelId, messageId: `${prefix}000000000005`, discordUserId: 'member-b' })).toBe('UNAVAILABLE');
  });

  it('rejects late submissions after close and preserves the cancelled state', async () => {
    const competition = await create();
    expect((await repository.cancel(competition.id, competition.guildId, 'admin'))?.status).toBe('CANCELLED');
    expect(await repository.registerSubmission({ competitionId: competition.id, guildId: competition.guildId, channelId: competition.channelId, messageId: `${prefix}000000000006`, discordUserId: 'member-a' })).toBe('UNAVAILABLE');
    expect(await prisma.discordMemeCompetitionAuditEvent.count({ where: { competitionId: competition.id, action: 'CANCELLED' } })).toBe(1);
  });

  it('chooses the highest valid reaction tally, records winner history, and awards existing XP exactly once', async () => {
    const competition = await create({ rewardXp: 75 });
    await repository.registerSubmission({ competitionId: competition.id, guildId: competition.guildId, channelId: competition.channelId, messageId: `${prefix}000000000007`, discordUserId: 'member-a' });
    await repository.registerSubmission({ competitionId: competition.id, guildId: competition.guildId, channelId: competition.channelId, messageId: `${prefix}000000000008`, discordUserId: 'member-b' });
    const before = await prisma.discordMemberProgression.findUnique({ where: { guildId_discordUserId: { guildId: competition.guildId, discordUserId: 'member-b' } } });
    const current = await repository.get(competition.id, competition.guildId);
    const result = await close(competition.id, false, current!.submissions.map((submission) => ({ submissionId: submission.id, valid: true, voteCount: submission.discordUserId === 'member-b' ? 9 : 3 })));
    const retry = await repository.finalize(competition.id, competition.guildId, 'admin', false, []);
    expect(result?.competition.status).toBe('AWARDED');
    expect(result?.competition.winnerDiscordUserId).toBe('member-b');
    expect(retry?.closedNow).toBe(false);
    expect((await prisma.discordMemeAward.count({ where: { competitionId: competition.id } }))).toBe(1);
    expect((await prisma.discordMemberProgression.findUniqueOrThrow({ where: { guildId_discordUserId: { guildId: competition.guildId, discordUserId: 'member-b' } } })).xp).toBe((before?.xp ?? 0) + 75);
    expect(await prisma.discordMemeCompetitionAuditEvent.count({ where: { competitionId: competition.id, action: { in: ['WINNER_SELECTED', 'XP_AWARDED'] } } })).toBe(2);
  });

  it('excludes invalid or deleted submissions and closes empty competitions without an award', async () => {
    const competition = await create();
    await repository.registerSubmission({ competitionId: competition.id, guildId: competition.guildId, channelId: competition.channelId, messageId: `${prefix}000000000009`, discordUserId: 'member-a' });
    const submission = (await repository.get(competition.id, competition.guildId))!.submissions[0]!;
    const result = await close(competition.id, false, [{ submissionId: submission.id, valid: false, voteCount: 0, invalidReason: 'Deleted Discord message' }]);
    expect(result?.competition.status).toBe('CLOSED');
    expect(result?.competition.award).toBeNull();
    expect((await prisma.discordMemeSubmission.findUniqueOrThrow({ where: { id: submission.id } })).invalidReason).toBe('Deleted Discord message');
  });

  it('allows only one automatic worker claim and leaves the final result durable for retries', async () => {
    const competition = await create();
    await repository.registerSubmission({ competitionId: competition.id, guildId: competition.guildId, channelId: competition.channelId, messageId: `${prefix}000000000010`, discordUserId: 'member-a' });
    await prisma.discordMemeCompetition.update({ where: { id: competition.id }, data: { endsAt: new Date(Date.now() - 1_000) } });
    const [one, two] = await Promise.all([repository.claimClose(competition.id, competition.guildId, true), repository.claimClose(competition.id, competition.guildId, true)]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    const submission = (await repository.get(competition.id, competition.guildId))!.submissions[0]!;
    const result = await repository.finalize(competition.id, competition.guildId, 'system:meme-competition', true, [{ submissionId: submission.id, valid: true, voteCount: 1 }]);
    expect(result?.closedNow).toBe(true);
    expect((await repository.due()).some((row) => row.id === competition.id)).toBe(false);
  });
});
