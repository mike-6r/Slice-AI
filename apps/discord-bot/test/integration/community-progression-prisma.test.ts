import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/index.js';
import { AchievementService, MemberProgressionService } from '../../src/progression.js';
import { PrismaCommunityRepository } from '../../src/persistence/community-repository.js';
import { PrismaProgressionRepository } from '../../src/persistence/progression-repository.js';
import { PrismaSetupRepository } from '../../src/persistence/setup-repository.js';
import { testDatabaseUrl } from '../test-database-url.js';

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const prefix = `community-progression-test-${Date.now()}`;
const progression = new PrismaProgressionRepository(prisma);
const community = new PrismaCommunityRepository(prisma);
const setup = new PrismaSetupRepository(prisma);
const service = new MemberProgressionService(progression, { XP_ENABLED: true, XP_MESSAGE_MIN: 100, XP_MESSAGE_MAX: 100, XP_COOLDOWN_SECONDS: 60, XP_MIN_MESSAGE_LENGTH: 5, REPUTATION_ENABLED: true, REPUTATION_COOLDOWN_HOURS: 24, DAILY_ENABLED: true, DAILY_XP_REWARD: 25 });

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => {
  await prisma.discordMemberAchievement.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordReputationGrant.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordReputationCooldown.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordMemberProgression.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordSuggestion.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordPoll.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordBirthday.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordCommunityScheduleState.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordNotificationPreference.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordGuildConfig.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('Prisma community and progression authority', () => {
  it('awards eligible message XP once per cooldown, derives levels, and keeps ranks guild-scoped', async () => {
    const guild = `${prefix}-xp`;
    const first = await service.awardMessageXp({ guildId: guild, discordUserId: 'member-a', content: 'A useful message', isBot: false, isSystem: false, isCommand: false, blocked: false });
    const duplicate = await service.awardMessageXp({ guildId: guild, discordUserId: 'member-a', content: 'Another useful message', isBot: false, isSystem: false, isCommand: false, blocked: false });
    await service.awardMessageXp({ guildId: guild, discordUserId: 'member-b', content: 'A useful message', isBot: false, isSystem: false, isCommand: false, blocked: false });
    await service.awardMessageXp({ guildId: `${prefix}-other-guild`, discordUserId: 'member-z', content: 'A useful message', isBot: false, isSystem: false, isCommand: false, blocked: false });
    expect(first).toMatchObject({ amount: 100, progression: { xp: 100, level: 2 } });
    expect(duplicate).toBeNull();
    expect((await service.leaderboard(guild, 'xp')).map((row) => row.discordUserId)).toEqual(['member-a', 'member-b']);
    expect(await service.rank(guild, 'member-b')).toBe(2);
  });

  it('keeps daily claims atomic and preserves continuing versus reset streaks', async () => {
    const guild = `${prefix}-daily`; const user = 'member-a'; const start = new Date('2026-08-01T12:00:00.000Z');
    const first = await progression.claimDaily(guild, user, 25, start);
    const concurrent = await Promise.all([progression.claimDaily(guild, user, 25, new Date(start.getTime() + 24 * 60 * 60 * 1000)), progression.claimDaily(guild, user, 25, new Date(start.getTime() + 24 * 60 * 60 * 1000))]);
    const reset = await progression.claimDaily(guild, user, 25, new Date(start.getTime() + 73 * 60 * 60 * 1000));
    expect(first).toMatchObject({ currentStreak: 1, longestStreak: 1 });
    expect(concurrent.filter(Boolean)).toHaveLength(1);
    expect(concurrent.find(Boolean)).toMatchObject({ currentStreak: 2, longestStreak: 2 });
    expect(reset).toMatchObject({ currentStreak: 1, longestStreak: 2 });
  });

  it('allows only one concurrent reputation grant per giver and writes one durable audit record', async () => {
    const guild = `${prefix}-reputation`; const now = new Date('2026-08-01T12:00:00.000Z');
    const results = await Promise.all([progression.grantReputation(guild, 'giver-a', 'receiver', 'Thanks', now, 86_400_000), progression.grantReputation(guild, 'giver-a', 'receiver', 'Thanks', now, 86_400_000)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await progression.get(guild, 'receiver')).reputation).toBe(1);
    expect(await prisma.discordReputationGrant.count({ where: { guildId: guild, giverDiscordUserId: 'giver-a' } })).toBe(1);
  });

  it('unlocks each eligible achievement once across repeated evaluators', async () => {
    const guild = `${prefix}-achievements`; const user = 'member-a';
    await prisma.discordMemberProgression.create({ data: { guildId: guild, discordUserId: user, totalMessagesEligible: 50, level: 5, reputation: 5 } });
    const evaluator = new AchievementService(progression);
    const row = await progression.getOrCreate(guild, user);
    expect((await evaluator.evaluate(row)).sort()).toEqual(['ACTIVE_MEMBER', 'FIRST_MESSAGE', 'HELPFUL_5', 'LEVEL_5'].sort());
    expect(await evaluator.evaluate(row)).toEqual([]);
    expect(await prisma.discordMemberAchievement.count({ where: { guildId: guild, discordUserId: user } })).toBe(4);
  });

  it('allocates concurrent suggestion references uniquely, switches votes, and keeps guild lookups isolated', async () => {
    const guild = `${prefix}-suggestions`;
    const [one, two] = await Promise.all([community.createSuggestion(guild, 'member-a', 'First suggestion'), community.createSuggestion(guild, 'member-b', 'Second suggestion')]);
    await community.suggestionVote(one.id, 'voter', 1);
    await community.suggestionVote(one.id, 'voter', -1);
    expect([one.referenceNumber, two.referenceNumber].sort()).toEqual([1, 2]);
    expect(await community.suggestionCounts(one.id)).toEqual({ up: 0, down: 1 });
    expect(await community.suggestionByReference(`${prefix}-other-guild`, one.referenceNumber)).toBeNull();
  });

  it('rejects invalid or late poll votes and lets only one worker close a due poll', async () => {
    const guild = `${prefix}-polls`;
    const open = await community.createPoll(guild, 'staff', 'Choose one', ['Alpha', 'Beta'], null);
    expect(await community.pollVote(open.id, 'member-a', 4)).toBeNull();
    expect(await community.pollCounts(open.id, 2)).toEqual([0, 0]);
    const due = await community.createPoll(guild, 'staff', 'Closing soon', ['Yes', 'No'], new Date(Date.now() - 1_000));
    const closed = await Promise.all([community.closeDuePolls(), community.closeDuePolls()]);
    expect(closed.flat().filter((poll) => poll.id === due.id)).toHaveLength(1);
    expect((await community.poll(due.id))?.status).toBe('CLOSED');
    expect(await community.pollVote(due.id, 'member-a', 0)).toBeNull();
  });

  it('stores birthday month/day only and claims announcement and schedule markers exactly once', async () => {
    const guild = `${prefix}-scheduler`; const user = 'member-a';
    await community.setBirthday(guild, user, 8, 18);
    expect(await community.birthdays(guild, 8, 18)).toMatchObject([{ guildId: guild, discordUserId: user, month: 8, day: 18 }]);
    expect((await Promise.all([community.markBirthdayAnnounced(guild, user, '2026-08-18'), community.markBirthdayAnnounced(guild, user, '2026-08-18')])).filter(Boolean)).toHaveLength(1);
    expect((await Promise.all([community.claimSchedule(guild, 'daily-conversation', '2026-08-18'), community.claimSchedule(guild, 'daily-conversation', '2026-08-18')])).filter(Boolean)).toHaveLength(1);
  });

  it('persists customer notification preferences across repository instances', async () => {
    const guild = `${prefix}-notifications`;
    await setup.upsertGuildConfig({ guildId: guild, setupVersion: 12, setupStatus: 'NOT_CONFIGURED' });
    await setup.setNotificationPreference({ guildId: guild, discordUserId: 'member-a', logicalKey: 'order-updates', enabled: false });
    const restarted = new PrismaSetupRepository(prisma);
    expect(await restarted.listNotificationPreferences(guild, 'member-a')).toEqual([{ guildId: guild, discordUserId: 'member-a', logicalKey: 'order-updates', enabled: false }]);
  });
});
