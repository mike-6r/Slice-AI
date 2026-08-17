import { LocalTestMoneyMovementProvider } from './money-movement-provider';

describe('LocalTestMoneyMovementProvider', () => {
  it('creates deterministic local intents without network access', async () => {
    const provider = new LocalTestMoneyMovementProvider();
    await expect(provider.createDeposit({ movementId: 'm-1', amountMinor: '50000', currency: 'GBP' })).resolves.toEqual({
      providerReference: 'local-test:deposit:m-1',
      status: 'PENDING',
    });
    await expect(provider.createWithdrawal({ movementId: 'm-2', amountMinor: '6000', currency: 'GBP', destinationReference: 'test-destination' })).resolves.toEqual({
      providerReference: 'local-test:withdrawal:m-2',
      status: 'PENDING',
    });
  });

  it.each([
    ['pending_provider', 'PENDING'],
    ['processing', 'PROCESSING'],
    ['payment_processed', 'SETTLED'],
    ['returned', 'RETURNED'],
    ['canceled', 'CANCELLED'],
    ['unknown_failure', 'FAILED'],
  ] as const)('normalizes %s to %s', (raw, expected) => {
    expect(new LocalTestMoneyMovementProvider().normalizeStatus(raw)).toBe(expected);
  });

  it('provides deterministic lookup and webhook seams without network I/O', async () => {
    const provider = new LocalTestMoneyMovementProvider();
    await expect(provider.getDeposit({ movementId: 'm-1', providerReference: 'local:m-1' })).resolves.toEqual({ providerReference: 'local:m-1', status: 'PENDING' });
    expect(provider.parseWebhookEvent({ eventId: 'e-1', movementId: 'm-1', status: 'returned' })).toMatchObject({ eventId: 'e-1', movementId: 'm-1', status: 'RETURNED' });
    expect(provider.verifyWebhook({ rawBody: '{}', signature: 'local-test' })).toBe(true);
  });
});
