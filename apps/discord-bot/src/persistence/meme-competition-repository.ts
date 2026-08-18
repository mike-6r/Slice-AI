import { randomInt } from 'node:crypto';
import { DiscordMemeCompetitionAuditAction, DiscordMemeCompetitionStatus, Prisma, PrismaClient } from '../../generated/prisma/index.js';
import { MEME_COMPETITION_SYSTEM_ACTOR, MemeCompetitionValidationError, selectMemeWinner, type MemeVoteTally } from '../meme-competition.js';

export type MemeSubmission = { id: string; guildId: string; channelId: string; messageId: string; discordUserId: string; submittedAt: Date; invalidatedAt: Date | null; invalidReason: string | null; finalVoteCount: number | null };
export type MemeAward = { recipientDiscordUserId: string; xpAmount: number; awardedAt: Date };
export type MemeCompetition = { id: string; guildId: string; channelId: string; periodKey: string; announcementMessageId: string | null; startsAt: Date; endsAt: Date; status: 'OPEN' | 'CLOSING' | 'CLOSED' | 'AWARDED' | 'CANCELLED'; rewardXp: number; winnerDiscordUserId: string | null; winningSubmissionId: string | null; closedAt: Date | null; awardedAt: Date | null; resultAnnouncedAt: Date | null; submissions: MemeSubmission[]; award: MemeAward | null };
export type MemeCompletion = { competition: MemeCompetition; closedNow: boolean };
export type MemeSubmissionRegistration = 'REGISTERED' | 'DUPLICATE_MESSAGE' | 'ALREADY_SUBMITTED' | 'UNAVAILABLE';

const includeCompetition = { submissions: { orderBy: { submittedAt: 'asc' } }, award: true } satisfies Prisma.DiscordMemeCompetitionInclude;
const staleClaimMs = 5 * 60_000;

