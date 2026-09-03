import { PriceChartingProvider } from './market-provider.registry';
import type { AppConfig } from '../../config/app-config';

function config(overrides: Partial<AppConfig> = {}) {
  return {
    priceChartingEnabled: true,
    priceChartingApiToken: 'provider-token',
    priceChartingBaseUrl: 'https://www.pricecharting.com',
    priceChartingMinRequestIntervalMs: 1_000,
    priceChartingRequestTimeoutMs: 5_000,
    ...overrides,
  } as AppConfig;
}

describe('PriceChartingProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('supports the canonical Pokémon category aliases used by the catalogue', () => {
    const provider = new PriceChartingProvider(config());

    expect(provider.supports('poke-mon')).toBe(true);
    expect(provider.supports('pokemon-tcg')).toBe(true);
    expect(provider.supports('sports-cards')).toBe(true);
  });

  it('uses the documented product endpoint and token query parameter', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 123,
          'product-name': 'Umbreon VMAX #215/203',
          'console-name': 'Evolving Skies',
          'release-date': '2021-08-27',
          currency: 'USD',
          'image-url': 'https://cdn.pricecharting.test/umbreon.jpg',
          'loose-price': 10000,
          'manual-only-price': 50000,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new PriceChartingProvider(config());

    const product = await provider.getProduct('123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = String(fetchMock.mock.calls[0]![0]);
    expect(requestUrl).toContain('/api/product?id=123');
    expect(requestUrl).toContain('t=provider-token');
    expect(product.providerProductId).toBe('123');
    expect(product.currency).toBe('USD');
    expect(product.imageUrl).toBe('https://cdn.pricecharting.test/umbreon.jpg');
    expect(product.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conditionKey: 'loose-price',
          amountMinor: 10000n,
        }),
        expect.objectContaining({
          conditionKey: 'manual-only-price',
          grader: 'PSA',
          grade: '10',
        }),
      ]),
    );
  });

  it('resolves a SportsCardsPro game URL before generic identity discovery', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            {
              id: 918273,
              'product-name': 'Shohei Ohtani Aa #1',
              'console-name': '2026 Topps All Aces',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new PriceChartingProvider(config());

    await expect(
      provider.resolveReferenceUrl(
        'https://www.sportscardspro.com/game/baseball-cards-2026-topps-all-aces/shohei-ohtani-aa-1',
      ),
    ).resolves.toBe('918273');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/products');
  });

  it('maps documented card condition fields without inventing grader specificity', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 123,
          'product-name': 'Test Card #1',
          'loose-price': 100,
          'manual-only-price': 200,
          'graded-price': 300,
          'new-price': 400,
          'cib-price': 500,
          'box-only-price': 600,
          'bgs-10-price': 700,
          'condition-17-price': 800,
          'condition-18-price': 900,
        }),
        { status: 200 },
      ),
    );
    const provider = new PriceChartingProvider(config());

    const observations = await provider.fetchObservations(
      {
        category: 'pokemon-tcg',
        year: 2021,
        manufacturer: 'Pokémon',
        set: 'Test Set',
        cardNumber: '1',
        title: 'Test Card',
        variant: null,
        grader: 'BGS',
        grade: '9.5',
      },
      '123',
    );

    expect(observations).toHaveLength(9);
    expect(
      observations.find((item) => item.grader === 'PSA')?.matchQuality,
    ).toBe('WEAK');
    expect(
      observations.find((item) => item.grader === 'BGS')?.matchQuality,
    ).toBe('WEAK');
    expect(
      observations.find((item) => item.grader === undefined)?.matchQuality,
    ).toBe('WEAK');
    expect(
      observations.every((item) => item.observationType === 'PRICE_GUIDE'),
    ).toBe(true);
  });

  it('fails closed when the provider is not configured', async () => {
    const provider = new PriceChartingProvider(
      config({ priceChartingEnabled: false, priceChartingApiToken: undefined }),
    );

    await expect(provider.getProduct('123')).rejects.toThrow(
      'PRICECHARTING_NOT_CONFIGURED',
    );
    await expect(provider.health()).resolves.toMatchObject({
      configured: false,
      status: 'UNAVAILABLE',
    });
  });

  it('marks only the raw guide as exact for an ungraded identity', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 2513024,
          'product-name': 'Umbreon VMAX #215/203',
          currency: 'USD',
          'loose-price': 222500,
          'manual-only-price': 400000,
          'graded-price': 300000,
        }),
        { status: 200 },
      ),
    );
    const provider = new PriceChartingProvider(config());

    const observations = await provider.fetchObservations(
      {
        category: 'pokemon-tcg',
        year: 2021,
        manufacturer: 'Nintendo',
        set: 'Evolving Skies',
        cardNumber: '215/203',
        title: 'Umbreon VMAX',
        variant: null,
        grader: null,
        grade: null,
      },
      '2513024',
    );

    expect(
      observations.find((item) => item.grader === undefined)?.matchQuality,
    ).toBe('EXACT');
    expect(
      observations.filter((item) => item.matchQuality === 'EXACT'),
    ).toHaveLength(1);
    expect(
      observations.filter((item) => item.matchQuality === 'WEAK'),
    ).toHaveLength(2);
  });

  it('classifies provider authentication failures separately', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));
    const provider = new PriceChartingProvider(config());

    await expect(provider.getProduct('2513024')).rejects.toThrow(
      'PRICECHARTING_AUTH_FAILED',
    );
  });
});
