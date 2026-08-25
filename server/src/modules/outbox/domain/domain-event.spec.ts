import { customerResourceEvent, eventType, financialNotificationEvent, formatGbpMinor, orderLifecycleEvent } from './domain-event';

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
  it('uses deterministic identities for financial notices and formats GBP from minor units', () => {
    const event = financialNotificationEvent({
      kind: 'DEFICIT_PARTIALLY_RECOVERED',
      title: 'Outstanding balance partially recovered',
      body: 'A balance was recovered.',
      resourceType: 'financial-deficit',
      resourceId: 'deficit-1',
      aggregateType: 'financial-deficit',
      aggregateId: 'deficit-1',
      amountMinor: '1250',
      outstandingMinor: '750',
      actorUserId: 'user-1',
      correlationId: 'request-1',
      eventSuffix: '1250',
    });
    expect(event.eventType).toBe(eventType.financialNotification);
    expect(event.eventId).toBe('financial.notification:DEFICIT_PARTIALLY_RECOVERED:deficit-1:1250');
    expect(formatGbpMinor('1250')).toBe('£12.50');
  });
});
