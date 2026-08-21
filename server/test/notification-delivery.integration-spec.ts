import { PrismaClient } from '@prisma/client';
import { OutboxHandlerRegistry } from '../src/modules/outbox/application/outbox-handler';
import { NotificationDeliveryService, type DeliveryIntent } from '../src/modules/outbox/application/notification-delivery.service';
import { NotificationRoutingService, notificationTopic } from '../src/modules/outbox/application/notification-routing.service';
import { setNotificationDeliveryTestFailureHook } from '../src/modules/outbox/application/notification-delivery-test-failure';
import { OutboxWorkerRepository } from '../src/modules/outbox/application/outbox-worker.repository';
import { OutboxWorkerService, type OutboxWorkerConfig } from '../src/modules/outbox/application/outbox-worker.service';
import { setOutboxWorkerTestFailureHook } from '../src/modules/outbox/application/outbox-worker-test-failure-injection';
import { OutboxWriter } from '../src/modules/outbox/application/outbox-writer.service';
import { createDomainEvent } from '../src/modules/outbox/domain/domain-event';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `delivery-i-${Date.now()}`;
const writer = new OutboxWriter();
const service = new NotificationDeliveryService(db as never);
const routing = new NotificationRoutingService();
const repo = new OutboxWorkerRepository(db as never);
let now = new Date('2000-01-01T00:00:00.000Z');
const config: OutboxWorkerConfig = { outboxWorkerEnabled: false, outboxWorkerId: undefined, outboxPollIntervalMs: 1000, outboxBatchSize: 1, outboxLeaseMs: 1000, outboxMaxAttempts: 5, outboxRetryBaseMs: 100, outboxRetryMaxMs: 1000 };

const appendTrade = (suffix: string) => db.$transaction(async (tx) => {
  const row = await writer.append(tx, createDomainEvent({
  eventId: `${run}-${suffix}`, eventType: 'trade.completed', schemaVersion: 1, occurredAt: new Date('1999-01-01T00:00:00.000Z'),
  aggregate: { type: 'execution', id: `${run}-${suffix}` },
  payload: { executionId: `${run}-${suffix}`, assetId: `${run}-asset`, units: '2', priceMinor: '250', grossMinor: '500', currency: 'GBP' },
  }));
  return tx.outboxEvent.update({ where: { id: row.id }, data: { availableAt: now } });
});

describe('Document 017 phase 3 notification delivery routing', () => {
  beforeAll(async () => { await db.$connect(); });
  beforeEach(async () => {
    now = new Date('2000-01-01T00:00:00.000Z');
    await db.notificationDelivery.deleteMany({ where: { deliveryId: { startsWith: `delivery:${run}` } } });
    await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } });
  });
  afterEach(() => { setNotificationDeliveryTestFailureHook(undefined); setOutboxWorkerTestFailureHook(undefined); });
  afterAll(async () => { await db.notificationDelivery.deleteMany({ where: { deliveryId: { startsWith: `delivery:${run}` } } }); await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } }); await db.$disconnect(); });

  it('creates one safe public delivery idempotently from a trade event', async () => {
    const event = await appendTrade('idempotent');
    const intents = routing.route(event);
    const [first] = await service.createManyIdempotent(event, intents);
    const [replay] = await service.createManyIdempotent(event, intents);
    expect(replay.id).toBe(first.id);
    expect(await db.notificationDelivery.count({ where: { outboxEventId: event.id } })).toBe(1);
    expect(first).toMatchObject({ channel: 'DISCORD', destinationKey: 'discord.market_feed', classification: 'PUBLIC', topic: notificationTopic.marketListings, status: 'PENDING', payloadVersion: 1 });
    expect(JSON.stringify(first.payload)).not.toMatch(/buyer|seller|account|journal|reservation|kyc|provider/i);
  });

  it('creates multiple required intents atomically or creates none', async () => {
    const event = await appendTrade('atomic');
    const intents: DeliveryIntent[] = [
      ...routing.route(event),
      { channel: 'IN_APP', destinationKey: `user:${run}`, classification: 'PRIVATE', topic: 'ORDER_UPDATES', mandatory: false, payloadVersion: 1, payload: { eventId: event.eventId } },
    ];
    setNotificationDeliveryTestFailureHook((index) => { if (index === 1) throw new Error('INJECTED_DELIVERY_WRITE_FAILURE'); });
    await expect(service.createManyIdempotent(event, intents)).rejects.toThrow('INJECTED_DELIVERY_WRITE_FAILURE');
    expect(await db.notificationDelivery.count({ where: { outboxEventId: event.id } })).toBe(0);
  });

  it('applies optional preference suppression while mandatory and public routes remain independent', () => {
    const payload = { eventId: `${run}-preference` };
    expect(routing.optionalUserIntent({ userId: `${run}-user`, topic: 'ORDER_UPDATES', channel: 'IN_APP', enabled: true, mandatory: false, payload })).toMatchObject({ mandatory: false, destinationKey: `user:${run}-user` });
    expect(routing.optionalUserIntent({ userId: `${run}-user`, topic: 'ORDER_UPDATES', channel: 'IN_APP', enabled: false, mandatory: false, payload })).toBeNull();
    expect(routing.optionalUserIntent({ userId: `${run}-user`, topic: 'SECURITY_ALERTS', channel: 'IN_APP', enabled: false, mandatory: true, payload })).toMatchObject({ mandatory: true, destinationKey: `user:${run}-user` });
  });

  it('reprocesses after outbox finalization failure without duplicating durable delivery work', async () => {
    const event = await appendTrade('reprocess');
    const registry = new OutboxHandlerRegistry(routing, service);
    const worker = (id: string) => new OutboxWorkerService(repo, config, registry, { now: () => now, random: () => 0, workerId: id });
    setOutboxWorkerTestFailureHook(() => { throw new Error('INJECTED_FINALIZE_FAILURE'); });
    await worker('first').runOnce();
    expect(await db.notificationDelivery.count({ where: { outboxEventId: event.id } })).toBe(1);
    let outbox = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(outbox.status).toBe('PROCESSING');
    setOutboxWorkerTestFailureHook(undefined);
    now = new Date(outbox.leaseExpiresAt!.getTime() + 1);
    await worker('recovery').runOnce();
    outbox = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(outbox).toMatchObject({ status: 'DELIVERED', attempts: 2 });
    expect(await db.notificationDelivery.count({ where: { outboxEventId: event.id } })).toBe(1);
  });
});
