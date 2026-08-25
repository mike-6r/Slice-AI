import { CurrencyService } from './currency.service';

type TestCache = { key: jest.Mock; get: jest.Mock; set: jest.Mock };

function cacheStore(
  overrides: Partial<Pick<TestCache, 'get' | 'set'>> = {},
): TestCache {
  return {
    key: jest.fn(
      (purpose: string, suffix: string) => `slice:test:${purpose}:${suffix}`,
    ),
    get: overrides.get ?? jest.fn().mockResolvedValue(null),
    set: overrides.set ?? jest.fn().mockResolvedValue(true),
  } as TestCache;
}

describe('CurrencyService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a validated GBP-base snapshot and caches the provider result', async () => {
    const cache = cacheStore();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { base: 'GBP', quote: 'USD', rate: 1.25, date: '2026-08-25' },
        { base: 'GBP', quote: 'CAD', rate: 1.7, date: '2026-08-25' },
        { base: 'GBP', quote: 'EUR', rate: 1.16, date: '2026-08-25' },
      ],
    } as Response);

    await expect(
      new CurrencyService(cache as never).rates(),
    ).resolves.toMatchObject({
      baseCurrency: 'GBP',
      rates: { GBP: 1, USD: 1.25, CAD: 1.7, EUR: 1.16 },
      asOf: '2026-08-25',
      cached: false,
    });
    expect(cache.set).toHaveBeenCalledWith(
      'slice:test:fx-rates:gbp',
      expect.stringContaining('"baseCurrency":"GBP"'),
      { ttlSeconds: 6 * 60 * 60 },
    );
  });

  it('uses a valid cached snapshot without calling the provider', async () => {
    const snapshot = {
      baseCurrency: 'GBP',
      rates: { GBP: 1, USD: 1.25, CAD: 1.7, EUR: 1.16 },
      asOf: '2026-08-25',
      fetchedAt: '2026-08-25T12:00:00.000Z',
      source: 'test',
    };
    const cache = cacheStore({
      get: jest.fn().mockResolvedValue(JSON.stringify(snapshot)),
    });
    const fetch = jest.spyOn(global, 'fetch');

    await expect(
      new CurrencyService(cache as never).rates(),
    ).resolves.toMatchObject({
      ...snapshot,
      cached: true,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when the provider response is incomplete', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { base: 'GBP', quote: 'USD', rate: 1.25, date: '2026-08-25' },
      ],
    } as Response);

    await expect(
      new CurrencyService(cacheStore() as never).rates(),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'FX_RATES_UNAVAILABLE',
        message:
          'Currency conversion is temporarily unavailable. GBP amounts remain available.',
      },
    });
  });
});
