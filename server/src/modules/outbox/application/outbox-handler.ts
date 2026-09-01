import { Injectable, Optional } from '@nestjs/common';
import type { OutboxEvent } from '@prisma/client';
import {
  eventType,
  type CustomerResourcePayload,
  type FinancialNotificationPayload,
  type MovementSettledPayload,
  type OrderLifecyclePayload,
  type TradeCompletedPayload,
} from '../domain/domain-event';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationRoutingService } from './notification-routing.service';

export type OutboxFailureKind = 'RETRYABLE' | 'NON_RETRYABLE';

/** A safe, classified failure that controls durable retry behaviour. */
export class OutboxHandlerError extends Error {
  constructor(
    readonly kind: OutboxFailureKind,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Handlers are at-least-once: eventId, not attempt number, is the dedupe key. */
export interface OutboxEventHandler {
  readonly eventType: string;
  readonly supportedSchemaVersion: number;
  handle(event: OutboxEvent): Promise<void>;
}

/**
 * Phase 2's deliberately bounded consumer. It validates the published
 * contract and completes explicitly; future delivery consumers replace/add
 * handlers and must deduplicate on eventId.
 */
export class TradeCompletedOutboxHandler implements OutboxEventHandler {
  readonly eventType = eventType.tradeCompleted;
  readonly supportedSchemaVersion = 1;

  constructor(
    private readonly routing?: NotificationRoutingService,
    private readonly deliveries?: NotificationDeliveryService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const payload = event.payload as Partial<TradeCompletedPayload>;
    if (
      typeof payload.executionId !== 'string' ||
      typeof payload.assetId !== 'string' ||
      typeof payload.units !== 'string' ||
      typeof payload.priceMinor !== 'string' ||
      typeof payload.grossMinor !== 'string' ||
      payload.currency !== 'GBP'
    ) {
      throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_PAYLOAD_INVALID');
    }
    if (this.routing && this.deliveries) {
      await this.deliveries.createManyIdempotent(
        event,
        this.routing.route(event),
      );
    }
  }
}

class RoutedPrivateOutboxHandler implements OutboxEventHandler {
  readonly supportedSchemaVersion = 1;
  constructor(
    readonly eventType: string,
    private readonly validate: (payload: unknown) => boolean,
    private readonly routing?: NotificationRoutingService,
    private readonly deliveries?: NotificationDeliveryService,
  ) {}
  async handle(event: OutboxEvent): Promise<void> {
    if (!event.actorUserId || !this.validate(event.payload))
      throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_PAYLOAD_INVALID');
    if (this.routing && this.deliveries)
      await this.deliveries.createManyIdempotent(
        event,
        this.routing.route(event),
      );
  }
}

@Injectable()
export class OutboxHandlerRegistry {
  private readonly handlers: OutboxEventHandler[];

  constructor(
    @Optional() routing?: NotificationRoutingService,
    @Optional() deliveries?: NotificationDeliveryService,
  ) {
    this.handlers = [
      new TradeCompletedOutboxHandler(routing, deliveries),
      ...[
        eventType.orderOpened,
        eventType.orderCancelled,
        eventType.orderPartiallyFilled,
        eventType.orderFilled,
        eventType.orderExpired,
      ].map(
        (type) =>
          new RoutedPrivateOutboxHandler(
            type,
            isOrderPayload,
            routing,
            deliveries,
          ),
      ),
      ...[
        eventType.submissionSubmitted,
        eventType.submissionChangesRequested,
        eventType.submissionApproved,
        eventType.shipmentTrackingAdded,
        eventType.shipmentInTransit,
        eventType.shipmentCarrierDelivered,
        eventType.intakeReceiptConfirmed,
      ].map(
        (type) =>
          new RoutedPrivateOutboxHandler(
            type,
            isResourcePayload,
            routing,
            deliveries,
          ),
      ),
      new RoutedPrivateOutboxHandler(
        eventType.movementSettled,
        isMovementPayload,
        routing,
        deliveries,
      ),
      new RoutedPrivateOutboxHandler(
        eventType.financialNotification,
        isFinancialPayload,
        routing,
        deliveries,
      ),
    ];
  }

  /** A bounded registration seam for internal, idempotent future consumers. */
  register(handler: OutboxEventHandler) {
    this.handlers.push(handler);
  }

  async dispatch(event: OutboxEvent): Promise<void> {
    const handler = this.handlers.find(
      (candidate) => candidate.eventType === event.eventType,
    );
    if (!handler || handler.supportedSchemaVersion !== event.schemaVersion) {
      throw new OutboxHandlerError('NON_RETRYABLE', 'EVENT_SCHEMA_UNKNOWN');
    }
    await handler.handle(event);
  }
}
function isOrderPayload(value: unknown): value is OrderLifecyclePayload {
  const p = value as Partial<OrderLifecyclePayload>;
  return (
    typeof p?.orderId === 'string' &&
    typeof p.assetId === 'string' &&
    (p.side === 'BUY' || p.side === 'SELL') &&
    typeof p.units === 'string' &&
    ['OPEN', 'CANCELLED', 'PARTIALLY_FILLED', 'FILLED', 'EXPIRED'].includes(
      String(p.status),
    )
  );
}
function isResourcePayload(value: unknown): value is CustomerResourcePayload {
  const p = value as Partial<CustomerResourcePayload>;
  return (
    typeof p?.submissionId === 'string' &&
    typeof p.status === 'string' &&
    (p.intakeId === undefined || typeof p.intakeId === 'string') &&
    (p.requestedItems === undefined ||
      (Array.isArray(p.requestedItems) &&
        p.requestedItems.every((item) => typeof item === 'string'))) &&
    (p.customerMessage === undefined || typeof p.customerMessage === 'string')
  );
}
function isMovementPayload(value: unknown): value is MovementSettledPayload {
  const p = value as Partial<MovementSettledPayload>;
  return (
    typeof p?.movementId === 'string' &&
    (p.type === 'DEPOSIT' || p.type === 'WITHDRAWAL') &&
    typeof p.amountMinor === 'string' &&
    p.currency === 'GBP' &&
    p.status === 'SETTLED'
  );
}
function isFinancialPayload(
  value: unknown,
): value is FinancialNotificationPayload {
  const p = value as Partial<FinancialNotificationPayload>;
  return (
    typeof p?.kind === 'string' &&
    typeof p.title === 'string' &&
    typeof p.body === 'string' &&
    p.currency === 'GBP' &&
    ['money-movement', 'financial-deficit', 'account'].includes(
      String(p.resourceType),
    ) &&
    typeof p.resourceId === 'string' &&
    (p.amountMinor === undefined || typeof p.amountMinor === 'string') &&
    (p.outstandingMinor === undefined || typeof p.outstandingMinor === 'string')
  );
}
