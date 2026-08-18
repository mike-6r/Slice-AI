import { PrismaClient } from '../../generated/prisma/index.js';

export type Suggestion = { id: string; guildId: string; referenceNumber: number; creatorDiscordUserId: string; content: string; status: string; messageId: string | null; channelId: string | null; createdAt: Date };
export type Poll = { id: string; guildId: string; creatorDiscordUserId: string; question: string; options: string[]; status: string; closesAt: Date | null; messageId: string | null; channelId: string | null };
export class PrismaCommunityRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async createSuggestion(guildId: string, creatorDiscordUserId: string, content: string): Promise<Suggestion> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (db) => {
          const latest = await db.discordSuggestion.findFirst({ where: { guildId }, orderBy: { referenceNumber: 'desc' }, select: { referenceNumber: true } });
          return mapSuggestion(await db.discordSuggestion.create({ data: { guildId, creatorDiscordUserId, content, referenceNumber: (latest?.referenceNumber ?? 0) + 1 } }));
        });
      } catch (error) {
        if (!isUniqueConstraint(error) || attempt === 2) throw error;
      }
    }
    throw new Error('Suggestion reference allocation failed.');
  }
  async attachSuggestion(id: string, channelId: string, messageId: string): Promise<Suggestion> { return mapSuggestion(await this.prisma.discordSuggestion.update({ where: { id }, data: { channelId, messageId } })); }
  async suggestion(id: string): Promise<Suggestion | null> { const row = await this.prisma.discordSuggestion.findUnique({ where: { id } }); return row ? mapSuggestion(row) : null; }
  async suggestionByReference(guildId: string, referenceNumber: number): Promise<Suggestion | null> { const row = await this.prisma.discordSuggestion.findUnique({ where: { guildId_referenceNumber: { guildId, referenceNumber } } }); return row ? mapSuggestion(row) : null; }
  async suggestionVote(id: string, userId: string, value: number): Promise<void> { await this.prisma.discordSuggestionVote.upsert({ where: { suggestionId_discordUserId: { suggestionId: id, discordUserId: userId } }, create: { suggestionId: id, discordUserId: userId, value }, update: { value } }); }
  async suggestionCounts(id: string): Promise<{ up: number; down: number }> { const rows = await this.prisma.discordSuggestionVote.groupBy({ by: ['value'], where: { suggestionId: id }, _count: true }); return { up: rows.find((row) => row.value === 1)?._count ?? 0, down: rows.find((row) => row.value === -1)?._count ?? 0 }; }
  async setSuggestionStatus(id: string, status: string): Promise<Suggestion> { return mapSuggestion(await this.prisma.discordSuggestion.update({ where: { id }, data: { status } })); }
  async createPoll(guildId: string, creatorDiscordUserId: string, question: string, options: string[], closesAt: Date | null): Promise<Poll> { return mapPoll(await this.prisma.discordPoll.create({ data: { guildId, creatorDiscordUserId, question, options, closesAt } })); }
  async attachPoll(id: string, channelId: string, messageId: string): Promise<Poll> { return mapPoll(await this.prisma.discordPoll.update({ where: { id }, data: { channelId, messageId } })); }
  async poll(id: string): Promise<Poll | null> { const row = await this.prisma.discordPoll.findUnique({ where: { id } }); return row ? mapPoll(row) : null; }
  async pollVote(id: string, userId: string, optionIndex: number): Promise<Poll | null> { const poll = await this.poll(id); if (!poll || poll.status !== 'OPEN' || poll.closesAt && poll.closesAt <= new Date() || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) return null; await this.prisma.discordPollVote.upsert({ where: { pollId_discordUserId: { pollId: id, discordUserId: userId } }, create: { pollId: id, discordUserId: userId, optionIndex }, update: { optionIndex } }); return this.poll(id); }
  async pollCounts(id: string, options: number): Promise<number[]> { const rows = await this.prisma.discordPollVote.groupBy({ by: ['optionIndex'], where: { pollId: id }, _count: true }); return Array.from({ length: options }, (_, index) => rows.find((row) => row.optionIndex === index)?._count ?? 0); }
  async closeDuePolls(): Promise<Poll[]> {
    const rows = await this.prisma.discordPoll.findMany({ where: { status: 'OPEN', closesAt: { lte: new Date() } } });
    const closed = await Promise.all(rows.map(async (row) => {
      const changed = await this.prisma.discordPoll.updateMany({ where: { id: row.id, status: 'OPEN' }, data: { status: 'CLOSED' } });
      return changed.count === 1 ? mapPoll({ ...row, status: 'CLOSED' }) : null;
    }));
    return closed.filter((poll): poll is Poll => poll !== null);
  }
  async setBirthday(guildId: string, discordUserId: string, month: number, day: number): Promise<void> { await this.prisma.discordBirthday.upsert({ where: { guildId_discordUserId: { guildId, discordUserId } }, create: { guildId, discordUserId, month, day }, update: { month, day } }); }
  async birthday(guildId: string, discordUserId: string) { return this.prisma.discordBirthday.findUnique({ where: { guildId_discordUserId: { guildId, discordUserId } } }); }
  async removeBirthday(guildId: string, discordUserId: string): Promise<void> { await this.prisma.discordBirthday.deleteMany({ where: { guildId, discordUserId } }); }
  async birthdays(guildId: string, month: number, day: number) { return this.prisma.discordBirthday.findMany({ where: { guildId, month, day } }); }
  async markBirthdayAnnounced(guildId: string, discordUserId: string, dayKey: string): Promise<boolean> { const changed = await this.prisma.discordBirthday.updateMany({ where: { guildId, discordUserId, OR: [{ lastAnnouncedOn: null }, { lastAnnouncedOn: { not: dayKey } }] }, data: { lastAnnouncedOn: dayKey } }); return changed.count === 1; }
  async claimSchedule(guildId: string, scheduleKey: string, periodKey: string): Promise<boolean> { const now = new Date(); const rows = await this.prisma.$queryRaw<Array<{ guildId: string }>>`
    INSERT INTO "DiscordCommunityScheduleState" ("guildId", "scheduleKey", "lastPeriodKey", "lastPostedAt", "updatedAt")
    VALUES (${guildId}, ${scheduleKey}, ${periodKey}, ${now}, ${now})
    ON CONFLICT ("guildId", "scheduleKey") DO UPDATE SET "lastPeriodKey" = EXCLUDED."lastPeriodKey", "lastPostedAt" = EXCLUDED."lastPostedAt", "updatedAt" = EXCLUDED."updatedAt"
    WHERE "DiscordCommunityScheduleState"."lastPeriodKey" <> ${periodKey}
    RETURNING "guildId"`;
    return rows.length === 1;
  }
}
function mapSuggestion(row: { id:string; guildId:string; referenceNumber:number; creatorDiscordUserId:string; content:string; status:string; messageId:string|null; channelId:string|null; createdAt:Date }): Suggestion { return row; }
function mapPoll(row: { id:string; guildId:string; creatorDiscordUserId:string; question:string; options: unknown; status:string; closesAt:Date|null; messageId:string|null; channelId:string|null }): Poll { return { ...row, options: row.options as string[] }; }
function isUniqueConstraint(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'; }
