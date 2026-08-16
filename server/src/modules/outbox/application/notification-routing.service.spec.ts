import { NotificationRoutingService } from './notification-routing.service';

describe('NotificationRoutingService private order delivery', () => {
  it('creates durable in-app and private Discord intents for a real order event', () => {
    const event = { id: 'row-1', eventId: 'order.opened:order-1', eventType: 'order.opened', schemaVersion: 1, actorUserId: 'user-1', occurredAt: new Date('2026-08-16T12:00:00.000Z'), payload: { orderId: 'order-1', assetId: 'asset-1', side: 'BUY', units: '1', status: 'OPEN' } };
    const routes = new NotificationRoutingService().route(event as never);
    expect(routes).toHaveLength(2);
    expect(routes).toEqual(expect.arrayContaining([expect.objectContaining({ channel: 'IN_APP', destinationKey: 'user:user-1', topic: 'ORDER_UPDATES' }), expect.objectContaining({ channel: 'DISCORD', destinationKey: 'user:user-1', classification: 'PRIVATE', topic: 'ORDER_UPDATES', payload: expect.objectContaining({ eventType: 'order.opened' }) })]));
  });
});