export class PrismaMemeCompetitionRepository {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date(), private readonly choose: (maxExclusive: number) => number = randomInt) {}

  async openWeekly(input: { guildId: string; channelId: string; periodKey: string; startsAt: Date; endsAt: Date; rewardXp: number }): Promise<{ competition: MemeCompetition; created: boolean }> {
    if (input.endsAt <= input.startsAt || input.rewardXp < 1) throw new MemeCompetitionValidationError('The weekly meme competition timing or XP reward is invalid.');
    try {
      const competition = await this.prisma.$transaction(async (db) => {
        const created = await db.discordMemeCompetition.create({ data: input });
        await db.discordMemeCompetitionAuditEvent.create({ data: { competitionId: created.id, action: DiscordMemeCompetitionAuditAction.OPENED, actorDiscordId: MEME_COMPETITION_SYSTEM_ACTOR, details: { periodKey: input.periodKey, rewardXp: input.rewardXp } } });
        return db.discordMemeCompetition.findUniqueOrThrow({ where: { id: created.id }, include: includeCompetition });
      });
      return { competition: mapCompetition(competition), created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.discordMemeCompetition.findUnique({ where: { guildId_periodKey: { guildId: input.guildId, periodKey: input.periodKey } }, include: includeCompetition });
      if (!existing) throw error;
      return { competition: mapCompetition(existing), created: false };
    }
  }

  async attachAnnouncementMessage(id: string, messageId: string): Promise<void> { await this.prisma.discordMemeCompetition.update({ where: { id }, data: { announcementMessageId: messageId } }); }
  async get(id: string, guildId: string): Promise<MemeCompetition | null> { const row = await this.prisma.discordMemeCompetition.findFirst({ where: { id, guildId }, include: includeCompetition }); return row ? mapCompetition(row) : null; }
  async active(guildId: string): Promise<MemeCompetition | null> { const row = await this.prisma.discordMemeCompetition.findFirst({ where: { guildId, status: { in: [DiscordMemeCompetitionStatus.OPEN, DiscordMemeCompetitionStatus.CLOSING] } }, orderBy: { startsAt: 'desc' }, include: includeCompetition }); return row ? mapCompetition(row) : null; }

  async registerSubmission(input: { competitionId: string; guildId: string; channelId: string; messageId: string; discordUserId: string }): Promise<MemeSubmissionRegistration> {
    return this.prisma.$transaction(async (db) => {
      const competition = await lockCompetition(db, input.competitionId, input.guildId);
      if (!competition || competition.status !== DiscordMemeCompetitionStatus.OPEN || competition.startsAt > this.now() || competition.endsAt <= this.now() || competition.channelId !== input.channelId) return 'UNAVAILABLE';
      if (await db.discordMemeSubmission.findUnique({ where: { messageId: input.messageId }, select: { id: true } })) return 'DUPLICATE_MESSAGE';
      if (await db.discordMemeSubmission.findUnique({ where: { competitionId_discordUserId: { competitionId: input.competitionId, discordUserId: input.discordUserId } }, select: { id: true } })) return 'ALREADY_SUBMITTED';
      try {
        await db.discordMemeSubmission.create({ data: input });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          if (await db.discordMemeSubmission.findUnique({ where: { messageId: input.messageId }, select: { id: true } })) return 'DUPLICATE_MESSAGE';
          return 'ALREADY_SUBMITTED';
        }
        throw error;
      }
      await db.discordMemeCompetitionAuditEvent.create({ data: { competitionId: input.competitionId, action: DiscordMemeCompetitionAuditAction.SUBMISSION_REGISTERED, actorDiscordId: input.discordUserId, details: { messageId: input.messageId } } });
      return 'REGISTERED';
    });
  }

  async due(limit = 50): Promise<MemeCompetition[]> {
    const now = this.now();
    return (await this.prisma.discordMemeCompetition.findMany({ where: { OR: [{ status: DiscordMemeCompetitionStatus.OPEN, endsAt: { lte: now } }, { status: DiscordMemeCompetitionStatus.CLOSING, closingClaimedAt: { lte: new Date(now.getTime() - staleClaimMs) } }] }, orderBy: { endsAt: 'asc' }, take: limit, include: includeCompetition })).map(mapCompetition);
  }

  async claimClose(id: string, guildId: string, automatic: boolean): Promise<MemeCompetition | null> {
    const now = this.now();
    const staleBefore = new Date(now.getTime() - staleClaimMs);
    const claimed = await this.prisma.discordMemeCompetition.updateMany({
      where: {
        id, guildId,
        OR: [
          { status: DiscordMemeCompetitionStatus.OPEN, ...(automatic ? { endsAt: { lte: now } } : {}) },
          ...(automatic ? [{ status: DiscordMemeCompetitionStatus.CLOSING, closingClaimedAt: { lte: staleBefore } }] : [])
        ]
      },
      data: { status: DiscordMemeCompetitionStatus.CLOSING, closingClaimedAt: now }
    });
    return claimed.count === 1 ? this.get(id, guildId) : null;
  }

  async finalize(id: string, guildId: string, actorDiscordId: string, automatic: boolean, tallies: readonly MemeVoteTally[]): Promise<MemeCompletion | null> {
    const now = this.now();
    return this.prisma.$transaction(async (db) => {
      const competition = await lockCompetitionWithDetails(db, id, guildId);
      if (!competition) return null;
      if (competition.status !== DiscordMemeCompetitionStatus.CLOSING) return { competition: mapCompetition(competition), closedNow: false };
      const tallyBySubmission = new Map(tallies.map((tally) => [tally.submissionId, tally]));
      const candidates = [] as Array<{ submissionId: string; discordUserId: string; voteCount: number }>;
      for (const submission of competition.submissions) {
        const tally = tallyBySubmission.get(submission.id);
        if (!tally?.valid) {
          await db.discordMemeSubmission.update({ where: { id: submission.id }, data: { invalidatedAt: now, invalidReason: tally?.invalidReason ?? 'Message unavailable at close' } });
          continue;
        }
        await db.discordMemeSubmission.update({ where: { id: submission.id }, data: { finalVoteCount: tally.voteCount, invalidatedAt: null, invalidReason: null } });
        candidates.push({ submissionId: submission.id, discordUserId: submission.discordUserId, voteCount: tally.voteCount });
      }
      const winner = selectMemeWinner(candidates, this.choose);
      const closingAction = automatic ? DiscordMemeCompetitionAuditAction.CLOSED_AUTOMATICALLY : DiscordMemeCompetitionAuditAction.CLOSED_MANUALLY;
      if (!winner) {
        await db.discordMemeCompetition.update({ where: { id }, data: { status: DiscordMemeCompetitionStatus.CLOSED, closedAt: now, closingClaimedAt: null } });
        await db.discordMemeCompetitionAuditEvent.create({ data: { competitionId: id, action: closingAction, actorDiscordId, details: { validSubmissionCount: 0 } } });
        return { competition: mapCompetition(await db.discordMemeCompetition.findUniqueOrThrow({ where: { id }, include: includeCompetition })), closedNow: true };
      }
      await db.discordMemeAward.create({ data: { competitionId: id, recipientDiscordUserId: winner.discordUserId, xpAmount: competition.rewardXp, awardedAt: now } });
      const progression = await db.discordMemberProgression.upsert({ where: { guildId_discordUserId: { guildId, discordUserId: winner.discordUserId } }, create: { guildId, discordUserId: winner.discordUserId, xp: competition.rewardXp, level: levelForXp(competition.rewardXp) }, update: { xp: { increment: competition.rewardXp } } });
      await db.discordMemberProgression.update({ where: { guildId_discordUserId: { guildId, discordUserId: winner.discordUserId } }, data: { level: levelForXp(progression.xp) } });
      await db.discordMemeCompetition.update({ where: { id }, data: { status: DiscordMemeCompetitionStatus.AWARDED, winnerDiscordUserId: winner.discordUserId, winningSubmissionId: winner.submissionId, closedAt: now, awardedAt: now, closingClaimedAt: null } });
      await db.discordMemeCompetitionAuditEvent.createMany({ data: [
        { competitionId: id, action: closingAction, actorDiscordId, details: { validSubmissionCount: candidates.length } },
        { competitionId: id, action: DiscordMemeCompetitionAuditAction.WINNER_SELECTED, actorDiscordId, details: { submissionId: winner.submissionId, voteCount: winner.voteCount, tieBreak: candidates.filter((candidate) => candidate.voteCount === winner.voteCount).length > 1 ? 'secure-random' : 'not-needed' } },
        { competitionId: id, action: DiscordMemeCompetitionAuditAction.XP_AWARDED, actorDiscordId, details: { recipientDiscordUserId: winner.discordUserId, xpAmount: competition.rewardXp } }
      ] });
      return { competition: mapCompetition(await db.discordMemeCompetition.findUniqueOrThrow({ where: { id }, include: includeCompetition })), closedNow: true };
    });
  }

  async cancel(id: string, guildId: string, actorDiscordId: string): Promise<MemeCompetition | null> {
    return this.prisma.$transaction(async (db) => {
      const competition = await lockCompetitionWithDetails(db, id, guildId);
      if (!competition || competition.status !== DiscordMemeCompetitionStatus.OPEN) return null;
      await db.discordMemeCompetition.update({ where: { id }, data: { status: DiscordMemeCompetitionStatus.CANCELLED, closedAt: this.now() } });
      await db.discordMemeCompetitionAuditEvent.create({ data: { competitionId: id, action: DiscordMemeCompetitionAuditAction.CANCELLED, actorDiscordId } });
      return mapCompetition(await db.discordMemeCompetition.findUniqueOrThrow({ where: { id }, include: includeCompetition }));
    });
  }

  async pendingOpenAnnouncements(limit = 50): Promise<MemeCompetition[]> { return (await this.prisma.discordMemeCompetition.findMany({ where: { status: DiscordMemeCompetitionStatus.OPEN, announcementMessageId: null }, orderBy: { startsAt: 'asc' }, take: limit, include: includeCompetition })).map(mapCompetition); }
  async pendingResultAnnouncements(limit = 50): Promise<MemeCompetition[]> { return (await this.prisma.discordMemeCompetition.findMany({ where: { status: { in: [DiscordMemeCompetitionStatus.CLOSED, DiscordMemeCompetitionStatus.AWARDED] }, resultAnnouncedAt: null }, orderBy: { closedAt: 'asc' }, take: limit, include: includeCompetition })).map(mapCompetition); }
  async claimResultAnnouncement(id: string): Promise<boolean> { const now = this.now(); const staleBefore = new Date(now.getTime() - staleClaimMs); const changed = await this.prisma.discordMemeCompetition.updateMany({ where: { id, status: { in: [DiscordMemeCompetitionStatus.CLOSED, DiscordMemeCompetitionStatus.AWARDED] }, resultAnnouncedAt: null, OR: [{ resultAnnouncementClaimedAt: null }, { resultAnnouncementClaimedAt: { lte: staleBefore } }] }, data: { resultAnnouncementClaimedAt: now } }); return changed.count === 1; }
  async finishResultAnnouncement(id: string): Promise<void> { await this.prisma.discordMemeCompetition.update({ where: { id }, data: { resultAnnouncedAt: this.now(), resultAnnouncementClaimedAt: null } }); }
  async releaseResultAnnouncement(id: string): Promise<void> { await this.prisma.discordMemeCompetition.updateMany({ where: { id, resultAnnouncedAt: null }, data: { resultAnnouncementClaimedAt: null } }); }
}

