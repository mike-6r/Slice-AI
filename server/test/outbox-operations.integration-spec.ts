import { PrismaClient } from '@prisma/client';
import { OutboxOperationsService } from '../src/modules/outbox/application/outbox-operations.service';
import { OutboxWorkerRepository } from '../src/modules/outbox/application/outbox-worker.repository';
import { NotificationDeliveryWorkerRepository } from '../src/modules/outbox/application/notification-delivery-worker.repository';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `outbox-operations-${Date.now()}`;
const operations = new OutboxOperationsService(
  db as never,
  new RecentAuthService({ recentAuthWindowSeconds: 300 } as never),
);
const outboxWorker = new OutboxWorkerRepository(db as never);
const deliveryWorker = new NotificationDeliveryWorkerRepository(db as never);
let userId = '';

describe('Document 017 dead-letter operational authority', () => {
  beforeAll(async () => {
    await db.$connect();
    const user = await db.user.create({
      data: {
        email: `${run}@example.test`,
        normalizedEmail: `${run}@example.test`,
        passwordHash: 'test',
        accountStatus: 'ACTIVE',
      },
    });
    userId = user.id;
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('requeues the same dead-letter outbox row once, audits it, and restores normal worker eligibility', async () => {
    const event = await deadOutbox('outbox');
    const [first, replay] = await Promise.all([
      operations.requeueOutbox(event.eventId, context('outbox-requeue')),
      operations.requeueOutbox(event.eventId, context('outbox-requeue')),
    ]);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ eventId: event.eventId, status: 'PENDING', requeued: true });
    const state = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(state).toMatchObject({ id: event.id, eventId: event.eventId, status: 'PENDING', claimToken: null, deadLetteredAt: null, lastErrorSafe: null });
    expect(await db.outboxEvent.count({ where: { eventId: event.eventId } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorUserId: userId, action: 'OUTBOX_EVENT_REQUEUED', resourceId: event.eventId } })).toBe(1);
    expect(await db.idempotencyRecord.count({ where: { key: 'outbox-requeue' } })).toBe(1);
    expect(state.availableAt.getTime()).toBeLessThanOrEqual(Date.now());
    // Isolate this row from unrelated shared-test queue work without changing
    // its identity or eligibility, then prove the real SKIP LOCKED worker claims it.
    await db.outboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date(0) } });
    const [claim] = await outboxWorker.claimBatch({ workerId: 'operations-proof', batchSize: 1, leaseMs: 1_000, now: new Date() });
    expect(claim).toMatchObject({ id: event.id, eventId: event.eventId, status: 'PROCESSING' });
  });

  it('requeues the same dead-letter delivery once and restores normal worker eligibility', async () => {
    const event = await deadOutbox('delivery-parent');
    const delivery = await db.notificationDelivery.create({
      data: {
        deliveryId: `${run}-delivery`, outboxEventId: event.id, channel: 'IN_APP',
        destinationKey: `user:${userId}`, classification: 'PRIVATE', topic: 'ORDER_UPDATES',
        payloadVersion: 1, payload: { safe: true }, idempotencyKey: `${run}-delivery`,
        status: 'DEAD_LETTER', attempts: 3, deadLetteredAt: new Date(), lastErrorSafe: 'TEST_FAILURE',
      },
    });
    const [first, concurrent] = await Promise.allSettled([
      operations.requeueDelivery(delivery.deliveryId, context('delivery-one')),
      operations.requeueDelivery(delivery.deliveryId, context('delivery-two')),
    ]);
    expect([first.status, concurrent.status].filter((state) => state === 'fulfilled')).toHaveLength(1);
    const state = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(state).toMatchObject({ id: delivery.id, deliveryId: delivery.deliveryId, status: 'PENDING', claimToken: null, deadLetteredAt: null, lastErrorSafe: null });
    expect(await db.notificationDelivery.count({ where: { deliveryId: delivery.deliveryId } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorUserId: userId, action: 'NOTIFICATION_DELIVERY_REQUEUED', resourceId: delivery.deliveryId } })).toBe(1);
    expect(state.availableAt.getTime()).toBeLessThanOrEqual(Date.now());
    await db.notificationDelivery.update({ where: { id: delivery.id }, data: { availableAt: new Date(0) } });
    const [claim] = await deliveryWorker.claimBatch('delivery-operations-proof', 1, 1_000, new Date());
    expect(claim).toMatchObject({ id: delivery.id, deliveryId: delivery.deliveryId, status: 'PROCESSING' });
  });

  it('rejects non-dead-letter records without changing state or creating a successful audit', async () => {
    const event = await db.outboxEvent.create({
      data: { ...eventData('ineligible'), status: 'DELIVERED', deliveredAt: new Date() },
    });
    await expect(operations.requeueOutbox(event.eventId, context('ineligible'))).rejects.toMatchObject({ response: { code: 'OUTBOX_REQUEUE_INELIGIBLE' } });
    expect(await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: 'DELIVERED' });
    expect(await db.auditEvent.count({ where: { actorUserId: userId, action: 'OUTBOX_EVENT_REQUEUED', resourceId: event.eventId } })).toBe(0);
    const delivery = await db.notificationDelivery.create({
      data: {
        deliveryId: `${run}-delivered`, outboxEventId: event.id, channel: 'IN_APP', destinationKey: `user:${userId}`,
        classification: 'PRIVATE', topic: 'ORDER_UPDATES', payloadVersion: 1, payload: { safe: true }, idempotencyKey: `${run}-delivered`,
        status: 'DELIVERED', deliveredAt: new Date(),
      },
    });
    await expect(operations.requeueDelivery(delivery.deliveryId, context('delivered'))).rejects.toMatchObject({ response: { code: 'DELIVERY_REQUEUE_INELIGIBLE' } });
    expect(await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).toMatchObject({ status: 'DELIVERED' });
    expect(await db.auditEvent.count({ where: { actorUserId: userId, action: 'NOTIFICATION_DELIVERY_REQUEUED', resourceId: delivery.deliveryId } })).toBe(0);
  });

  function context(key: string) {
    return {
      actor: { userId, sessionId: `${run}-session`, status: 'ACTIVE', roles: ['ADMIN'], sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date() } as never,
      requestId: `${run}-${key}`,
      idempotencyKey: key,
    };
  }

  async function deadOutbox(suffix: string) {
    return db.outboxEvent.create({
      data: { ...eventData(suffix), status: 'DEAD_LETTER', attempts: 3, deadLetteredAt: new Date(), lastErrorSafe: 'TEST_FAILURE' },
    });
  }

  function eventData(suffix: string) {
    return {
      eventId: `${run}-${suffix}`,
      eventType: 'test.event', aggregateType: 'test', aggregateId: run,
      schemaVersion: 1, occurredAt: new Date(), payload: { safe: true },
    };
  }

  async function cleanup() {
    await db.notification.deleteMany({ where: { deliveryId: { startsWith: run } } });
    await db.notificationDelivery.deleteMany({ where: { deliveryId: { startsWith: run } } });
    await db.outboxEvent.deleteMany({ where: { eventId: { startsWith: run } } });
    await db.auditEvent.deleteMany({ where: { actorUserId: userId, action: { in: ['OUTBOX_EVENT_REQUEUED', 'NOTIFICATION_DELIVERY_REQUEUED'] } } });
    await db.idempotencyRecord.deleteMany({ where: { key: { startsWith: 'outbox-' } } });
    await db.idempotencyRecord.deleteMany({ where: { key: { startsWith: 'delivery-' } } });
    await db.idempotencyRecord.deleteMany({ where: { key: 'ineligible' } });
  }
});
