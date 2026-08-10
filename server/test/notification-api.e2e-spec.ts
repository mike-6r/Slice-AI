import * as http from 'node:http';
import * as request from 'supertest';
import { InAppNotificationTransport } from '../src/modules/outbox/application/in-app-notification.transport';
import {
  NotificationRealtimePublisher,
  setNotificationRealtimeTestFailureHook,
} from '../src/modules/notifications/application/notification-realtime.publisher';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 017 authenticated notification API and SSE foundation', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let alice: Awaited<ReturnType<typeof signup>>;
  let bob: Awaited<ReturnType<typeof signup>>;
  let publisher: NotificationRealtimePublisher;

  beforeAll(async () => {
    h = await bootSubmissionHarness('notification-api');
    categoryId = await createCategory(h);
    alice = await signup(h, 'alice', 71);
    bob = await signup(h, 'bob', 72);
    publisher = h.app.get(NotificationRealtimePublisher);
  });

  beforeEach(async () => {
    setNotificationRealtimeTestFailureHook(undefined);
    await h.db.notification.deleteMany({
      where: { userId: { in: [alice.id, bob.id] } },
    });
    await h.db.notificationPreference.deleteMany({
      where: { userId: { in: [alice.id, bob.id] } },
    });
  });

  afterAll(async () => {
    setNotificationRealtimeTestFailureHook(undefined);
    await closeSubmissionHarness(h, [alice.id, bob.id], categoryId);
  });

  async function notification(
    userId: string,
    id: string,
    createdAt: Date,
    readAt?: Date,
  ) {
    return h.db.notification.create({
      data: {
        id,
        userId,
        type: 'ORDER_UPDATES',
        title: `title-${id}`,
        body: `body-${id}`,
        resourceType: 'private-internal-type',
        resourceId: 'private-internal-id',
        createdAt,
        ...(readAt ? { readAt } : {}),
      },
    });
  }

  it('lists bounded self-only safe notifications with a stable cursor', async () => {
    const at = new Date('2026-08-08T12:00:00.000Z');
    await notification(alice.id, `${h.runId}-a1`, at);
    await notification(alice.id, `${h.runId}-a2`, at);
    await notification(alice.id, `${h.runId}-a3`, new Date(at.getTime() - 1));
    await notification(bob.id, `${h.runId}-b1`, new Date(at.getTime() + 1));
    expect(
      (await request(h.app.getHttpServer()).get('/api/v1/me/notifications'))
        .status,
    ).toBe(401);

    const first = await request(h.app.getHttpServer())
      .get('/api/v1/me/notifications?limit=2')
      .set('authorization', alice.auth);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual([
      `${h.runId}-a2`,
      `${h.runId}-a1`,
    ]);
    expect(first.body.items[0]).toEqual(
      expect.objectContaining({ topic: 'ORDER_UPDATES', payloadVersion: 1 }),
    );
    expect(first.body.items[0]).not.toHaveProperty('resourceId');
    expect(first.body.items[0]).not.toHaveProperty('resourceType');
    const second = await request(h.app.getHttpServer())
      .get(
        `/api/v1/me/notifications?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      .set('authorization', alice.auth);
    expect(second.status).toBe(200);
    expect(second.body.items.map((item: { id: string }) => item.id)).toEqual([
      `${h.runId}-a3`,
    ]);
    expect(
      [...first.body.items, ...second.body.items].map(
        (item: { id: string }) => item.id,
      ),
    ).not.toContain(`${h.runId}-b1`);
  });

  it('keeps read state self-only, idempotent, and coherent under concurrent requests', async () => {
    const own = await notification(alice.id, `${h.runId}-own`, new Date());
    const foreign = await notification(
      bob.id,
      `${h.runId}-foreign`,
      new Date(),
    );
    expect(
      (
        await request(h.app.getHttpServer())
          .get('/api/v1/me/notifications/unread-count')
          .set('authorization', alice.auth)
      ).body,
    ).toEqual({ unreadCount: 1 });
    const [first, second] = await Promise.all([
      request(h.app.getHttpServer())
        .post(`/api/v1/me/notifications/${own.id}/read`)
        .set('authorization', alice.auth),
      request(h.app.getHttpServer())
        .post(`/api/v1/me/notifications/${own.id}/read`)
        .set('authorization', alice.auth),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.item.readAt).toEqual(second.body.item.readAt);
    expect(await h.db.notification.count({ where: { id: own.id } })).toBe(1);
    expect(
      (
        await request(h.app.getHttpServer())
          .post(`/api/v1/me/notifications/${foreign.id}/read`)
          .set('authorization', alice.auth)
      ).status,
    ).toBe(404);
    expect(
      (await h.db.notification.findUniqueOrThrow({ where: { id: foreign.id } }))
        .readAt,
    ).toBeNull();

    await notification(alice.id, `${h.runId}-own-2`, new Date());
    await notification(alice.id, `${h.runId}-own-read`, new Date(), new Date());
    await notification(bob.id, `${h.runId}-foreign-2`, new Date());
    const all = await request(h.app.getHttpServer())
      .post('/api/v1/me/notifications/read-all')
      .set('authorization', alice.auth);
    expect(all.status).toBe(201);
    expect(
      (
        await request(h.app.getHttpServer())
          .get('/api/v1/me/notifications/unread-count')
          .set('authorization', alice.auth)
      ).body,
    ).toEqual({ unreadCount: 0 });
    expect(
      await h.db.notification.count({
        where: { userId: bob.id, readAt: null },
      }),
    ).toBe(2);
  });

  it('keeps optional in-app notification preferences self-only, safe, audited, and replayable', async () => {
    expect(
      (
        await request(h.app.getHttpServer()).get(
          '/api/v1/me/notifications/preferences',
        )
      ).status,
    ).toBe(401);
    const initial = await request(h.app.getHttpServer())
      .get('/api/v1/me/notifications/preferences')
      .set('authorization', alice.auth);
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({
      preferences: [
        { topic: 'ORDER_UPDATES', channel: 'IN_APP', enabled: true },
        { topic: 'PORTFOLIO_UPDATES', channel: 'IN_APP', enabled: true },
      ],
    });

    const key = `${h.runId}-notification-preferences`;
    const body = {
      preferences: [
        { topic: 'ORDER_UPDATES', enabled: false },
        { topic: 'PORTFOLIO_UPDATES', enabled: true },
      ],
    };
    const patch = () =>
      request(h.app.getHttpServer())
        .patch('/api/v1/me/notifications/preferences')
        .set('authorization', alice.auth)
        .set('idempotency-key', key)
        .set('x-forwarded-for', `198.51.100.${h.runId.length + 30}`)
        .send(body);
    const first = await patch();
    const replay = await patch();
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(JSON.stringify(first.body)).not.toMatch(
      /userId|accountId|metadata|audit/i,
    );
    expect(
      await h.db.notificationPreference.findMany({
        where: { userId: alice.id },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: 'ORDER_UPDATES',
          channel: 'IN_APP',
          enabled: false,
        }),
        expect.objectContaining({
          topic: 'PORTFOLIO_UPDATES',
          channel: 'IN_APP',
          enabled: true,
        }),
      ]),
    );
    expect(
      await h.db.auditEvent.count({
        where: {
          actorUserId: alice.id,
          action: 'NOTIFICATION_PREFERENCES_UPDATED',
        },
      }),
    ).toBe(1);

    const conflict = await request(h.app.getHttpServer())
      .patch('/api/v1/me/notifications/preferences')
      .set('authorization', alice.auth)
      .set('idempotency-key', key)
      .set('x-forwarded-for', `198.51.100.${h.runId.length + 31}`)
      .send({ preferences: [{ topic: 'ORDER_UPDATES', enabled: true }] });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    const bobPreferences = await request(h.app.getHttpServer())
      .get('/api/v1/me/notifications/preferences')
      .set('authorization', bob.auth);
    expect(
      bobPreferences.body.preferences.find(
        (item: { topic: string }) => item.topic === 'ORDER_UPDATES',
      ).enabled,
    ).toBe(true);
  });

  it('streams safe user-isolated SSE events and refuses unauthenticated streams', async () => {
    expect(
      (
        await request(h.app.getHttpServer()).get(
          '/api/v1/me/notifications/stream',
        )
      ).status,
    ).toBe(401);
    const bobEvents: unknown[] = [];
    const bobSubscription = publisher
      .subscribe(bob.id)
      .subscribe((event) => bobEvents.push(event));
    await h.app.listen(0, '127.0.0.1');
    const address = h.app.getHttpServer().address() as { port: number };
    const aliceEvent = await new Promise<string>((resolve, reject) => {
      const stream = http.request({
        host: '127.0.0.1',
        port: address.port,
        path: '/api/v1/me/notifications/stream',
        headers: { authorization: alice.auth },
      });
      stream.once('response', (response) => {
        expect(response.statusCode).toBe(200);
        let body = '';
        response.on('data', (chunk) => {
          body += chunk.toString();
          if (body.includes('notification.created')) {
            stream.destroy();
            resolve(body);
          }
        });
      });
      stream.once('error', reject);
      stream.end();
      setTimeout(() => {
        void publisher.publishCreated(alice.id, {
          id: `${h.runId}-stream`,
          topic: 'ORDER_UPDATES',
          title: 'safe',
          body: 'safe',
          createdAt: new Date().toISOString(),
        });
      }, 30);
    });
    expect(aliceEvent).toContain('notification.created');
    expect(aliceEvent).toContain(`${h.runId}-stream`);
    expect(aliceEvent).not.toContain(bob.id);
    expect(bobEvents).toHaveLength(0);
    bobSubscription.unsubscribe();
  });

  it('keeps durable IN_APP notification success independent from realtime failure and avoids duplicate publication', async () => {
    const transport = new InAppNotificationTransport(h.db, publisher);
    const events: unknown[] = [];
    const subscription = publisher
      .subscribe(alice.id)
      .subscribe((event) => events.push(event));
    const delivery = {
      id: `${h.runId}-delivery`,
      deliveryId: `${h.runId}-delivery-id`,
      destinationKey: `user:${alice.id}`,
      topic: 'ORDER_UPDATES',
    };
    setNotificationRealtimeTestFailureHook(() => {
      throw new Error('INJECTED_REALTIME_FAILURE');
    });
    await expect(transport.deliver(delivery as never)).resolves.toMatchObject({
      status: 'DELIVERED',
    });
    expect(
      await h.db.notification.count({
        where: { deliveryId: delivery.deliveryId, userId: alice.id },
      }),
    ).toBe(1);
    expect(events).toHaveLength(0);
    setNotificationRealtimeTestFailureHook(undefined);
    await transport.deliver(delivery as never);
    expect(
      await h.db.notification.count({
        where: { deliveryId: delivery.deliveryId, userId: alice.id },
      }),
    ).toBe(1);
    expect(events).toHaveLength(0);
    subscription.unsubscribe();
  });
});
