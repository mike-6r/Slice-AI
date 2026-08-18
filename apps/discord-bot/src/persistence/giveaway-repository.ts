import { DiscordGiveawayStatus, Prisma, PrismaClient } from '../../generated/prisma/index.js';
import { GiveawayValidationError, selectGiveawayWinners } from '../giveaways.js';

export type GiveawayWinner = { discordUserId: string; selectionType: 'ORIGINAL' | 'REROLL'; rerollSequence: number; selectedAt: Date; selectedByDiscordId: string };
export type Giveaway = { id: string; guildId: string; channelId: string | null; messageId: string | null; createdByDiscordUserId: string; title: string; description: string | null; startsAt: Date; endsAt: Date; status: 'OPEN' | 'ENDING' | 'ENDED' | 'CANCELLED'; winnerCount: number; endedAt: Date | null; endedByDiscordUserId: string | null; cancelledAt: Date | null; cancelledByDiscordUserId: string | null; completionAnnouncedAt: Date | null; entryCount: number; winners: GiveawayWinner[] };
export type GiveawayCompletion = { giveaway: Giveaway; completedNow: boolean };
export type GiveawayEntryResult = 'ENTERED' | 'ALREADY_ENTERED' | 'UNAVAILABLE';

const giveawayInclude = { winners: { orderBy: [{ selectionType: 'asc' }, { rerollSequence: 'asc' }, { selectedAt: 'asc' }] }, _count: { select: { entries: true } } } satisfies Prisma.DiscordGiveawayInclude;

