import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/index.js';
import { processDueGiveaways } from '../../src/giveaway-worker.js';
import { PrismaGiveawayRepository } from '../../src/persistence/giveaway-repository.js';
import { testDatabaseUrl } from '../test-database-url.js';

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const prefix = `giveaway-test-${Date.now()}`;
const ids: string[] = [];
const repository = new PrismaGiveawayRepository(prisma, () => new Date(), (entrants, count) => entrants.slice(0, count));

async function create(overrides: Partial<{ endsAt: Date; winnerCount: number }> = {}) {
  const giveaway = await repository.create({ guildId: `${prefix}-guild`, createdByDiscordUserId: 'admin', title: 'Community prize', description: 'No purchase required.', endsAt: overrides.endsAt ?? new Date(Date.now() + 3_600_000), winnerCount: overrides.winnerCount ?? 1 });
  ids.push(giveaway.id);
  return giveaway;
}

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { if (ids.length) await prisma.discordGiveaway.deleteMany({ where: { id: { in: ids } } }); await prisma.$disconnect(); });

describe('Prisma giveaway lifecycle authority', () => {
  it('persists a giveaway and permits one idempotent entry per member under concurrent clicks', async () => {
    const giveaway = await create();
    const results = await Promise.all([repository.enter(giveaway.id, giveaway.guildId, 'member-a'), repository.enter(giveaway.id, giveaway.guildId, 'member-a')]);
    expect(results.sort()).toEqual(['ALREADY_ENTERED', 'ENTERED']);
    expect(await prisma.discordGiveawayEntry.count({ where: { giveawayId: giveaway.id, discordUserId: 'member-a' } })).toBe(1);
  });

  it('handles a worker/admin end race exactly once from persisted arbitrary entrants', async () => {
    const giveaway = await create({ winnerCount: 2 });
    await Promise.all(['member-z', 'member-a', 'member-k'].map((member) => repository.enter(giveaway.id, giveaway.guildId, member)));
    await prisma.discordGiveaway.update({ where: { id: giveaway.id }, data: { endsAt: new Date(Date.now() - 1_000) } });
    const [first, second] = await Promise.all([repository.complete(giveaway.id, giveaway.guildId, 'admin', false), repository.complete(giveaway.id, giveaway.guildId, 'system:giveaway-worker', true)]);
    expect([first?.completedNow, second?.completedNow].filter(Boolean)).toHaveLength(1);
    const ended = await repository.get(giveaway.id, giveaway.guildId);
    expect(ended?.status).toBe('ENDED');
    const winners = ended?.winners.filter((winner) => winner.selectionType === 'ORIGINAL').map((winner) => winner.discordUserId) ?? [];
    expect(winners).toHaveLength(2);
    expect(new Set(winners).size).toBe(2);
    expect(winners.every((winner) => ['member-z', 'member-a', 'member-k'].includes(winner))).toBe(true);
    expect(await prisma.discordGiveawayAuditEvent.count({ where: { giveawayId: giveaway.id, action: { in: ['ENDED_MANUALLY', 'ENDED_AUTOMATICALLY'] } } })).toBe(1);
  });

  it('keeps a manual end idempotent and preserves its original winner set', async () => {
    const giveaway = await create();
    await repository.enter(giveaway.id, giveaway.guildId, 'member-a');
    const first = await repository.complete(giveaway.id, giveaway.guildId, 'admin', false);
    const second = await repository.complete(giveaway.id, giveaway.guildId, 'admin', false);
    expect(first?.completedNow).toBe(true);
    expect(second?.completedNow).toBe(false);
    expect(second?.giveaway.winners.filter((winner) => winner.selectionType === 'ORIGINAL').map((winner) => winner.discordUserId)).toEqual(['member-a']);
  });

  it('ends an empty giveaway cleanly without inventing winners', async () => {
    const giveaway = await create();
    const result = await repository.complete(giveaway.id, giveaway.guildId, 'admin', false);
    expect(result?.completedNow).toBe(true);
    expect(result?.giveaway.status).toBe('ENDED');
    expect(result?.giveaway.winners).toEqual([]);
  });

  it('worker scans a due giveaway once and safely publishes only through its callback', async () => {
    const giveaway = await create();
    await repository.enter(giveaway.id, giveaway.guildId, 'member-a');
    await prisma.discordGiveaway.update({ where: { id: giveaway.id }, data: { endsAt: new Date(Date.now() - 1_000) } });
    const published: string[] = [];
    const result = await processDueGiveaways(repository, async (row) => { published.push(row.id); return true; });
    expect(result.completed).toBe(1);
    expect(published).toContain(giveaway.id);
    expect((await repository.get(giveaway.id, giveaway.guildId))?.status).toBe('ENDED');
  });

  it('keeps original winners and records a reroll that excludes all prior winners', async () => {
    const giveaway = await create({ winnerCount: 1 });
    await Promise.all(['member-a', 'member-b', 'member-c'].map((member) => repository.enter(giveaway.id, giveaway.guildId, member)));
    await repository.complete(giveaway.id, giveaway.guildId, 'admin', false);
    const rerolled = await repository.reroll(giveaway.id, giveaway.guildId, 'admin', 1, 'Replacement winner');
    const originalWinners = rerolled.winners
      .filter((winner) => winner.selectionType === 'ORIGINAL')
      .map((winner) => winner.discordUserId);
    const rerollWinners = rerolled.winners
      .filter((winner) => winner.selectionType === 'REROLL')
      .map((winner) => winner.discordUserId);
    expect(originalWinners).toHaveLength(1);
    expect(rerollWinners).toHaveLength(1);
    expect(['member-a', 'member-b', 'member-c']).toContain(originalWinners[0]);
    expect(['member-a', 'member-b', 'member-c']).toContain(rerollWinners[0]);
    expect(rerollWinners[0]).not.toBe(originalWinners[0]);
    expect(await prisma.discordGiveawayAuditEvent.count({ where: { giveawayId: giveaway.id, action: 'REROLLED' } })).toBe(1);
  });

  it('cancels without hard deletion and rejects subsequent entries', async () => {
    const giveaway = await create();
    const cancelled = await repository.cancel(giveaway.id, giveaway.guildId, 'admin');
    expect(cancelled?.cancelledNow).toBe(true);
    expect((await repository.get(giveaway.id, giveaway.guildId))?.status).toBe('CANCELLED');
    expect(await repository.enter(giveaway.id, giveaway.guildId, 'member-a')).toBe('UNAVAILABLE');
    expect(await prisma.discordGiveawayAuditEvent.count({ where: { giveawayId: giveaway.id, action: 'CANCELLED' } })).toBe(1);
  });
});
