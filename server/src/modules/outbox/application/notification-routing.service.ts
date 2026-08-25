import { Injectable } from '@nestjs/common';
import { type NotificationDeliveryChannel, type OutboxEvent } from '@prisma/client';
import { eventType, type CustomerResourcePayload, type FinancialNotificationPayload, type MovementSettledPayload, type OrderLifecyclePayload, type TradeCompletedPayload } from '../domain/domain-event';
import { OutboxHandlerError } from './outbox-handler';
import type { DeliveryIntent } from './notification-delivery.service';

export const notificationTopic = { marketListings: 'MARKET_LISTINGS', orderUpdates: 'ORDER_UPDATES', portfolioUpdates: 'PORTFOLIO_UPDATES', collectorActions: 'COLLECTOR_ACTIONS', shipping: 'SHIPPING', securityAlerts: 'SECURITY_ALERTS', financialAlerts: 'FINANCIAL_ALERTS' } as const;

@Injectable()
export class NotificationRoutingService {
  /** Public platform routes never consult a user preference. */
  route(event: OutboxEvent): DeliveryIntent[] {
    if (event.eventType === eventType.tradeCompleted && event.schemaVersion === 1) return this.publicTrade(event);
    if ([eventType.orderOpened, eventType.orderCancelled, eventType.orderPartiallyFilled, eventType.orderFilled, eventType.orderExpired].includes(event.eventType as never) && event.schemaVersion === 1) return this.privateOrder(event);
    if ([eventType.submissionSubmitted, eventType.submissionChangesRequested, eventType.submissionApproved].includes(event.eventType as never) && event.schemaVersion === 1) return this.privateResource(event, notificationTopic.collectorActions);
    if ([eventType.shipmentTrackingAdded, eventType.shipmentInTransit, eventType.shipmentCarrierDelivered, eventType.intakeReceiptConfirmed].includes(event.eventType as never) && event.schemaVersion === 1) return this.privateResource(event, notificationTopic.shipping);
    if (event.eventType === eventType.movementSettled && event.schemaVersion === 1) return this.privateMovement(event);
    if (event.eventType === eventType.financialNotification && event.schemaVersion === 1) return this.privateFinancial(event);
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
    const order = { eventId: event.eventId, eventType: event.eventType, orderId: payload.orderId, assetId: payload.assetId, side: payload.side, units: payload.units, status: payload.status, ...(payload.priceMinor ? { priceMinor: payload.priceMinor } : {}), occurredAt: event.occurredAt.toISOString() };
    return [
      { channel: 'IN_APP', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic: notificationTopic.orderUpdates, mandatory: false, payloadVersion: 1, payload: order },
      { channel: 'DISCORD', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic: notificationTopic.orderUpdates, mandatory: false, payloadVersion: 1, payload: order },
    ];
  }
  private privateMovement(event: OutboxEvent): DeliveryIntent[] {
    const payload = event.payload as Partial<MovementSettledPayload>;
    if (!event.actorUserId || !isMovementPayload(payload)) throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_PAYLOAD_INVALID');
    return [{ channel: 'IN_APP', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic: notificationTopic.portfolioUpdates, mandatory: false, payloadVersion: 1, payload: { eventId: event.eventId, movementId: payload.movementId, type: payload.type, amountMinor: payload.amountMinor, currency: 'GBP', status: 'SETTLED', occurredAt: event.occurredAt.toISOString() } }];
  }
  private privateFinancial(event: OutboxEvent): DeliveryIntent[] {
    const payload = event.payload as Partial<FinancialNotificationPayload>;
    if (!event.actorUserId || !isFinancialPayload(payload)) throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_PAYLOAD_INVALID');
    const value = {
      eventId: event.eventId,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      currency: 'GBP' as const,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      ...(payload.amountMinor === undefined ? {} : { amountMinor: payload.amountMinor }),
      ...(payload.outstandingMinor === undefined ? {} : { outstandingMinor: payload.outstandingMinor }),
      occurredAt: event.occurredAt.toISOString(),
    };
    return [
      { channel: 'IN_APP', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic: notificationTopic.financialAlerts, mandatory: true, payloadVersion: 1, payload: value },
      { channel: 'EMAIL', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic: notificationTopic.financialAlerts, mandatory: true, payloadVersion: 1, payload: value },
    ];
  }
  private privateResource(event: OutboxEvent, topic: string): DeliveryIntent[] {
    const payload = event.payload as Partial<CustomerResourcePayload>;
    if (!event.actorUserId || !isResourcePayload(payload)) throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_PAYLOAD_INVALID');
    const value = { eventId: event.eventId, eventType: event.eventType, submissionId: payload.submissionId, ...(payload.intakeId ? { intakeId: payload.intakeId } : {}), status: payload.status, occurredAt: event.occurredAt.toISOString() };
    return [{ channel: 'IN_APP', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic, mandatory: false, payloadVersion: 1, payload: value }, { channel: 'DISCORD', destinationKey: `user:${event.actorUserId}`, classification: 'PRIVATE', topic, mandatory: false, payloadVersion: 1, payload: value }];
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
function isOrderPayload(payload: Partial<OrderLifecyclePayload>): payload is OrderLifecyclePayload { return typeof payload.orderId === 'string' && typeof payload.assetId === 'string' && (payload.side === 'BUY' || payload.side === 'SELL') && typeof payload.units === 'string' && ['OPEN', 'CANCELLED', 'PARTIALLY_FILLED', 'FILLED', 'EXPIRED'].includes(String(payload.status)); }
function isResourcePayload(payload: Partial<CustomerResourcePayload>): payload is CustomerResourcePayload { return typeof payload.submissionId === 'string' && typeof payload.status === 'string' && (payload.intakeId === undefined || typeof payload.intakeId === 'string'); }
function isMovementPayload(payload: Partial<MovementSettledPayload>): payload is MovementSettledPayload { return typeof payload.movementId === 'string' && (payload.type === 'DEPOSIT' || payload.type === 'WITHDRAWAL') && typeof payload.amountMinor === 'string' && payload.currency === 'GBP' && payload.status === 'SETTLED'; }
function isFinancialPayload(payload: Partial<FinancialNotificationPayload>): payload is FinancialNotificationPayload {
  return typeof payload.kind === 'string' && typeof payload.title === 'string' && typeof payload.body === 'string' && payload.currency === 'GBP' && ['money-movement', 'financial-deficit', 'account'].includes(String(payload.resourceType)) && typeof payload.resourceId === 'string' && (payload.amountMinor === undefined || typeof payload.amountMinor === 'string') && (payload.outstandingMinor === undefined || typeof payload.outstandingMinor === 'string');
}
