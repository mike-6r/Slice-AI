import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { NotificationDelivery } from '@prisma/client';
import { TransactionalEmailService } from '../../identity/email-delivery/transactional-email.service';
import type { NotificationTransport, NotificationTransportOutcome } from './notification-transport';

@Injectable()
export class EmailNotificationTransport implements NotificationTransport {
  readonly channel = 'EMAIL' as const;

  constructor(private readonly email: TransactionalEmailService) {}

  async deliver(delivery: NotificationDelivery): Promise<NotificationTransportOutcome> {
    const payload = delivery.payload && typeof delivery.payload === 'object' && !Array.isArray(delivery.payload)
      ? delivery.payload as Record<string, unknown>
      : {};
    const userId = delivery.destinationKey.startsWith('user:') ? delivery.destinationKey.slice(5) : '';
    const title = typeof payload.title === 'string' ? payload.title : '';
    const body = typeof payload.body === 'string' ? payload.body : '';
    if (!userId || !title || !body) return { status: 'NON_RETRYABLE_FAILURE', code: 'DESTINATION_INVALID' };
    try {
      const sent = await this.email.sendFinancialNotification({
        userId,
        title,
        detail: body,
        idempotencyKey: `notification-email:${delivery.deliveryId}`,
      });
      return sent
        ? { status: 'DELIVERED' }
        : { status: 'NON_RETRYABLE_FAILURE', code: 'USER_NOT_FOUND' };
    } catch (error) {
      return {
        status: 'RETRYABLE_FAILURE',
        code: error instanceof ServiceUnavailableException ? 'EMAIL_DELIVERY_UNAVAILABLE' : 'EMAIL_DELIVERY_FAILED',
      };
    }
  }
}
