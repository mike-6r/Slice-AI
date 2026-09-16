import { Injectable, Optional } from '@nestjs/common';
import { Prisma, type NotificationDelivery } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationRealtimePublisher } from '../../notifications/application/notification-realtime.publisher';
import type {
  NotificationTransport,
  NotificationTransportOutcome,
} from './notification-transport';

@Injectable()
export class InAppNotificationTransport implements NotificationTransport {
  readonly channel = 'IN_APP' as const;
  constructor(
    private readonly db: PrismaService,
    @Optional() private readonly realtime?: NotificationRealtimePublisher,
  ) {}
  async deliver(
    delivery: NotificationDelivery,
  ): Promise<NotificationTransportOutcome> {
    const userId = delivery.destinationKey.startsWith('user:')
      ? delivery.destinationKey.slice(5)
      : '';
    if (!userId)
      return { status: 'NON_RETRYABLE_FAILURE', code: 'DESTINATION_INVALID' };
    const payload =
      delivery.payload &&
      typeof delivery.payload === 'object' &&
      !Array.isArray(delivery.payload)
        ? (delivery.payload as Record<string, unknown>)
        : {};
    const isSubmissionReceived = payload.eventType === 'submission.submitted';
    const orderNotification = await this.orderNotification(payload, userId);
    const title =
      typeof payload.title === 'string'
        ? payload.title
        : (orderNotification?.title ??
          (isSubmissionReceived
            ? 'We received your collectible submission.'
            : delivery.topic));
    const body =
      typeof payload.body === 'string'
        ? payload.body
        : (orderNotification?.body ??
          (isSubmissionReceived
            ? 'Your submission is private and ready for Slice team review.'
            : 'You have a new account notification.'));
    const resourceType =
      typeof payload.resourceType === 'string'
        ? payload.resourceType
        : orderNotification
          ? 'trading-order'
          : isSubmissionReceived
            ? 'submission'
            : 'notification-delivery';
    const resourceId =
      typeof payload.resourceId === 'string'
        ? payload.resourceId
        : (orderNotification?.orderId ??
          (typeof payload.submissionId === 'string'
            ? payload.submissionId
            : delivery.id));
    let notification;
    let created = false;
    try {
      notification = await this.db.notification.create({
        data: {
          deliveryId: delivery.deliveryId,
          userId,
          type: delivery.topic,
          title,
          body,
          resourceType,
          resourceId,
        },
      });
      created = true;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      notification = await this.db.notification.findUniqueOrThrow({
        where: { deliveryId: delivery.deliveryId },
      });
    }
    if (created)
      await this.realtime?.publishCreated(userId, {
        id: notification.id,
        topic: notification.type,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt.toISOString(),
      });
    return { status: 'DELIVERED' };
  }

  private async orderNotification(
    payload: Record<string, unknown>,
    userId: string,
  ) {
    const eventType =
      typeof payload.eventType === 'string' ? payload.eventType : null;
    const side =
      payload.side === 'BUY' || payload.side === 'SELL' ? payload.side : null;
    const orderId =
      typeof payload.orderId === 'string' ? payload.orderId : null;
    if (!eventType || !side || !orderId) return null;
    const actions: Record<string, string> = {
      'order.opened': 'placed',
      'order.cancelled': 'cancelled',
      'order.partiallyfilled': 'partially filled',
      'order.filled': 'filled',
      'order.expired': 'expired',
    };
    const action = actions[eventType];
    if (!action) return null;
    const order = await this.db.tradingOrder.findFirst({
      where: { id: orderId, userId },
      select: { asset: { select: { title: true } } },
    });
    const direction = side === 'BUY' ? 'Buy' : 'Sell';
    const assetTitle = order?.asset.title ?? 'this collectible';
    return {
      orderId,
      title: `${direction} order ${action}`,
      body:
        action === 'placed'
          ? `Your ${direction.toLowerCase()} order for ${assetTitle} is now open.`
          : `Your ${direction.toLowerCase()} order for ${assetTitle} has been ${action}.`,
    };
  }
}
