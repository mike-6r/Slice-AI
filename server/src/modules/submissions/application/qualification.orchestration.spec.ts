import { QualificationService } from './qualification.service';

function harness(
  overrides: Record<string, unknown> = {},
  options: {
    appEnvironment?: 'development' | 'test' | 'beta' | 'production';
    policy?: Record<string, unknown>;
    policyExists?: boolean;
  } = {},
) {
  let runSequence = 0;
  let completedRun: any = null;
  let claimedByOther = false;
  let transactionFailures = 0;
  const downstream = {
    assets: 0,
    intakes: 0,
    offerings: 0,
    preSales: 0,
  };
  const policy: any = {
    id: 'policy-1',
    version: 'GRADED_CARD_AUTO_REVIEW_V1',
    enabled: true,
    enabledCategories: [],
    enabledGraders: ['PSA', 'BGS', 'CGC'],
    qaSamplingBps: 0,
    autoPreSaleLaunch: true,
    defaultPreSaleSupply: 1000n,
    emergencyDisabled: false,
    ...options.policy,
  };
  const policyExists = options.policyExists ?? true;
  const submission = {
    id: 'submission-1',
    ownerUserId: 'collector-1',
    assetId: null,
    categoryId: 'category-1',
    setId: 'set-1',
    gradeScaleEntryId: 'grade-1',
    owner: { accountStatus: 'ACTIVE' },
    category: { slug: 'sports-cards' },
    media: [
      { slot: 'front', status: 'SAFE', deletedAt: null, sizeBytes: 100 },
      { slot: 'back', status: 'SAFE', deletedAt: null, sizeBytes: 100 },
      {
        slot: 'grading-label',
        status: 'SAFE',
        deletedAt: null,
        sizeBytes: 100,
      },
    ],
    gradeScaleEntry: { company: { code: 'PSA' } },
    certificationVerifications: [
      {
        status: 'VERIFIED',
        verificationMode: 'OFFICIAL_API',
        verifiedGrade: '10.00',
      },
      {
        status: 'CLEAR',
        verificationMode: 'SLICE_DUPLICATE_CHECK',
        verifiedGrade: null,
      },
    ],
    preferredIntakeLocation: {
      id: 'vault-1',
      active: true,
      intakeAvailable: true,
      operationallyApproved: true,
      status: 'ACTIVE',
      environment: 'beta',
      acceptingShipments: true,
      acceptingInPerson: true,
      acceptedCategories: [],
      displayName: 'Slice Beta Intake',
      locationType: 'DEMO_TEST',
      region: 'Greater Manchester',
      countryCode: 'GB',
      receiverName: null,
      customerSafeAddress: 'Slice Beta Intake, UK',
      shippingInstructions: 'Ship securely.',
      inPersonInstructions: null,
    },
    preferredDeliveryMethod: 'SHIPMENT',
    marketResearch: [{ state: 'FOUND', observations: [] }],
    declaredMetadata: {
      name: 'Example PSA 10',
      year: '2026',
      set: 'Example set',
      cardNumber: '1',
      grader: 'PSA',
      grade: '10',
      certificationNumber: 'CERT-1',
      inPossession: true,
      collectorExpectedValueMinor: '100000',
      collectorExpectedCurrency: 'GBP',
      collectorExpectedSupply: '1000',
      offerIntentPercent: '50',
    },
    ...overrides,
  };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    autoReviewPolicy: {
      upsert: jest
        .fn()
        .mockImplementation(async ({ create }: any) =>
          policyExists ? policy : { id: 'generated-policy', ...create },
        ),
    },
    assetSubmission: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(submission),
      findUnique: jest.fn().mockResolvedValue({
        status: 'SUBMITTED',
        reviewerId: null,
        decisionCode: null,
      }),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        if (data.assetId) submission.assetId = data.assetId;
        return {};
      }),
    },
    gradingCertificationClaim: {
      findUnique: jest
        .fn()
        .mockImplementation(async () =>
          claimedByOther ? { submissionId: 'other-submission' } : null,
        ),
      upsert: jest.fn().mockResolvedValue({}),
    },
    qualificationRun: {
      findFirst: jest
        .fn()
        .mockImplementation(async ({ where }: any) =>
          where.trigger === 'SUBMISSION_SUBMITTED' ? completedRun : null,
        ),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: `run-${++runSequence}`,
        ...data,
      })),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        completedRun = { id: 'run-1', ...data, checks: [] };
        return completedRun;
      }),
    },
    qualificationCheck: {
      createMany: jest.fn().mockResolvedValue({ count: 10 }),
    },
    asset: {
      create: jest.fn().mockImplementation(async () => {
        downstream.assets += 1;
        return {
          id: 'asset-1',
          title: 'Example PSA 10',
          year: 2026,
          manufacturer: null,
          edition: null,
          cardNumber: '1',
          deadlineAt: null,
        };
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'asset-1',
        title: 'Example PSA 10',
        year: 2026,
        manufacturer: null,
        edition: null,
        cardNumber: '1',
      }),
    },
    marketProviderMapping: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'market-mapping-1' }),
    },
    marketObservation: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    submissionIntake: {
      upsert: jest.fn().mockImplementation(async () => {
        downstream.intakes += 1;
        return { id: 'intake-1' };
      }),
    },
    initialOffering: {
      upsert: jest.fn().mockImplementation(async () => {
        downstream.offerings += 1;
        return { id: 'offering-1' };
      }),
    },
    preSale: {
      upsert: jest.fn().mockImplementation(async () => {
        downstream.preSales += 1;
        return {
          id: 'sale-1',
          deadlineAt: new Date('2026-09-19T00:00:00.000Z'),
        };
      }),
    },
    verificationReview: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    preSaleAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    $transaction: jest.fn(async (callback: (db: any) => Promise<unknown>) => {
      if (transactionFailures > 0) {
        transactionFailures -= 1;
        throw new Error('temporary database failure');
      }
      return callback(tx);
    }),
    assetSubmission: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'submission-1',
          qualificationRuns: [{ outcome: 'AUTO_QUALIFIED' }],
        },
      ]),
    },
    autoReviewPolicy: {
      findUnique: jest.fn().mockResolvedValue(policy),
    },
    qualificationRun: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: `failed-${++runSequence}`,
        ...data,
      })),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const service = new QualificationService(prisma, {
    appEnvironment: options.appEnvironment ?? 'beta',
    preSaleDeadlineDays: 14,
  } as never);
  return {
    service,
    tx,
    prisma,
    downstream,
    setClaimedByOther(value: boolean) {
      claimedByOther = value;
    },
    setTransactionFailures(value: number) {
      transactionFailures = value;
    },
  };
}

