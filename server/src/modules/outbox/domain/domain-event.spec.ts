import { customerResourceEvent, eventType, orderLifecycleEvent } from './domain-event';

describe('customer D17 event contracts', () => {
  it('uses stable identities for resource transitions and distinct shipping truth', () => {
    const carrier = customerResourceEvent({ eventType: eventType.shipmentCarrierDelivered, submissionId: 'submission', intakeId: 'intake', status: 'DELIVERED', actorUserId: 'owner', correlationId: 'request', occurredAt: new Date('2026-08-16') });
    const receipt = customerResourceEvent({ eventType: eventType.intakeReceiptConfirmed, submissionId: 'submission', intakeId: 'intake', status: 'RECEIVED', actorUserId: 'owner', correlationId: 'request', occurredAt: new Date('2026-08-16') });
    expect(carrier.eventId).not.toBe(receipt.eventId);
    expect(carrier.payload).not.toHaveProperty('trackingNumber');
  });
  it('deduplicates one order-fill event per execution and recipient order', () => {
    const event = orderLifecycleEvent({ eventType: eventType.orderPartiallyFilled, orderId: 'order', assetId: 'asset', side: 'BUY', units: '1', priceMinor: '164', status: 'PARTIALLY_FILLED', actorUserId: 'owner', correlationId: 'trade', occurredAt: new Date('2026-08-16'), eventSuffix: 'execution' });
    expect(event.eventId).toBe('order.partiallyfilled:order:execution');
  });
});
