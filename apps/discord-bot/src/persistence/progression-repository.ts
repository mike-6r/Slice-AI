import { PrismaClient } from '../../generated/prisma/index.js';

export type MemberProgression = {
  guildId: string; discordUserId: string; xp: number; level: number; reputation: number;
  totalMessagesEligible: number; lastXpAt: Date | null; lastDailyClaimAt: Date | null;
  currentStreak: number; longestStreak: number; createdAt: Date; updatedAt: Date;
};
export type AchievementUnlock = { key: string; unlockedAt: Date };

function map(row: MemberProgression): MemberProgression { return row; }

export class PrismaProgressionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreate(guildId: string, discordUserId: string): Promise<MemberProgression> {
    return map(await this.prisma.discordMemberProgression.upsert({
      where: { guildId_discordUserId: { guildId, discordUserId } },
      create: { guildId, discordUserId }, update: {}
    }));
  }

  async get(guildId: string, discordUserId: string): Promise<MemberProgression | null> {
    const row = await this.prisma.discordMemberProgression.findUnique({ where: { guildId_discordUserId: { guildId, discordUserId } } });
    return row ? map(row) : null;
  }

  async awardMessageXpAt(guildId: string, discordUserId: string, amount: number, now: Date, cooldownMs: number): Promise<MemberProgression | null> {
    await this.getOrCreate(guildId, discordUserId);
    const changed = await this.prisma.discordMemberProgression.updateMany({
      where: { guildId, discordUserId, OR: [{ lastXpAt: null }, { lastXpAt: { lte: new Date(now.getTime() - cooldownMs) } }] },
      data: { xp: { increment: amount }, totalMessagesEligible: { increment: 1 }, lastXpAt: now }
    });
    if (changed.count === 0) return null;
    await this.reconcileLevel(guildId, discordUserId);
    return this.getOrCreate(guildId, discordUserId);
  }

  async claimDaily(guildId: string, discordUserId: string, amount: number, now: Date): Promise<MemberProgression | null> {
    const previous = await this.getOrCreate(guildId, discordUserId);
    const eligibleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (previous.lastDailyClaimAt && previous.lastDailyClaimAt > eligibleBefore) return null;
    const continuing = previous.lastDailyClaimAt && previous.lastDailyClaimAt >= new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const changed = await this.prisma.discordMemberProgression.updateMany({
      where: { guildId, discordUserId, OR: [{ lastDailyClaimAt: null }, { lastDailyClaimAt: { lte: eligibleBefore } }] },
      data: { xp: { increment: amount }, lastDailyClaimAt: now, currentStreak: continuing ? { increment: 1 } : 1 }
    });
    if (changed.count === 0) return null;
    const row = await this.getOrCreate(guildId, discordUserId);
    if (row.currentStreak > row.longestStreak) await this.prisma.discordMemberProgression.update({ where: { guildId_discordUserId: { guildId, discordUserId } }, data: { longestStreak: row.currentStreak } });
    await this.reconcileLevel(guildId, discordUserId);
    return this.getOrCreate(guildId, discordUserId);
  }

  async grantReputation(guildId: string, giverDiscordUserId: string, receiverDiscordUserId: string, reason: string | undefined, now: Date, cooldownMs: number): Promise<MemberProgression | null> {
    const nextAvailableAt = new Date(now.getTime() + cooldownMs);
    const acquired = await this.prisma.$queryRaw<Array<{ guildId: string }>>`
      INSERT INTO "DiscordReputationCooldown" ("guildId", "giverDiscordUserId", "nextAvailableAt", "updatedAt")
      VALUES (${guildId}, ${giverDiscordUserId}, ${nextAvailableAt}, ${now})
      ON CONFLICT ("guildId", "giverDiscordUserId") DO UPDATE
      SET "nextAvailableAt" = EXCLUDED."nextAvailableAt", "updatedAt" = EXCLUDED."updatedAt"
      WHERE "DiscordReputationCooldown"."nextAvailableAt" <= ${now}
      RETURNING "guildId"`;
    if (acquired.length === 0) return null;
    await this.prisma.$transaction([
      this.prisma.discordMemberProgression.upsert({ where: { guildId_discordUserId: { guildId, discordUserId: receiverDiscordUserId } }, create: { guildId, discordUserId: receiverDiscordUserId, reputation: 1 }, update: { reputation: { increment: 1 } } }),
      this.prisma.discordReputationGrant.create({ data: { guildId, giverDiscordUserId, receiverDiscordUserId, amount: 1, reason } })
    ]);
    return this.getOrCreate(guildId, receiverDiscordUserId);
  }

  async leaderboard(guildId: string, metric: 'xp' | 'reputation', take = 10): Promise<MemberProgression[]> {
    return (await this.prisma.discordMemberProgression.findMany({ where: { guildId }, orderBy: [{ [metric]: 'desc' }, { discordUserId: 'asc' }], take: Math.min(Math.max(take, 1), 25) })).map(map);
  }

  async rank(guildId: string, discordUserId: string, metric: 'xp' | 'reputation' = 'xp'): Promise<number> {
    const row = await this.getOrCreate(guildId, discordUserId);
    return 1 + await this.prisma.discordMemberProgression.count({ where: { guildId, OR: [{ [metric]: { gt: row[metric] } }, { [metric]: row[metric], discordUserId: { lt: discordUserId } }] } });
  }

  async achievements(guildId: string, discordUserId: string): Promise<AchievementUnlock[]> {
    return this.prisma.discordMemberAchievement.findMany({ where: { guildId, discordUserId }, select: { achievementKey: true, unlockedAt: true }, orderBy: { unlockedAt: 'asc' } }).then((rows) => rows.map((row) => ({ key: row.achievementKey, unlockedAt: row.unlockedAt })));
  }

  async unlock(guildId: string, discordUserId: string, keys: string[]): Promise<string[]> {
    if (!keys.length) return [];
    await this.getOrCreate(guildId, discordUserId);
    const existing = new Set((await this.achievements(guildId, discordUserId)).map((row) => row.key));
    const newKeys = keys.filter((key) => !existing.has(key));
    if (!newKeys.length) return [];
    await this.prisma.discordMemberAchievement.createMany({ data: newKeys.map((achievementKey) => ({ guildId, discordUserId, achievementKey })), skipDuplicates: true });
    return newKeys;
  }

  private async reconcileLevel(guildId: string, discordUserId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "DiscordMemberProgression"
      SET "level" = GREATEST(1, FLOOR(SQRT("xp"::numeric / 100))::integer + 1)
      WHERE "guildId" = ${guildId} AND "discordUserId" = ${discordUserId}`;
  }
}
