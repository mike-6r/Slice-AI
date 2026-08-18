import { ProviderResilienceService } from './provider-resilience.service';

describe('ProviderResilienceService', () => {
  it('opens after bounded temporary failures and closes after a successful half-open probe', () => {
    const service = new ProviderResilienceService();
    service.failure('STRIPE_SANDBOX', 'TEMPORARY'); service.failure('STRIPE_SANDBOX', 'TIMEOUT'); service.failure('STRIPE_SANDBOX', 'RATE_LIMIT');
    expect(service.state('STRIPE_SANDBOX')).toBe('OPEN');
    expect(() => service.beforeOutbound('STRIPE_SANDBOX')).toThrow('temporarily unavailable');
    service.success('STRIPE_SANDBOX');
    expect(service.state('STRIPE_SANDBOX')).toBe('CLOSED');
    expect(service.maxImmediateAttempts).toBe(3);
    expect(service.retryDelayMs(1, () => 0)).toBe(100);
    expect(service.retryDelayMs(1, () => 0.5)).toBe(150);
    expect(service.retryDelayMs(99, () => 0)).toBe(10_000);
    expect(service.retryDelayMs(99, () => 0.5)).toBe(10_500);
  });

  it('does not open for a permanent rejection or validation error', () => {
    const service = new ProviderResilienceService();
    service.failure('LOCAL_TEST', 'REJECTED'); service.failure('LOCAL_TEST', 'VALIDATION'); service.failure('LOCAL_TEST', 'AUTHENTICATION');
    expect(service.state('LOCAL_TEST')).toBe('CLOSED');
  });
});
