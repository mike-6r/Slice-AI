import { Injectable, Logger } from '@nestjs/common';
import { type NotificationDeliveryChannel, Prisma, type OutboxEvent } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { notificationDeliveryTestFailure } from './notification-delivery-test-failure';

export type DeliveryClassification = 'PUBLIC' | 'PRIVATE' | 'STAFF' | 'SYSTEM';
export type DeliveryIntent = Readonly<{
  channel: NotificationDeliveryChannel; destinationKey: string; classification: DeliveryClassification;
  topic: string; mandatory: boolean; payloadVersion: number; payload: Prisma.InputJsonValue;
}>;

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);
  constructor(private readonly db: PrismaService) {}

  async createManyIdempotent(event: OutboxEvent, intents: readonly DeliveryIntent[]) {
    return this.db.$transaction(async (tx) => {
      const rows = [];
      for (const [index, intent] of intents.entries()) {
        await notificationDeliveryTestFailure(index);
        const idempotencyKey = `${event.eventId}:${intent.channel}:${intent.destinationKey}`;
        const existing = await tx.notificationDelivery.findUnique({ where: { idempotencyKey } });
        if (existing) {
          this.logger.log({ eventId: event.eventId, deliveryId: existing.deliveryId, channel: intent.channel, destinationKey: intent.destinationKey, topic: intent.topic }, 'Notification delivery reused');
          rows.push(existing);
          continue;
        }
        const preference = intent.classification === 'PRIVATE' && !intent.mandatory
          ? await tx.notificationPreference.findUnique({ where: { userId_topic_channel: { userId: intent.destinationKey.slice(5), topic: intent.topic, channel: intent.channel } } })
          : null;
        const suppressed = preference?.enabled === false;
        const created = await tx.notificationDelivery.create({ data: {
          deliveryId: `delivery:${idempotencyKey}`, outboxEventId: event.id,
          channel: intent.channel, destinationKey: intent.destinationKey,
          classification: intent.classification, topic: intent.topic, mandatory: intent.mandatory,
          payloadVersion: intent.payloadVersion, payload: intent.payload, idempotencyKey,
          ...(suppressed ? { status: 'SUPPRESSED', lastErrorSafe: 'PREFERENCE_DISABLED' } : {}),
        } });
        this.logger.log({ eventId: event.eventId, deliveryId: created.deliveryId, channel: intent.channel, destinationKey: intent.destinationKey, topic: intent.topic }, 'Notification delivery intent created');
        rows.push(created);
      }
      return rows;
    });
  }

  getByDeliveryId(deliveryId: string) { return this.db.notificationDelivery.findUnique({ where: { deliveryId } }); }
  getByIdempotencyKey(idempotencyKey: string) { return this.db.notificationDelivery.findUnique({ where: { idempotencyKey } }); }
  listPending(limit = 100) { return this.db.notificationDelivery.findMany({ where: { status: 'PENDING', availableAt: { lte: new Date() } }, orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: Math.min(Math.max(limit, 1), 100) }); }
  markDelivered(deliveryId: string) { return this.db.notificationDelivery.update({ where: { deliveryId }, data: { status: 'DELIVERED', deliveredAt: new Date(), lastErrorSafe: null } }); }
  markFailed(deliveryId: string, errorCode: string) { return this.db.notificationDelivery.update({ where: { deliveryId }, data: { status: 'FAILED', failedAt: new Date(), lastErrorSafe: errorCode } }); }
}