export class PrismaGiveawayRepository {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date(), private readonly choose: (entrants: readonly string[], requested: number) => string[] = selectGiveawayWinners) {}

  async create(input: { guildId: string; createdByDiscordUserId: string; title: string; description?: string; endsAt: Date; winnerCount: number }): Promise<Giveaway> {
    if (input.winnerCount < 1) throw new GiveawayValidationError('Winner count must be at least one.');
    if (input.endsAt <= this.now()) throw new GiveawayValidationError('Giveaway end time must be in the future.');
    const row = await this.prisma.$transaction(async (db) => {
      const created = await db.discordGiveaway.create({ data: input });
      await db.discordGiveawayAuditEvent.create({ data: { giveawayId: created.id, action: 'CREATED', actorDiscordId: input.createdByDiscordUserId } });
      return db.discordGiveaway.findUniqueOrThrow({ where: { id: created.id }, include: giveawayInclude });
    });
    return mapGiveaway(row);
  }

  async attachMessage(id: string, guildId: string, channelId: string, messageId: string): Promise<Giveaway> {
    const updated = await this.prisma.discordGiveaway.updateMany({ where: { id, guildId }, data: { channelId, messageId } });
    if (updated.count !== 1) throw new GiveawayValidationError('Giveaway is unavailable.');
    return (await this.get(id, guildId))!;
  }

  async get(id: string, guildId: string): Promise<Giveaway | null> {
    const row = await this.prisma.discordGiveaway.findFirst({ where: { id, guildId }, include: giveawayInclude });
    return row ? mapGiveaway(row) : null;
  }

  async enter(id: string, guildId: string, discordUserId: string): Promise<GiveawayEntryResult> {
    return this.prisma.$transaction(async (db) => {
      const giveaway = await lockGiveaway(db, id, guildId);
      if (!giveaway || giveaway.status !== DiscordGiveawayStatus.OPEN || giveaway.endsAt <= this.now()) return 'UNAVAILABLE';
      try {
        await db.discordGiveawayEntry.create({ data: { giveawayId: id, discordUserId } });
        return 'ENTERED';
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'ALREADY_ENTERED';
        throw error;
      }
    });
  }

  async complete(id: string, guildId: string, actorDiscordId: string, automatic: boolean): Promise<GiveawayCompletion | null> {
    const now = this.now();
    return this.prisma.$transaction(async (db) => {
      const claimed = await db.discordGiveaway.updateMany({ where: { id, guildId, status: DiscordGiveawayStatus.OPEN, ...(automatic ? { endsAt: { lte: now } } : {}) }, data: { status: DiscordGiveawayStatus.ENDING } });
      if (claimed.count !== 1) {
        const existing = await db.discordGiveaway.findFirst({ where: { id, guildId }, include: giveawayInclude });
        return existing ? { giveaway: mapGiveaway(existing), completedNow: false } : null;
      }
      const entries = await db.discordGiveawayEntry.findMany({ where: { giveawayId: id }, select: { discordUserId: true } });
      const winnerIds = entries.length ? this.choose(entries.map((entry) => entry.discordUserId), Math.min((await db.discordGiveaway.findUniqueOrThrow({ where: { id }, select: { winnerCount: true } })).winnerCount, entries.length)) : [];
      if (winnerIds.length) await db.discordGiveawayWinner.createMany({ data: winnerIds.map((discordUserId) => ({ giveawayId: id, discordUserId, selectionType: 'ORIGINAL', rerollSequence: 0, selectedAt: now, selectedByDiscordId: actorDiscordId })) });
      await db.discordGiveaway.update({ where: { id }, data: { status: DiscordGiveawayStatus.ENDED, endedAt: now, endedByDiscordUserId: actorDiscordId } });
      await db.discordGiveawayAuditEvent.create({ data: { giveawayId: id, action: automatic ? 'ENDED_AUTOMATICALLY' : 'ENDED_MANUALLY', actorDiscordId, details: { entrantCount: entries.length, winnerCount: winnerIds.length } } });
      return { giveaway: mapGiveaway(await db.discordGiveaway.findUniqueOrThrow({ where: { id }, include: giveawayInclude })), completedNow: true };
    });
  }

  /** Rerolls exclude every prior winner to preserve a fair community contract. */
  async reroll(id: string, guildId: string, actorDiscordId: string, requested: number, reason?: string): Promise<Giveaway> {
    const now = this.now();
    return this.prisma.$transaction(async (db) => {
      const giveaway = await lockGiveaway(db, id, guildId);
      if (!giveaway || giveaway.status !== DiscordGiveawayStatus.ENDED) throw new GiveawayValidationError('Only a completed giveaway can be rerolled.');
      const [entries, prior, latest] = await Promise.all([
        db.discordGiveawayEntry.findMany({ where: { giveawayId: id }, select: { discordUserId: true } }),
        db.discordGiveawayWinner.findMany({ where: { giveawayId: id }, select: { discordUserId: true } }),
        db.discordGiveawayWinner.findFirst({ where: { giveawayId: id, selectionType: 'REROLL' }, orderBy: { rerollSequence: 'desc' }, select: { rerollSequence: true } }),
      ]);
      const priorIds = new Set(prior.map((winner) => winner.discordUserId));
      const eligible = entries.map((entry) => entry.discordUserId).filter((discordUserId) => !priorIds.has(discordUserId));
      const winnerIds = this.choose(eligible, requested);
      const rerollSequence = (latest?.rerollSequence ?? 0) + 1;
      await db.discordGiveawayWinner.createMany({ data: winnerIds.map((discordUserId) => ({ giveawayId: id, discordUserId, selectionType: 'REROLL', rerollSequence, selectedAt: now, selectedByDiscordId: actorDiscordId })) });
      await db.discordGiveawayAuditEvent.create({ data: { giveawayId: id, action: 'REROLLED', actorDiscordId, details: reason ? { rerollSequence, winnerCount: winnerIds.length, reason } : { rerollSequence, winnerCount: winnerIds.length } } });
      return mapGiveaway(await db.discordGiveaway.findUniqueOrThrow({ where: { id }, include: giveawayInclude }));
    });
  }

  async cancel(id: string, guildId: string, actorDiscordId: string): Promise<{ giveaway: Giveaway; cancelledNow: boolean } | null> {
    const now = this.now();
    return this.prisma.$transaction(async (db) => {
      const giveaway = await lockGiveaway(db, id, guildId);
      if (!giveaway) return null;
      if (giveaway.status !== DiscordGiveawayStatus.OPEN) return { giveaway: mapGiveaway(await db.discordGiveaway.findUniqueOrThrow({ where: { id }, include: giveawayInclude })), cancelledNow: false };
      await db.discordGiveaway.update({ where: { id }, data: { status: DiscordGiveawayStatus.CANCELLED, cancelledAt: now, cancelledByDiscordUserId: actorDiscordId } });
      await db.discordGiveawayAuditEvent.create({ data: { giveawayId: id, action: 'CANCELLED', actorDiscordId } });
      return { giveaway: mapGiveaway(await db.discordGiveaway.findUniqueOrThrow({ where: { id }, include: giveawayInclude })), cancelledNow: true };
    });
  }

  async due(limit = 100): Promise<Giveaway[]> { return (await this.prisma.discordGiveaway.findMany({ where: { status: DiscordGiveawayStatus.OPEN, endsAt: { lte: this.now() } }, orderBy: { endsAt: 'asc' }, take: limit, include: giveawayInclude })).map(mapGiveaway); }
  async pendingCompletionAnnouncements(limit = 100): Promise<Giveaway[]> { return (await this.prisma.discordGiveaway.findMany({ where: { status: DiscordGiveawayStatus.ENDED, completionAnnouncedAt: null }, orderBy: { endedAt: 'asc' }, take: limit, include: giveawayInclude })).map(mapGiveaway); }
  async claimCompletionAnnouncement(id: string, now = this.now()): Promise<boolean> { const staleBefore = new Date(now.getTime() - 5 * 60_000); const result = await this.prisma.discordGiveaway.updateMany({ where: { id, status: DiscordGiveawayStatus.ENDED, completionAnnouncedAt: null, OR: [{ completionAnnouncementClaimedAt: null }, { completionAnnouncementClaimedAt: { lt: staleBefore } }] }, data: { completionAnnouncementClaimedAt: now } }); return result.count === 1; }
  async finishCompletionAnnouncement(id: string): Promise<void> { await this.prisma.discordGiveaway.update({ where: { id }, data: { completionAnnouncedAt: this.now(), completionAnnouncementClaimedAt: null } }); }
  async releaseCompletionAnnouncement(id: string): Promise<void> { await this.prisma.discordGiveaway.updateMany({ where: { id, completionAnnouncedAt: null }, data: { completionAnnouncementClaimedAt: null } }); }
}

async function lockGiveaway(db: Prisma.TransactionClient, id: string, guildId: string) {
  await db.$queryRaw`SELECT "id" FROM "DiscordGiveaway" WHERE "id" = ${id} AND "guildId" = ${guildId} FOR UPDATE`;
  return db.discordGiveaway.findFirst({ where: { id, guildId } });
}

function mapGiveaway(row: { id: string; guildId: string; channelId: string | null; messageId: string | null; createdByDiscordUserId: string; title: string; description: string | null; startsAt: Date; endsAt: Date; status: string; winnerCount: number; endedAt: Date | null; endedByDiscordUserId: string | null; cancelledAt: Date | null; cancelledByDiscordUserId: string | null; completionAnnouncedAt: Date | null; winners: Array<{ discordUserId: string; selectionType: string; rerollSequence: number; selectedAt: Date; selectedByDiscordId: string }>; _count: { entries: number } }): Giveaway {
  return { ...row, status: row.status as Giveaway['status'], entryCount: row._count.entries, winners: row.winners.map((winner) => ({ ...winner, selectionType: winner.selectionType as GiveawayWinner['selectionType'] })) };
}
