import { InAppNotificationTransport } from './in-app-notification.transport';

describe('InAppNotificationTransport order copy', () => {
  it('creates a customer-facing order notification with the collectible name', async () => {
    const db = {
      tradingOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ asset: { title: 'Shohei Ohtani PSA 10' } }),
      },
      notification: {
        create: jest.fn().mockResolvedValue({
          id: 'notification-1',
          type: 'ORDER_UPDATES',
          title: 'Buy order partially filled',
          body: 'safe',
          createdAt: new Date('2026-09-16T12:00:00.000Z'),
        }),
      },
    };
    const transport = new InAppNotificationTransport(db as never);

    await expect(
      transport.deliver({
        id: 'delivery-row-1',
        deliveryId: 'delivery-1',
        destinationKey: 'user:user-1',
        topic: 'ORDER_UPDATES',
        payload: {
          eventType: 'order.partiallyfilled',
          orderId: 'order-1',
          side: 'BUY',
        },
      } as never),
    ).resolves.toEqual({ status: 'DELIVERED' });

    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'ORDER_UPDATES',
        title: 'Buy order partially filled',
        body: 'Your buy order for Shohei Ohtani PSA 10 has been partially filled.',
        resourceType: 'trading-order',
        resourceId: 'order-1',
      }),
    });
  });
});
