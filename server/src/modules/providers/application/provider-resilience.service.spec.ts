import { ProviderResilienceService } from './provider-resilience.service';

describe('ProviderResilienceService', () => {
  it('opens after bounded temporary failures and closes after a successful half-open probe', () => {
    const service = new ProviderResilienceService();
    service.failure('BRIDGE', 'TEMPORARY'); service.failure('BRIDGE', 'TIMEOUT'); service.failure('BRIDGE', 'RATE_LIMIT');
    expect(service.state('BRIDGE')).toBe('OPEN');
    expect(() => service.beforeOutbound('BRIDGE')).toThrow('temporarily unavailable');
    service.success('BRIDGE');
    expect(service.state('BRIDGE')).toBe('CLOSED');
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
