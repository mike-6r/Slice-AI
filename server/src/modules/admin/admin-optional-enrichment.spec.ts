import { loadOptionalAdminEnrichment } from './admin-optional-enrichment';
import { AdminService } from './admin.service';

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

  it('keeps the detail projection usable when optional detail enrichments fail', async () => {
    const now = new Date('2026-08-25T12:00:00.000Z');
    const db = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'asset-1',
          publicId: 'ASSET-1',
          slug: 'canonical-card',
          title: 'Canonical card',
          status: 'VERIFIED',
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
          year: 2026,
          manufacturer: 'Slice',
          cardNumber: '1',
          edition: null,
          _count: { marketObservations: 0 },
          category: { name: 'Cards', slug: 'cards' },
          collectibleSet: null,
          gradeScaleEntry: null,
          submissions: [
            {
              id: 'submission-1',
              status: 'APPROVED',
              declaredMetadata: null,
              submittedAt: now,
              reviewedAt: now,
              decisionCode: null,
              decisionNote: null,
              owner: null,
              media: [],
              reviews: [],
              intake: null,
            },
          ],
          valuationDecisions: [],
          valuationEvidence: [],
          marketSnapshots: [],
          marketProviderMappings: [],
          marketObservations: [],
          custodyRecord: null,
          controlledBetaBypass: null,
          publication: null,
          insuranceCoverage: [],
          ownershipSupply: null,
          ownershipSupplyPolicy: null,
          initialOffering: null,
          tradingMarket: null,
          tradingOrders: [],
          tradingExecutions: [],
          vaultPublicEvents: [],
        }),
      },
      auditEvent: {
        findMany: jest.fn().mockRejectedValue(new Error('audit secret')),
      },
      assetSubmission: { count: jest.fn() },
      financialAccount: { findFirst: jest.fn() },
    };
    const service = new AdminService(
      db as never,
      { authorize: jest.fn().mockResolvedValue(undefined) } as never,
      { evaluate: jest.fn() } as never,
      { isBeta: false } as never,
      { createPrivateDownloadUrl: jest.fn() } as never,
      {
        adminProjection: jest
          .fn()
          .mockRejectedValue(new Error('ownership secret')),
      } as never,
      {} as never,
      {} as never,
    );

    const detail = await service.collectibleDetail(
      { userId: 'admin-1', sessionId: null } as never,
      'asset-1',
    );

    expect(detail.title).toBe('Canonical card');
    expect(detail.issuance).toBeNull();
    expect(detail.activity).toEqual([]);
    expect(detail.enrichment.auditHistory).toBe('UNAVAILABLE');
    expect(detail.enrichment.ownershipIssuance).toBe('UNAVAILABLE');
    expect(detail.enrichment.initialOfferingProceeds).toBe('NOT_APPLICABLE');
    expect(detail.dossier).toMatchObject({
      workType: 'PRODUCTION',
      snapshot: {
        physical: 'AWAITING_DESTINATION',
        verification: 'NOT_STARTED',
        custody: 'NOT_ESTABLISHED',
        valuation: 'NOT_RECORDED',
        ownership: 'NOT_CONFIGURED',
        market: 'NOT_ELIGIBLE',
      },
      provenance: {
        origin: 'COLLECTOR_SUBMISSION',
        submissionId: 'submission-1',
        submissionStatus: 'APPROVED',
      },
    });
    expect(detail.dossier.relatedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'SOURCE_SUBMISSION',
          id: 'submission-1',
        }),
        expect.objectContaining({
          kind: 'OWNERSHIP',
          id: null,
          status: 'NOT_CONFIGURED',
        }),
      ]),
    );
    expect(detail.dossier.restrictions).toEqual([]);
  });
});
