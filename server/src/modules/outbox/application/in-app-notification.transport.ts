import { Injectable, Optional } from '@nestjs/common';
import { Prisma, type NotificationDelivery } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationRealtimePublisher } from '../../notifications/application/notification-realtime.publisher';
import type { NotificationTransport, NotificationTransportOutcome } from './notification-transport';

@Injectable()
export class InAppNotificationTransport implements NotificationTransport {
  readonly channel = 'IN_APP' as const;
  constructor(
    private readonly db: PrismaService,
    @Optional() private readonly realtime?: NotificationRealtimePublisher,
  ) {}
  async deliver(delivery: NotificationDelivery): Promise<NotificationTransportOutcome> {
    const userId = delivery.destinationKey.startsWith('user:') ? delivery.destinationKey.slice(5) : '';
    if (!userId) return { status: 'NON_RETRYABLE_FAILURE', code: 'DESTINATION_INVALID' };
    const payload = delivery.payload && typeof delivery.payload === 'object' && !Array.isArray(delivery.payload)
      ? delivery.payload as Record<string, unknown>
      : {};
    const isSubmissionReceived = payload.eventType === 'submission.submitted';
    const title = typeof payload.title === 'string'
      ? payload.title
      : isSubmissionReceived ? 'We received your collectible submission.' : delivery.topic;
    const body = typeof payload.body === 'string'
      ? payload.body
      : isSubmissionReceived
        ? 'Your submission is private and ready for Slice team review.'
        : 'You have a new account notification.';
    const resourceType = typeof payload.resourceType === 'string'
      ? payload.resourceType
      : isSubmissionReceived ? 'submission' : 'notification-delivery';
    const resourceId = typeof payload.resourceId === 'string'
      ? payload.resourceId
      : typeof payload.submissionId === 'string' ? payload.submissionId : delivery.id;
    let notification;
    let created = false;
    try {
      notification = await this.db.notification.create({ data: {
        deliveryId: delivery.deliveryId, userId, type: delivery.topic, title,
        body, resourceType, resourceId,
      } });
      created = true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      notification = await this.db.notification.findUniqueOrThrow({ where: { deliveryId: delivery.deliveryId } });
    }
    if (created) await this.realtime?.publishCreated(userId, {
      id: notification.id,
      topic: notification.type,
      title: notification.title,
      body: notification.body,
      createdAt: notification.createdAt.toISOString(),
    });
    return { status: 'DELIVERED' };
  }
}
