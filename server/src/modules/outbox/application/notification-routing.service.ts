import { Injectable } from '@nestjs/common';
import { type NotificationDeliveryChannel, type OutboxEvent } from '@prisma/client';
import { eventType, type MovementSettledPayload, type OrderLifecyclePayload, type TradeCompletedPayload } from '../domain/domain-event';
import { OutboxHandlerError } from './outbox-handler';
import type { DeliveryIntent } from './notification-delivery.service';

export const notificationTopic = { marketListings: 'MARKET_LISTINGS', orderUpdates: 'ORDER_UPDATES', portfolioUpdates: 'PORTFOLIO_UPDATES', securityAlerts: 'SECURITY_ALERTS' } as const;

@Injectable()
export class NotificationRoutingService {
  /** Public platform routes never consult a user preference. */
  route(event: OutboxEvent): DeliveryIntent[] {
    if (event.eventType === eventType.tradeCompleted && event.schemaVersion === 1) return this.publicTrade(event);
    if ((event.eventType === eventType.orderOpened || event.eventType === eventType.orderCancelled) && event.schemaVersion === 1) return this.privateOrder(event);
    if (event.eventType === eventType.movementSettled && event.schemaVersion === 1) return this.privateMovement(event);
    throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_SCHEMA_UNKNOWN');
  }
  private publicTrade(event: OutboxEvent): DeliveryIntent[] {
    const payload = event.payload as Partial<TradeCompletedPayload>;
    if (!isTradePayload(payload)) throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_PAYLOAD_INVALID');
    return [{
      channel: 'DISCORD', destinationKey: 'discord.market_feed', classification: 'PUBLIC',
      topic: notificationTopic.marketListings, mandatory: false, payloadVersion: 1,
      payload: { eventId: event.eventId, executionId: payload.executionId, assetId: payload.assetId, units: payload.units, priceMinor: payload.priceMinor, grossMinor: payload.grossMinor, currency: 'GBP', occurredAt: event.occurredAt.toISOString() },
    }];
  }
  private privateOrder(event: OutboxEvent): DeliveryIntent[] {
    const payload = event.payload as Partial<OrderLifecyclePayload>;
    if (!event.actorUserId || !isOrderPayload(payload)) throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_PAYLOAD_INVALID');
    return [{ channel: 'IN_APP', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic: notificationTopic.orderUpdates, mandatory: false, payloadVersion: 1, payload: { eventId: event.eventId, orderId: payload.orderId, assetId: payload.assetId, side: payload.side, units: payload.units, status: payload.status, occurredAt: event.occurredAt.toISOString() } }];
  }
  private privateMovement(event: OutboxEvent): DeliveryIntent[] {
    const payload = event.payload as Partial<MovementSettledPayload>;
    if (!event.actorUserId || !isMovementPayload(payload)) throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_PAYLOAD_INVALID');
    return [{ channel: 'IN_APP', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic: notificationTopic.portfolioUpdates, mandatory: false, payloadVersion: 1, payload: { eventId: event.eventId, movementId: payload.movementId, type: payload.type, amountMinor: payload.amountMinor, currency: 'GBP', status: 'SETTLED', occurredAt: event.occurredAt.toISOString() } }];
  }

  /** Provider-neutral policy seam for future private events; not used by trade.completed. */
  optionalUserIntent(input: { userId: string; topic: string; channel: NotificationDeliveryChannel; enabled: boolean; mandatory: boolean; payload: DeliveryIntent['payload'] }): DeliveryIntent | null {
    if (!input.mandatory && !input.enabled) return null;
    return { channel: input.channel, destinationKey: `user:${input.userId}`, classification: 'PRIVATE', topic: input.topic, mandatory: input.mandatory, payloadVersion: 1, payload: input.payload };
  }
}

function isTradePayload(payload: Partial<TradeCompletedPayload>): payload is TradeCompletedPayload {
  return typeof payload.executionId === 'string' && typeof payload.assetId === 'string' && typeof payload.units === 'string' && typeof payload.priceMinor === 'string' && typeof payload.grossMinor === 'string' && payload.currency === 'GBP';
}
function isOrderPayload(payload: Partial<OrderLifecyclePayload>): payload is OrderLifecyclePayload { return typeof payload.orderId === 'string' && typeof payload.assetId === 'string' && (payload.side === 'BUY' || payload.side === 'SELL') && typeof payload.units === 'string' && (payload.status === 'OPEN' || payload.status === 'CANCELLED'); }
function isMovementPayload(payload: Partial<MovementSettledPayload>): payload is MovementSettledPayload { return typeof payload.movementId === 'string' && (payload.type === 'DEPOSIT' || payload.type === 'WITHDRAWAL') && typeof payload.amountMinor === 'string' && payload.currency === 'GBP' && payload.status === 'SETTLED'; }