describe('automated qualification orchestration', () => {
  it('auto-qualifies a clean graded card and creates the downstream pipeline', async () => {
    const h = harness();
    const result = await h.service.runForSubmission('submission-1');

    expect(result).toMatchObject({
      outcome: 'AUTO_QUALIFIED',
      customerStatus: 'PRE_SALE_QUALIFIED',
    });
    expect(h.downstream).toEqual({
      assets: 1,
      intakes: 1,
      offerings: 1,
      preSales: 1,
    });
    expect(h.tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'EVIDENCE_AUTO_ACCEPTED' }),
      }),
    );
  });

  it('auto-qualifies a Slice-clear card while provider verification is pending', async () => {
    const h = harness({
      certificationVerifications: [
        {
          status: 'CLEAR',
          verificationMode: 'SLICE_DUPLICATE_CHECK',
          verifiedGrade: null,
        },
      ],
    });
    const result = await h.service.runForSubmission('submission-1');

    expect(result).toMatchObject({
      outcome: 'AUTO_QUALIFIED',
      customerStatus: 'PRE_SALE_QUALIFIED',
    });
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        code: 'CERTIFICATION_PROVIDER',
        result: 'PASS',
        mandatory: false,
      }),
    );
    expect(h.downstream).toEqual({
      assets: 1,
      intakes: 1,
      offerings: 1,
      preSales: 1,
    });
  });

  it('routes incomplete evidence to the collector without creating downstream records', async () => {
    const h = harness({ media: [] });
    const result = await h.service.runForSubmission('submission-1');

    expect(result).toMatchObject({
      outcome: 'COLLECTOR_ACTION_REQUIRED',
      customerStatus: 'NEEDS_YOUR_ACTION',
    });
    expect(h.downstream).toEqual({
      assets: 0,
      intakes: 0,
      offerings: 0,
      preSales: 0,
    });
  });

  it('honors an explicit environment policy disable as a human-review exception', async () => {
    const h = harness({}, { policy: { enabled: false } });
    const result = await h.service.runForSubmission('submission-1');

    expect(result).toMatchObject({ outcome: 'HUMAN_REVIEW_REQUIRED' });
    expect(result.reasons).toContain(
      'Automated qualification is currently disabled by policy.',
    );
    expect(h.downstream).toEqual({
      assets: 0,
      intakes: 0,
      offerings: 0,
      preSales: 0,
    });
    expect(h.tx.autoReviewPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { policyKey: 'environment:beta' } }),
    );
  });

  it('uses an enabled fresh beta policy and a fail-safe fresh production policy', async () => {
    const beta = harness({}, { appEnvironment: 'beta', policyExists: false });
    await expect(
      beta.service.runForSubmission('submission-1'),
    ).resolves.toMatchObject({ outcome: 'AUTO_QUALIFIED' });
    expect(beta.tx.autoReviewPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          policyKey: 'environment:beta',
          enabled: true,
        }),
      }),
    );

    const production = harness(
      {},
      { appEnvironment: 'production', policyExists: false },
    );
    await expect(
      production.service.runForSubmission('submission-1'),
    ).resolves.toMatchObject({ outcome: 'HUMAN_REVIEW_REQUIRED' });
    expect(production.tx.autoReviewPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          policyKey: 'environment:production',
          enabled: false,
        }),
      }),
    );
  });

  it('routes an unsupported/ambiguous grader to human review', async () => {
    const h = harness({
      gradeScaleEntry: { company: { code: 'TAG' } },
      declaredMetadata: {
        name: 'Example TAG 10',
        year: '2026',
        set: 'Example set',
        cardNumber: '1',
        grader: 'TAG',
        grade: '10',
        certificationNumber: 'CERT-1',
        inPossession: true,
        collectorExpectedValueMinor: '100000',
        collectorExpectedCurrency: 'GBP',
        collectorExpectedSupply: '1000',
        offerIntentPercent: '50',
      },
    });
    const result = await h.service.runForSubmission('submission-1');
    expect(result).toMatchObject({
      outcome: 'HUMAN_REVIEW_REQUIRED',
      customerStatus: 'NEEDS_STAFF_REVIEW',
    });
  });

  it('blocks a duplicate certification before canonicalization', async () => {
    const h = harness();
    h.setClaimedByOther(true);
    const result = await h.service.runForSubmission('submission-1');

    expect(result).toMatchObject({
      outcome: 'BLOCKED',
      customerStatus: 'BLOCKED_CONTACT_SUPPORT',
    });
    expect(h.downstream.assets).toBe(0);
  });

  it('retries a temporary transaction failure without duplicate downstream writes', async () => {
    const h = harness();
    h.setTransactionFailures(1);
    const result = await h.service.runForSubmission('submission-1');

    expect(result).toMatchObject({ outcome: 'AUTO_QUALIFIED' });
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(h.downstream).toEqual({
      assets: 1,
      intakes: 1,
      offerings: 1,
      preSales: 1,
    });
  });

  it('records a retryable system state after repeated temporary failure', async () => {
    const h = harness();
    h.setTransactionFailures(2);
    const result = await h.service.runForSubmission('submission-1');

    expect(result).toMatchObject({
      outcome: null,
      customerStatus: 'SYSTEM_RETRYING',
      errorCode: 'AUTOMATION_RETRYABLE',
    });
    expect(h.downstream).toEqual({
      assets: 0,
      intakes: 0,
      offerings: 0,
      preSales: 0,
    });
    expect(h.prisma.qualificationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'AUTOMATION_RETRYABLE',
        }),
      }),
    );
  });

  it('resumes a flagged submission when the exception is resolved', async () => {
    const h = harness();
    h.setClaimedByOther(true);
    await expect(
      h.service.runForSubmission('submission-1'),
    ).resolves.toMatchObject({ outcome: 'BLOCKED' });
    h.setClaimedByOther(false);
    const result = await h.service.runForSubmission('submission-1', {
      trigger: 'ADMIN_RERUN',
      retryOfId: 'run-1',
    });

    expect(result).toMatchObject({ outcome: 'AUTO_QUALIFIED' });
    expect(h.downstream.assets).toBe(1);
  });

  it('promotes the exact submission market research onto the canonical asset', async () => {
    const collectedAt = new Date('2026-09-09T12:00:00.000Z');
    const h = harness({
      marketResearch: [
        {
          id: 'research-1',
          state: 'LIMITED',
          collectedAt,
          observations: [
            {
              id: 'research-observation-1',
              providerCode: 'PRICECHARTING',
              externalReferenceId: '11012108',
              externalUrl:
                'https://www.pricecharting.com/game/one-piece-carrying-on-his-will/monkeydluffy-red-manga-op13-118',
              observationType: 'PRICE_GUIDE',
              originalTitle: 'Monkey.D.Luffy [Red Manga] OP13-118',
              amountMinor: 4599n,
              currency: 'USD',
              observedAt: collectedAt,
              soldAt: null,
              grader: 'PSA',
              grade: '10',
              matchQuality: 'EXACT',
              includedInSnapshot: true,
              exclusionReason: null,
            },
          ],
        },
      ],
    });

    await h.service.runForSubmission('submission-1');

    expect(h.tx.marketProviderMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          assetId: 'asset-1',
          providerCode: 'PRICECHARTING',
          providerExternalId: '11012108',
          currentPriceMinor: 4599n,
          currentCurrency: 'USD',
        }),
      }),
    );
    expect(h.tx.marketObservation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            assetId: 'asset-1',
            mappingId: 'market-mapping-1',
            providerExternalId: '11012108',
            included: true,
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it('is idempotent when the submission trigger is repeated', async () => {
    const h = harness();
    await h.service.runForSubmission('submission-1');
    const repeated = await h.service.runForSubmission('submission-1');

    expect(repeated).toMatchObject({ outcome: 'AUTO_QUALIFIED' });
    expect(h.downstream).toEqual({
      assets: 1,
      intakes: 1,
      offerings: 1,
      preSales: 1,
    });
  });

  it('reruns through upserts without duplicating the canonical collectible', async () => {
    const h = harness();
    await h.service.runForSubmission('submission-1');
    await h.service.runForSubmission('submission-1', {
      trigger: 'ADMIN_RERUN',
      retryOfId: 'run-1',
    });

    expect(h.downstream.assets).toBe(1);
    expect(h.tx.submissionIntake.upsert).toHaveBeenCalledTimes(2);
    expect(h.tx.initialOffering.upsert).toHaveBeenCalledTimes(2);
    expect(h.tx.preSale.upsert).toHaveBeenCalledTimes(2);
  });

  it('repairs a stale manual-review claim after automated qualification', async () => {
    const h = harness();
    await h.service.runForSubmission('submission-1');

    await expect(h.service.reconcileAutoQualifiedSubmissions()).resolves.toBe(
      1,
    );
    expect(h.tx.verificationReview.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { submissionId: 'submission-1', status: 'CLAIMED' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          decision: 'AUTO_PROCESSED',
          reasonCode: 'AUTO_QUALIFIED',
        }),
      }),
    );
  });
});
