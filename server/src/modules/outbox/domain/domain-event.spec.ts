import { assertSafeJson, createDomainEvent, eventType, tradeCompletedEvent } from './domain-event';

describe('Document 017 domain event envelope', () => {
  it('creates a versioned, dotted-name safe trade envelope without private authority', () => {
    const event = tradeCompletedEvent({ executionId: 'execution-1', assetId: 'asset-1', units: '10', priceMinor: '125', grossMinor: '1250', currency: 'GBP', correlationId: 'trade:asset-1:1', occurredAt: new Date('2026-08-08T00:00:00.000Z') });
    expect(event).toMatchObject({ eventId: 'trade.completed:execution-1', eventType: eventType.tradeCompleted, schemaVersion: 1, aggregate: { type: 'trading-execution', id: 'execution-1' }, payload: { executionId: 'execution-1', assetId: 'asset-1', units: '10', priceMinor: '125', grossMinor: '1250', currency: 'GBP' } });
    expect(JSON.stringify(event.payload)).not.toMatch(/userId|accountId|counterparty|reservation|journal/i);
  });

  it('rejects invalid event names and non-plain payload values', () => {
    expect(() => createDomainEvent({ eventType: 'TradeCompleted', schemaVersion: 1, aggregate: { type: 'trade', id: '1' }, payload: {} })).toThrow('EVENT_SCHEMA_UNKNOWN');
    expect(() => assertSafeJson({ at: new Date() })).toThrow('EVENT_PAYLOAD_INVALID');
    expect(() => assertSafeJson({ units: 1n })).toThrow('EVENT_PAYLOAD_INVALID');
  });
});
