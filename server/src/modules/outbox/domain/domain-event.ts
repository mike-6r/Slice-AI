import { randomUUID } from 'node:crypto';

export type JsonPrimitive = string | number | boolean | null;
export type SafeJson = JsonPrimitive | SafeJson[] | { [key: string]: SafeJson };

export type DomainEventEnvelope<TPayload extends SafeJson = SafeJson> = Readonly<{
  eventId: string;
  eventType: string;
  schemaVersion: number;
  occurredAt: Date;
  aggregate: Readonly<{ type: string; id: string }>;
  payload: TPayload;
  metadata?: SafeJson;
  correlationId?: string;
  causationId?: string;
  actorUserId?: string;
}>;

/** Stable dotted lower-case contracts, never class names or persistence types. */
export const eventType = { tradeCompleted: 'trade.completed', orderOpened: 'order.opened', orderCancelled: 'order.cancelled', orderPartiallyFilled: 'order.partiallyfilled', orderFilled: 'order.filled', orderExpired: 'order.expired', movementSettled: 'movement.settled', submissionChangesRequested: 'submission.changesrequested', submissionApproved: 'submission.approved', shipmentTrackingAdded: 'shipment.trackingadded', shipmentInTransit: 'shipment.intransit', shipmentCarrierDelivered: 'shipment.carrierdelivered', intakeReceiptConfirmed: 'intake.receiptconfirmed' } as const;
const eventTypePattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;

export function createDomainEvent<TPayload extends SafeJson>(input: Omit<DomainEventEnvelope<TPayload>, 'eventId' | 'occurredAt'> & { eventId?: string; occurredAt?: Date }): DomainEventEnvelope<TPayload> {
  const event: DomainEventEnvelope<TPayload> = { ...input, eventId: input.eventId ?? randomUUID(), occurredAt: input.occurredAt ?? new Date() };
  assertDomainEvent(event);
  return event;
}

export function assertDomainEvent(event: DomainEventEnvelope): void {
  if (!event.eventId || !eventTypePattern.test(event.eventType)) throw new Error('EVENT_SCHEMA_UNKNOWN');
  if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) throw new Error('EVENT_SCHEMA_UNKNOWN');
  if (!event.aggregate.type || !event.aggregate.id || Number.isNaN(event.occurredAt.getTime())) throw new Error('EVENT_SCHEMA_UNKNOWN');
  assertSafeJson(event.payload);
  if (event.metadata !== undefined) assertSafeJson(event.metadata);
}

export function assertSafeJson(value: unknown): asserts value is SafeJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (Number.isFinite(value)) return; throw new Error('EVENT_PAYLOAD_INVALID'); }
  if (Array.isArray(value)) { for (const child of value) assertSafeJson(child); return; }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) { for (const child of Object.values(value as Record<string, unknown>)) assertSafeJson(child); return; }
  throw new Error('EVENT_PAYLOAD_INVALID');
}

export type TradeCompletedPayload = { executionId: string; assetId: string; units: string; priceMinor: string; grossMinor: string; currency: 'GBP' };

export function tradeCompletedEvent(input: TradeCompletedPayload & { correlationId: string; occurredAt: Date }): DomainEventEnvelope<TradeCompletedPayload> {
  return createDomainEvent({
    eventId: `trade.completed:${input.executionId}`,
    eventType: eventType.tradeCompleted,
    schemaVersion: 1,
    occurredAt: input.occurredAt,
    aggregate: { type: 'trading-execution', id: input.executionId },
    correlationId: input.correlationId,
    payload: { executionId: input.executionId, assetId: input.assetId, units: input.units, priceMinor: input.priceMinor, grossMinor: input.grossMinor, currency: 'GBP' },
  });
}

export type OrderLifecyclePayload = { orderId: string; assetId: string; side: 'BUY' | 'SELL'; units: string; status: 'OPEN' | 'CANCELLED' | 'PARTIALLY_FILLED' | 'FILLED' | 'EXPIRED'; priceMinor?: string };
export function orderLifecycleEvent(input: OrderLifecyclePayload & { eventType: typeof eventType.orderOpened | typeof eventType.orderCancelled | typeof eventType.orderPartiallyFilled | typeof eventType.orderFilled | typeof eventType.orderExpired; correlationId: string; actorUserId: string; occurredAt: Date; eventSuffix?: string }): DomainEventEnvelope<OrderLifecyclePayload> {
  return createDomainEvent({ eventId: `${input.eventType}:${input.orderId}${input.eventSuffix ? `:${input.eventSuffix}` : ''}`, eventType: input.eventType, schemaVersion: 1, occurredAt: input.occurredAt, aggregate: { type: 'trading-order', id: input.orderId }, correlationId: input.correlationId, actorUserId: input.actorUserId, payload: { orderId: input.orderId, assetId: input.assetId, side: input.side, units: input.units, status: input.status, ...(input.priceMinor ? { priceMinor: input.priceMinor } : {}) } });
}

export type CustomerResourcePayload = { submissionId: string; intakeId?: string; status: string };
export function customerResourceEvent(input: CustomerResourcePayload & { eventType: typeof eventType.submissionChangesRequested | typeof eventType.submissionApproved | typeof eventType.shipmentTrackingAdded | typeof eventType.shipmentInTransit | typeof eventType.shipmentCarrierDelivered | typeof eventType.intakeReceiptConfirmed; correlationId: string; actorUserId: string; occurredAt: Date; eventSuffix?: string }): DomainEventEnvelope<CustomerResourcePayload> {
  return createDomainEvent({ eventId: `${input.eventType}:${input.submissionId}${input.eventSuffix ? `:${input.eventSuffix}` : ''}`, eventType: input.eventType, schemaVersion: 1, occurredAt: input.occurredAt, aggregate: { type: input.intakeId ? 'submission-intake' : 'asset-submission', id: input.intakeId ?? input.submissionId }, correlationId: input.correlationId, actorUserId: input.actorUserId, payload: { submissionId: input.submissionId, ...(input.intakeId ? { intakeId: input.intakeId } : {}), status: input.status } });
}

export type MovementSettledPayload = { movementId: string; type: 'DEPOSIT' | 'WITHDRAWAL'; amountMinor: string; currency: 'GBP'; status: 'SETTLED' };
export function movementSettledEvent(input: MovementSettledPayload & { correlationId: string; actorUserId: string; occurredAt: Date }): DomainEventEnvelope<MovementSettledPayload> {
  return createDomainEvent({ eventId: `movement.settled:${input.movementId}`, eventType: eventType.movementSettled, schemaVersion: 1, occurredAt: input.occurredAt, aggregate: { type: 'money-movement', id: input.movementId }, correlationId: input.correlationId, actorUserId: input.actorUserId, payload: { movementId: input.movementId, type: input.type, amountMinor: input.amountMinor, currency: 'GBP', status: 'SETTLED' } });
}