async function lockCompetition(db: Prisma.TransactionClient, id: string, guildId: string) {
  await db.$queryRaw`SELECT "id" FROM "DiscordMemeCompetition" WHERE "id" = ${id} AND "guildId" = ${guildId} FOR UPDATE`;
  return db.discordMemeCompetition.findFirst({ where: { id, guildId } });
}

async function lockCompetitionWithDetails(db: Prisma.TransactionClient, id: string, guildId: string) {
  await db.$queryRaw`SELECT "id" FROM "DiscordMemeCompetition" WHERE "id" = ${id} AND "guildId" = ${guildId} FOR UPDATE`;
  return db.discordMemeCompetition.findFirst({ where: { id, guildId }, include: includeCompetition });
}

function levelForXp(xp: number): number { return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1); }
function mapCompetition(row: { id: string; guildId: string; channelId: string; periodKey: string; announcementMessageId: string | null; startsAt: Date; endsAt: Date; status: string; rewardXp: number; winnerDiscordUserId: string | null; winningSubmissionId: string | null; closedAt: Date | null; awardedAt: Date | null; resultAnnouncedAt: Date | null; submissions: Array<{ id: string; guildId: string; channelId: string; messageId: string; discordUserId: string; submittedAt: Date; invalidatedAt: Date | null; invalidReason: string | null; finalVoteCount: number | null }>; award: { recipientDiscordUserId: string; xpAmount: number; awardedAt: Date } | null }): MemeCompetition {
  return { ...row, status: row.status as MemeCompetition['status'], submissions: row.submissions.map((submission) => ({ ...submission })), award: row.award ? { ...row.award } : null };
}
