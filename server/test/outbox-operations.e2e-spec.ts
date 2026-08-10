import * as request from 'supertest';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 017 privileged dead-letter operations API', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let admin: Awaited<ReturnType<typeof signup>>;
  let member: Awaited<ReturnType<typeof signup>>;

  beforeAll(async () => {
    h = await bootSubmissionHarness('outbox-operations');
    categoryId = await createCategory(h);
    admin = await signup(h, 'admin', 82);
    member = await signup(h, 'member', 83);
    await h.db.roleAssignment.create({
      data: { id: `${h.runId}-admin`, userId: admin.id, role: 'ADMIN', scopeType: 'GLOBAL', scopeId: '*', assignedByUserId: null },
    });
  });

  beforeEach(async () => {
    await h.db.notificationDelivery.deleteMany({ where: { deliveryId: { startsWith: h.runId } } });
    await h.db.outboxEvent.deleteMany({ where: { eventId: { startsWith: h.runId } } });
    await h.db.auditEvent.deleteMany({ where: { actorUserId: admin.id, action: { in: ['OUTBOX_EVENT_REQUEUED', 'NOTIFICATION_DELIVERY_REQUEUED'] } } });
    await h.db.idempotencyRecord.deleteMany({ where: { key: { startsWith: h.runId } } });
  });

  afterAll(async () => {
    await h.db.notificationDelivery.deleteMany({ where: { deliveryId: { startsWith: h.runId } } });
    await h.db.outboxEvent.deleteMany({ where: { eventId: { startsWith: h.runId } } });
    await closeSubmissionHarness(h, [admin.id, member.id], categoryId);
  });

  it('requires privileged recent auth and exposes/requeues only safe dead-letter state idempotently', async () => {
    const event = await deadOutbox('one');
    const delivery = await h.db.notificationDelivery.create({
      data: {
        deliveryId: `${h.runId}-delivery`, outboxEventId: event.id, channel: 'IN_APP', destinationKey: `user:${member.id}`,
        classification: 'PRIVATE', topic: 'ORDER_UPDATES', payloadVersion: 1, payload: { unsafeProviderData: 'never-returned' },
        idempotencyKey: `${h.runId}-delivery`, status: 'DEAD_LETTER', attempts: 3, deadLetteredAt: new Date(), lastErrorSafe: 'TEST_FAILURE',
      },
    });
    const server = h.app.getHttpServer();
    expect((await request(server).get('/api/v1/admin/outbox/dead-letters')).status).toBe(401);
    expect((await request(server).get('/api/v1/admin/outbox/dead-letters').set('authorization', member.auth)).status).toBe(403);

    const listed = await request(server).get('/api/v1/admin/outbox/dead-letters').set('authorization', admin.auth).set('x-request-id', `${h.runId}-read`);
    expect(listed.status).toBe(200);
    expect(listed.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    const item = listed.body.find((row: { eventId: string }) => row.eventId === event.eventId);
    expect(item).toMatchObject({ eventId: event.eventId, status: 'DEAD_LETTER', lastErrorSafe: 'TEST_FAILURE' });
    expect(item).not.toHaveProperty('payload');
    expect(item).not.toHaveProperty('claimToken');
    const detailed = await request(server).get(`/api/v1/admin/outbox/${event.eventId}`).set('authorization', admin.auth);
    expect(detailed.body).not.toHaveProperty('payload');
    expect((await request(server).get('/api/v1/admin/notification-deliveries/dead-letters').set('authorization', admin.auth)).body[0]).not.toHaveProperty('payload');

    const key = `${h.runId}-outbox-requeue`;
    const first = await request(server).post(`/api/v1/admin/outbox/${event.eventId}/requeue`).set('authorization', admin.auth).set('idempotency-key', key).set('x-forwarded-for', '198.51.100.82');
    const replay = await request(server).post(`/api/v1/admin/outbox/${event.eventId}/requeue`).set('authorization', admin.auth).set('idempotency-key', key).set('x-forwarded-for', '198.51.100.82');
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(await h.db.auditEvent.count({ where: { actorUserId: admin.id, action: 'OUTBOX_EVENT_REQUEUED', resourceId: event.eventId } })).toBe(1);
    expect(await h.db.outboxEvent.count({ where: { eventId: event.eventId } })).toBe(1);

    const second = await deadOutbox('two');
    const conflict = await request(server).post(`/api/v1/admin/outbox/${second.eventId}/requeue`).set('authorization', admin.auth).set('idempotency-key', key).set('x-forwarded-for', '198.51.100.82');
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    expect((await h.db.outboxEvent.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('DEAD_LETTER');

    const deliveryResult = await request(server).post(`/api/v1/admin/notification-deliveries/${delivery.deliveryId}/requeue`).set('authorization', admin.auth).set('idempotency-key', `${h.runId}-delivery-requeue`).set('x-forwarded-for', '198.51.100.82');
    expect(deliveryResult.status).toBe(201);
    expect(deliveryResult.body).toMatchObject({ deliveryId: delivery.deliveryId, status: 'PENDING', requeued: true });
    expect(await h.db.auditEvent.count({ where: { actorUserId: admin.id, action: 'NOTIFICATION_DELIVERY_REQUEUED', resourceId: delivery.deliveryId } })).toBe(1);

    const stale = await deadOutbox('stale-auth');
    const session = await h.db.session.findFirstOrThrow({ where: { userId: admin.id } });
    await h.db.session.update({ where: { id: session.id }, data: { authenticatedAt: new Date(Date.now() - 3_600_000) } });
    const staleResult = await request(server).post(`/api/v1/admin/outbox/${stale.eventId}/requeue`).set('authorization', admin.auth).set('idempotency-key', `${h.runId}-stale-auth`).set('x-forwarded-for', '198.51.100.82');
    expect(staleResult.status).toBe(403);
    expect(staleResult.body.error.code).toBe('RECENT_AUTH_REQUIRED');
    expect((await h.db.outboxEvent.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('DEAD_LETTER');
  });

  async function deadOutbox(suffix: string) {
    return h.db.outboxEvent.create({
      data: {
        eventId: `${h.runId}-${suffix}`, eventType: 'test.event', aggregateType: 'test', aggregateId: h.runId,
        schemaVersion: 1, occurredAt: new Date(), payload: { privateProviderReference: 'never-returned' },
        status: 'DEAD_LETTER', attempts: 3, deadLetteredAt: new Date(), lastErrorSafe: 'TEST_FAILURE',
      },
    });
  }
});
