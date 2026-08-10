import { PrismaClient } from '@prisma/client';
import { OutboxWriter } from '../src/modules/outbox/application/outbox-writer.service';
import { createDomainEvent } from '../src/modules/outbox/domain/domain-event';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `outbox-i-${Date.now()}`;
const writer = new OutboxWriter();

const event = (id: string, occurredAt: Date) => createDomainEvent({
  eventId: id,
  eventType: 'asset.listed',
  schemaVersion: 1,
  occurredAt,
  aggregate: { type: 'asset', id: `${run}-asset` },
  correlationId: `${run}-correlation`,
  payload: { assetId: `${run}-asset`, state: 'PUBLISHED' },
});

describe('Document 017 transactional outbox foundation', () => {
  beforeAll(async () => { await db.$connect(); await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } }); });
  afterAll(async () => { await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } }); await db.$disconnect(); });

  it('appends idempotently inside a transaction and returns pending events in deterministic order', async () => {
    const later = event(`${run}-later`, new Date('2030-01-01T00:00:00.000Z'));
    const earlier = event(`${run}-earlier`, new Date('2020-01-01T00:00:00.000Z'));
    await db.$transaction(async (tx) => {
      const first = await writer.append(tx, later);
      const replay = await writer.append(tx, later);
      expect(replay.id).toBe(first.id);
      await writer.append(tx, earlier);
    });
    expect(await db.outboxEvent.count({ where: { eventId: later.eventId } })).toBe(1);
    const scoped = await db.outboxEvent.findMany({
      where: { eventId: { in: [earlier.eventId, later.eventId] } },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(scoped.map((row) => row.eventId)).toEqual([earlier.eventId, later.eventId]);
    expect(scoped.every((row) => row.status === 'PENDING')).toBe(true);
  });

  it('leaves no orphan event when its enclosing transaction rolls back', async () => {
    const rollback = event(`${run}-rollback`, new Date());
    await expect(db.$transaction(async (tx) => {
      await writer.append(tx, rollback);
      throw new Error('INJECTED_OUTBOX_ROLLBACK');
    })).rejects.toThrow('INJECTED_OUTBOX_ROLLBACK');
    expect(await writer.getByEventId(db as never, rollback.eventId)).toBeNull();
  });
});
