import { NotificationRoutingService } from './notification-routing.service';

describe('NotificationRoutingService private order delivery', () => {
  it('creates durable in-app and private Discord intents for a real order event', () => {
    const event = {
      id: 'row-1',
      eventId: 'order.opened:order-1',
      eventType: 'order.opened',
      schemaVersion: 1,
      actorUserId: 'user-1',
      occurredAt: new Date('2026-08-16T12:00:00.000Z'),
      payload: {
        orderId: 'order-1',
        assetId: 'asset-1',
        side: 'BUY',
        units: '1',
        status: 'OPEN',
      },
    };
    const routes = new NotificationRoutingService().route(event as never);
    expect(routes).toHaveLength(2);
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'IN_APP',
          destinationKey: 'user:user-1',
          topic: 'ORDER_UPDATES',
        }),
        expect.objectContaining({
          channel: 'DISCORD',
          destinationKey: 'user:user-1',
          classification: 'PRIVATE',
          topic: 'ORDER_UPDATES',
          payload: expect.objectContaining({ eventType: 'order.opened' }),
        }),
      ]),
    );
  });
  it('centralizes Collector Actions and Shipping category mapping', () => {
    const routing = new NotificationRoutingService();
    const submission = routing.route({
      id: 'row-2',
      eventId: 'submission.approved:submission-1',
      eventType: 'submission.approved',
      schemaVersion: 1,
      actorUserId: 'user-1',
      occurredAt: new Date(),
      payload: { submissionId: 'submission-1', status: 'APPROVED' },
    } as never);
    const receipt = routing.route({
      id: 'row-3',
      eventId: 'intake.receiptconfirmed:submission-1',
      eventType: 'intake.receiptconfirmed',
      schemaVersion: 1,
      actorUserId: 'user-1',
      occurredAt: new Date(),
      payload: {
        submissionId: 'submission-1',
        intakeId: 'intake-1',
        status: 'RECEIVED',
      },
    } as never);
    expect(submission).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'DISCORD',
          topic: 'COLLECTOR_ACTIONS',
        }),
      ]),
    );
    expect(receipt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: 'DISCORD', topic: 'SHIPPING' }),
      ]),
    );
  });
  it('routes a submitted collectible to private Collector Actions', () => {
    const routes = new NotificationRoutingService().route({
      id: 'row-4',
      eventId: 'submission.submitted:submission-1',
      eventType: 'submission.submitted',
      schemaVersion: 1,
      actorUserId: 'user-1',
      occurredAt: new Date(),
      payload: {
        submissionId: 'submission-1',
        status: 'SUBMITTED',
        eventType: 'submission.submitted',
      },
    } as never);
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'IN_APP',
          topic: 'COLLECTOR_ACTIONS',
          destinationKey: 'user:user-1',
        }),
        expect.objectContaining({
          channel: 'DISCORD',
          topic: 'COLLECTOR_ACTIONS',
          destinationKey: 'user:user-1',
        }),
      ]),
    );
  });
});
