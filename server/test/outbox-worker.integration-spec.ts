import { PrismaClient } from '@prisma/client';
import { OutboxHandlerError, OutboxHandlerRegistry } from '../src/modules/outbox/application/outbox-handler';
import { OutboxWorkerRepository } from '../src/modules/outbox/application/outbox-worker.repository';
import { OutboxWorkerService, type OutboxWorkerConfig } from '../src/modules/outbox/application/outbox-worker.service';
import { setOutboxWorkerTestFailureHook } from '../src/modules/outbox/application/outbox-worker-test-failure-injection';
import { OutboxWriter } from '../src/modules/outbox/application/outbox-writer.service';
import { createDomainEvent } from '../src/modules/outbox/domain/domain-event';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `outbox-worker-i-${Date.now()}`;
const writer = new OutboxWriter();
const repository = new OutboxWorkerRepository(db as never);
const config: OutboxWorkerConfig = {
  outboxWorkerEnabled: false, outboxWorkerId: undefined, outboxPollIntervalMs: 1_000,
  outboxBatchSize: 10, outboxLeaseMs: 1_000, outboxMaxAttempts: 2,
  outboxRetryBaseMs: 100, outboxRetryMaxMs: 1_000,
};

let time = new Date('2000-01-01T00:00:00.000Z');
const event = (suffix: string, eventType = 'trade.completed', schemaVersion = 1) => createDomainEvent({
  eventId: `${run}-${suffix}`, eventType, schemaVersion,
  occurredAt: new Date('1999-01-01T00:00:00.000Z'),
  aggregate: { type: 'test-outbox', id: `${run}-aggregate` },
  payload: eventType === 'trade.completed'
    ? { executionId: `${run}-${suffix}`, assetId: `${run}-asset`, units: '1', priceMinor: '100', grossMinor: '100', currency: 'GBP' }
    : { reference: suffix },
});

const append = async (suffix: string, type?: string, version?: number) => db.$transaction((tx) => writer.append(tx, event(suffix, type, version)));
const worker = (
  registry = new OutboxHandlerRegistry(),
  workerId = 'worker-a',
  overrides: Partial<OutboxWorkerConfig> = {},
) => new OutboxWorkerService(
  repository, { ...config, outboxBatchSize: 1, ...overrides }, registry, { now: () => time, random: () => 0.5, workerId },
);

