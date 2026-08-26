import { loadOptionalAdminEnrichment } from './admin-optional-enrichment';

describe('admin optional enrichment', () => {
  const logger = { warn: jest.fn() };

  beforeEach(() => {
    logger.warn.mockReset();
  });

  it('keeps the core catalogue projection when a reference provider fails', async () => {
    const core = { id: 'asset-1', title: 'Canonical card' };
    const reference = await loadOptionalAdminEnrichment(
      'pricecharting-reference',
      async () => {
        throw new Error('provider token=must-not-be-logged');
      },
      null,
      logger,
    );

    expect({ ...core, reference: reference.value }).toEqual({
      ...core,
      reference: null,
    });
    expect(reference.state).toBe('UNAVAILABLE');
    expect(logger.warn).toHaveBeenCalledWith(
      'Admin optional enrichment unavailable: pricecharting-reference (Error)',
    );
    expect(logger.warn.mock.calls[0]?.[0]).not.toContain('must-not-be-logged');
  });

  it('does not turn missing optional media or ownership data into fake defaults', async () => {
    const media = await loadOptionalAdminEnrichment(
      'collectible-media',
      async () => {
        throw new Error('storage secret');
      },
      null,
      logger,
    );
    const ownership = await loadOptionalAdminEnrichment(
      'collectible-ownership-issuance',
      async () => {
        throw new Error('ownership failure');
      },
      null,
      logger,
    );

    expect(media.value).toBeNull();
    expect(ownership.value).toBeNull();
    expect(media.state).toBe('UNAVAILABLE');
    expect(ownership.state).toBe('UNAVAILABLE');
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls.flat().join(' ')).not.toContain('secret');
    expect(logger.warn.mock.calls.flat().join(' ')).not.toContain('failure');
  });

  it('preserves successful optional values and does not log them', async () => {
    const result = await loadOptionalAdminEnrichment(
      'collector-accepted-count',
      async () => 3,
      null,
      logger,
    );

    expect(result).toEqual({ value: 3, state: 'AVAILABLE' });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
