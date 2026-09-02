import { TrustedReferenceImportService } from './trusted-reference-import.service';

describe('TrustedReferenceImportService', () => {
  const service = new TrustedReferenceImportService();

  it('imports a supported PriceCharting card without fetching the URL', () => {
    expect(
      service.identify(
        'https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215',
      ),
    ).toMatchObject({
      status: 'MATCH_FOUND',
      provider: 'PriceCharting',
      identity: {
        name: 'Umbreon VMAX',
        cardNumber: '215/203',
      },
      customerReference: {
        externalReferenceId: '2513024',
        normalizedUrl:
          'https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215',
        matchQuality: 'MATCH_FOUND',
      },
    });
  });

  it('preserves the exact Base Set 1st Edition Charizard product identity', () => {
    expect(
      service.identify(
        'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4#completed',
      ),
    ).toMatchObject({
      status: 'MATCH_FOUND',
      provider: 'PriceCharting',
      identity: {
        name: 'Charizard',
        year: '1999',
        set: 'Pokemon Base Set',
        cardNumber: '4',
        edition: '1st Edition',
        variant: 'Holo',
      },
      customerReference: {
        externalReferenceId: '715593',
        normalizedUrl:
          'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4',
        matchQuality: 'MATCH_FOUND',
      },
    });
  });

  it('accepts SportsCardsPro game URLs as PriceCharting references', () => {
    expect(
      service.identify(
        'https://www.sportscardspro.com/game/baseball-cards-2026-topps-all-aces/shohei-ohtani-aa-1',
      ),
    ).toMatchObject({
      status: 'PARTIAL_MATCH',
      provider: 'PriceCharting',
      identity: {
        name: 'Shohei Ohtani Aa',
        set: 'Baseball Cards 2026 Topps All Aces',
        cardNumber: '1',
      },
      customerReference: {
        provider: 'PriceCharting',
        normalizedUrl:
          'https://www.pricecharting.com/game/baseball-cards-2026-topps-all-aces/shohei-ohtani-aa-1',
        matchQuality: 'PARTIAL_MATCH',
      },
    });
  });

  it('uses the retained exact product id for live confirmation', async () => {
    const getProduct = jest.fn().mockResolvedValue({
      providerProductId: '715593',
      title: 'Charizard 1st Edition #4',
      set: 'Pokemon Base Set',
      year: 1999,
      upc: null,
      releaseDate: '1999-01-09',
      currency: 'USD',
      imageUrl: 'https://cdn.pricecharting.test/charizard.jpg',
      references: [],
    });
    const live = new TrustedReferenceImportService({
      get: () => ({
        getProduct,
        health: async () => ({
          configured: true,
          status: 'UP',
          detail: 'test',
        }),
      }),
    } as never);

    const result = await live.identifyLive(
      'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4#completed',
    );

    expect(getProduct).toHaveBeenCalledWith('715593');
    expect(result.customerReference?.externalReferenceId).toBe('715593');
    expect(result.customerReference?.imageUrl).toBe(
      'https://cdn.pricecharting.test/charizard.jpg',
    );
    expect(result.status).toBe('MATCH_FOUND');
  });

  it('rejects arbitrary and private-network URLs', () => {
    expect(service.identify('http://127.0.0.1:3000/admin').status).toBe(
      'UNSUPPORTED',
    );
    expect(service.identify('https://example.test/listing').status).toBe(
      'UNSUPPORTED',
    );
  });

  it('keeps eBay unavailable until its approved API adapter is configured', () => {
    expect(
      service.identify('https://www.ebay.com/itm/123456789012'),
    ).toMatchObject({
      status: 'PROVIDER_UNAVAILABLE',
      provider: 'eBay',
      customerReference: null,
    });
  });

  it('returns only a partial match for an unknown approved PriceCharting path', () => {
    expect(
      service.identify(
        'https://www.pricecharting.com/game/pokemon-test/example-card-99',
      ),
    ).toMatchObject({
      status: 'PARTIAL_MATCH',
      identity: { name: 'Example Card', set: 'Pokemon Test' },
      customerReference: { matchQuality: 'PARTIAL_MATCH' },
    });
  });
});