describe('Document 017 phase 2 outbox worker reliability', () => {
  beforeAll(async () => {
    await db.$connect();
    await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } });
  });
  beforeEach(async () => {
    time = new Date('2000-01-01T00:00:00.000Z');
    await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } });
  });
  afterEach(async () => {
    setOutboxWorkerTestFailureHook(undefined);
    await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } });
  });
  afterAll(async () => {
    setOutboxWorkerTestFailureHook(undefined);
    await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } });
    await db.$disconnect();
  });

  it('claims ordered work once across concurrent PostgreSQL workers with bounded batches', async () => {
    const ordered = [];
    for (const suffix of ['claim-1', 'claim-2', 'claim-3', 'claim-4']) ordered.push(await append(suffix));
    const first = await repository.claimBatch({ workerId: 'order-worker', batchSize: 2, leaseMs: 1_000, now: time });
    expect(first.map((row) => row.eventId)).toEqual(ordered.slice(0, 2).map((row) => row.eventId));
    await db.outboxEvent.updateMany({ where: { id: { in: ordered.map((row) => row.id) } }, data: { status: 'DELIVERED', lockedAt: null, lockedBy: null, claimToken: null, leaseExpiresAt: null, deliveredAt: time } });

    const additional = await Promise.all(['race-1', 'race-2', 'race-3', 'race-4'].map((suffix) => append(suffix)));
    const [left, right] = await Promise.all([
      repository.claimBatch({ workerId: 'left', batchSize: 2, leaseMs: 1_000, now: time }),
      repository.claimBatch({ workerId: 'right', batchSize: 2, leaseMs: 1_000, now: time }),
    ]);
    const claimed = [...left, ...right];
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    expect(new Set(claimed.map((row) => row.id)).size).toBe(4);
    expect(claimed.map((row) => row.eventId).sort()).toEqual(additional.map((row) => row.eventId).sort());
    expect(new Set(claimed.map((row) => row.claimToken)).size).toBe(4);
  });

  it('reclaims an expired lease and fences stale worker finalization', async () => {
    const row = await append('lease-reclaim');
    const first = (await repository.claimBatch({ workerId: 'worker-a', batchSize: 1, leaseMs: 1_000, now: time }))[0];
    expect((await repository.beginAttempt(row.id, first.claimToken, time))?.attempts).toBe(1);
    time = new Date(time.getTime() + 1_001);
    const second = (await repository.claimBatch({ workerId: 'worker-b', batchSize: 1, leaseMs: 1_000, now: time }))[0];
    expect(second.id).toBe(row.id);
    expect(second.reclaimed).toBe(true);
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(await repository.finalizeSuccess(row.id, first.claimToken, time)).toBe(false);
    expect((await repository.beginAttempt(row.id, second.claimToken, time))?.attempts).toBe(2);
    expect(await repository.finalizeSuccess(row.id, second.claimToken, time)).toBe(true);
    const final = await db.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(final.status).toBe('DELIVERED');
    expect(final.lockedBy).toBeNull();
    expect(final.claimToken).toBeNull();
  });

  it('delivers a handled event once and clears the active lease', async () => {
    const row = await append('success');
    await worker().runOnce();
    const final = await db.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(final).toMatchObject({ status: 'DELIVERED', attempts: 1, lockedBy: null, claimToken: null });
    expect(final.deliveredAt).toEqual(time);
  });

  it('applies deterministic exponential retry then dead-letters at max attempts', async () => {
    const row = await append('retry', 'retry.event');
    const registry = new OutboxHandlerRegistry();
    registry.register({ eventType: 'retry.event', supportedSchemaVersion: 1, handle: async () => {
      throw new OutboxHandlerError('RETRYABLE', 'TRANSIENT_TEST_FAILURE');
    } });
    const service = worker(registry, 'worker-a', { outboxMaxAttempts: 3 });
    await service.runOnce();
    let pending = await db.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(pending).toMatchObject({ status: 'PENDING', attempts: 1, lockedBy: null, lastErrorSafe: 'TRANSIENT_TEST_FAILURE' });
    expect(pending.availableAt.getTime() - time.getTime()).toBe(150);
    expect(pending.availableAt.getTime()).toBeGreaterThan(time.getTime());
    time = pending.availableAt;
    await service.runOnce();
    pending = await db.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(pending).toMatchObject({ status: 'PENDING', attempts: 2, lockedBy: null, lastErrorSafe: 'TRANSIENT_TEST_FAILURE' });
    expect(pending.availableAt.getTime() - time.getTime()).toBe(250);
    time = pending.availableAt;
    await service.runOnce();
    pending = await db.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(pending).toMatchObject({ status: 'DEAD_LETTER', attempts: 3, lockedBy: null, claimToken: null, lastErrorSafe: 'TRANSIENT_TEST_FAILURE' });
    expect(pending.deadLetteredAt).toEqual(time);
    expect(pending.deadLetteredAt).not.toBeNull();
  });

  it('dead-letters unknown type and schema without a silent success', async () => {
    const unknown = await append('unknown', 'unknown.event');
    const unsupported = await append('unsupported', 'trade.completed', 2);
    await worker().runOnce();
    await worker().runOnce();
    const rows = await db.outboxEvent.findMany({ where: { id: { in: [unknown.id, unsupported.id] } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'DEAD_LETTER' && row.lastErrorSafe === 'EVENT_SCHEMA_UNKNOWN' && row.attempts === 1)).toBe(true);
  });

  it('recovers after success finalization crashes, so handlers must be idempotent by eventId', async () => {
    const row = await append('finalization-crash');
    setOutboxWorkerTestFailureHook((point) => {
      if (point === 'outbox.before-success-finalize') throw new Error('INJECTED_FINALIZATION_CRASH');
    });
    await worker().runOnce();
    let processing = await db.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(processing).toMatchObject({ status: 'PROCESSING', attempts: 1 });
    expect(processing.claimToken).toBeTruthy();
    setOutboxWorkerTestFailureHook(undefined);
    time = new Date(processing.leaseExpiresAt!.getTime() + 1);
    await worker(new OutboxHandlerRegistry(), 'recovery-worker').runOnce();
    processing = await db.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(processing).toMatchObject({ status: 'DELIVERED', attempts: 2, lockedBy: null, claimToken: null });
  });
});
