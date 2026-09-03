import { operationsQueueTestUtils } from './lifecycle.service';

describe('Asset Operations queue authority', () => {
  it('keeps physical intake as an entry prerequisite rather than an economic stage', () => {
    expect(
      operationsQueueTestUtils.physicalEntryBlockers(
        'IN_CUSTODY',
        'VERIFIED',
        'IN_CUSTODY',
      ),
    ).toEqual([]);
    expect(
      operationsQueueTestUtils.physicalEntryBlockers(
        'RECEIVED',
        'NOT_STARTED',
        'RECEIVED',
      ),
    ).toEqual([
      'PHYSICAL_RECEIVED',
      'VERIFICATION_REQUIRED',
      'SECURE_CUSTODY_REQUIRED',
    ]);
  });

  it('routes an incomplete physical prerequisite to Intake without exposing custody mutation here', () => {
    expect(
      operationsQueueTestUtils.operationsNextAction('PHYSICAL_PREREQUISITE', [
        'PHYSICAL_AWAITING_DROP_OFF',
      ]),
    ).toEqual({
      label: 'Await collector drop-off',
      actor: 'STAFF',
      target: 'INTAKE',
    });
    expect(
      operationsQueueTestUtils.operationsNextAction('VALUATION', []),
    ).toEqual({
      label: 'Record valuation',
      actor: 'STAFF',
      target: 'VALUATION',
    });
  });

  it('keeps the economic operation actions distinct from physical controls', () => {
    expect(
      operationsQueueTestUtils.operationsNextAction('OWNERSHIP_SETUP', []),
    ).toEqual({
      label: 'Configure ownership',
      actor: 'STAFF',
      target: 'OWNERSHIP',
    });
    expect(
      operationsQueueTestUtils.operationsNextAction('MARKET_LIVE', []),
    ).toEqual({
      label: 'No action required',
      actor: 'NONE',
      target: 'COLLECTIBLE',
    });
    expect(
      operationsQueueTestUtils.operationsNextAction('OFFERING_SETUP', []),
    ).toMatchObject({ target: 'INITIAL_OFFERING' });
    expect(
      operationsQueueTestUtils.operationsNextAction('READY_FOR_LAUNCH', []),
    ).toMatchObject({ target: 'LAUNCH' });
  });

  it('keeps a live Pre-Sale workflow independent from final-market gates', () => {
    expect(operationsQueueTestUtils.canConfigurePreSale('PRE_SALE_SETUP', false)).toBe(true);
    expect(operationsQueueTestUtils.canConfigurePreSale('PRE_SALE_SETUP', true)).toBe(false);
    expect(operationsQueueTestUtils.canConfigurePreSale('READY_FOR_LAUNCH', false)).toBe(false);
    expect(
      operationsQueueTestUtils.operationsNextAction('PRE_SALE_LIVE', [], {
        physical: 'AWAITING_INTAKE',
        verification: 'NOT_STARTED',
        custody: 'NOT_STARTED',
        preSaleStatus: 'ACTIVE',
      }),
    ).toEqual({
      label: 'Await collector shipment',
      actor: 'STAFF',
      target: 'INTAKE',
    });

    const workflow = operationsQueueTestUtils.operationEconomicWorkflow({
      currentStage: 'PRE_SALE_LIVE',
      preSale: { status: 'ACTIVE' },
      physicalPrerequisiteSummary: { complete: false },
      market: { state: 'PRE_SALE' },
    } as never);

    expect(workflow.map((step) => step.key)).toEqual([
      'PRE_SALE_SETUP',
      'PRE_SALE_LIVE',
      'PHYSICAL_INTAKE',
      'FINALIZATION',
      'MARKET_LIVE',
    ]);
    expect(workflow.find((step) => step.key === 'PRE_SALE_LIVE')).toMatchObject({
      state: 'IN_PROGRESS',
    });
    expect(workflow.find((step) => step.key === 'FINALIZATION')).toMatchObject({
      state: 'BLOCKED',
    });
  });

  it('marks provisional terms ready without requiring physical completion', () => {
    const readiness = operationsQueueTestUtils.preSaleReadinessProjection(
      {
        status: 'PUBLISHED',
        initialOffering: {
          totalUnits: 1000n,
          offeredUnits: 750n,
          retainedUnits: 250n,
          pricePerUnitMinor: 1850n,
          preSale: { status: 'DRAFT', deadlineAt: null },
        },
      } as never,
      { status: 'APPROVED' } as never,
      {} as never,
      false,
      false,
    );

    expect(readiness.state).toBe('READY');
    expect(readiness.blockers).not.toEqual(
      expect.arrayContaining([
        'VERIFICATION_REQUIRED',
        'SECURE_CUSTODY_REQUIRED',
        'PRESALE_DEADLINE_EXPIRED',
      ]),
    );
  });

  it('keeps ordinary pre-custody assets in Physical Intake, not the economic queue', () => {
    const pendingPhysical = {
      eligibleForAssetOperations: false,
      currentStage: 'PHYSICAL_PREREQUISITE',
      market: { state: 'NOT_ELIGIBLE' },
      exception: null,
      attention: { severity: 'NONE' },
    } as { eligibleForAssetOperations: boolean };
    const postIntake = {
      eligibleForAssetOperations: true,
      currentStage: 'VALUATION',
      market: { state: 'NOT_ELIGIBLE' },
      exception: null,
      attention: { severity: 'NONE' },
    } as {
      eligibleForAssetOperations: boolean;
      currentStage: string;
      market: { state: string };
      exception: null;
      attention: { severity: string };
    };
    const lifecycleConflict = {
      ...pendingPhysical,
      exception: { type: 'LIFECYCLE_PHYSICAL_MARKET_CONFLICT' },
      attention: { severity: 'HIGH' },
    };
    expect(
      operationsQueueTestUtils.isOperationsQueueMember(
        pendingPhysical as never,
      ),
    ).toBe(false);
    expect(
      operationsQueueTestUtils.isOperationsQueueMember(postIntake as never),
    ).toBe(true);
    expect(
      operationsQueueTestUtils.isOperationsQueueMember(
        lifecycleConflict as never,
      ),
    ).toBe(true);
    expect(
      operationsQueueTestUtils.operationsMatches(pendingPhysical as never, {
        tab: 'needs-action',
      }),
    ).toBe(false);
    expect(
      operationsQueueTestUtils.operationsMatches(lifecycleConflict as never, {
        tab: 'needs-action',
      }),
    ).toBe(false);
    expect(
      operationsQueueTestUtils.operationsMatches(postIntake as never, {
        tab: 'valuation',
      }),
    ).toBe(true);
  });

  it('flags a published market record with incomplete physical authority as a conflict', () => {
    expect(
      operationsQueueTestUtils.hasLifecycleMarketConflict(false, 'MARKET_LIVE'),
    ).toBe(true);
    expect(
      operationsQueueTestUtils.hasLifecycleMarketConflict(true, 'MARKET_LIVE'),
    ).toBe(false);
    expect(
      operationsQueueTestUtils.hasLifecycleMarketConflict(
        false,
        'NOT_ELIGIBLE',
      ),
    ).toBe(false);
  });

  it('derives queue insights from lifecycle blockers instead of static dashboard values', () => {
    const item = {
      exception: { type: 'INTAKE_EXCEPTION' },
      currentStage: 'RESTRICTION',
      market: { state: 'NOT_ELIGIBLE' },
      attention: { severity: 'HIGH' },
      entryBlockers: ['VERIFICATION_REQUIRED'],
      launchReadiness: { blockers: ['INITIAL_OFFERING_REQUIRED'] },
      ownership: { state: 'NOT_CONFIGURED' },
      updatedAt: new Date('2026-08-30T00:00:00.000Z').toISOString(),
      id: 'asset-1',
      title: 'Authoritative asset',
    } as never;
    expect(operationsQueueTestUtils.operationsInsights([item])).toMatchObject({
      health: { exceptions: 1 },
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'VERIFICATION_REQUIRED', count: 1 }),
      ]),
    });
  });

  it('projects a live market workflow from the same server authority as the queue', () => {
    const workflow = operationsQueueTestUtils.operationEconomicWorkflow({
      eligibleForAssetOperations: true,
      valuation: { state: 'VALUED' },
      ownership: { state: 'ISSUED' },
      offering: { state: 'OPEN' },
      currentStage: 'MARKET_LIVE',
      market: { state: 'MARKET_LIVE' },
      launchReadiness: { state: 'READY', blockers: [] },
    } as never);

    expect(workflow).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'VALUATION', state: 'COMPLETE' }),
        expect.objectContaining({ key: 'OWNERSHIP', state: 'COMPLETE' }),
        expect.objectContaining({ key: 'MARKET', state: 'LIVE' }),
      ]),
    );
  });

  it('finds an operations detail record by its canonical internal asset id', () => {
    const query = '43212b2a-225c-4253-a1bd-47facaf6fd73';
    expect(operationsQueueTestUtils.operationsSearchWhere(query)).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([{ id: query }]),
      }),
    );
  });

  it('projects every authoritative launch gate with its exact blocking state', () => {
    const gates = operationsQueueTestUtils.operationLaunchGates([
      'ACTIVE_COVERAGE_REQUIRED',
      'INITIAL_OFFERING_REQUIRED',
    ]);

    expect(gates).toHaveLength(8);
    expect(gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockerCode: 'ACTIVE_COVERAGE_REQUIRED',
          label: 'Active insurance coverage',
          state: 'BLOCKED',
        }),
        expect.objectContaining({
          blockerCode: 'VERIFICATION_NOT_APPROVED',
          state: 'SATISFIED',
        }),
      ]),
    );
  });

  it('activates the investor-protection boundary only for non-originator user positions', () => {
    const positions = [
      {
        settledUnits: 400n,
        account: { type: 'USER', userId: 'collector-1' },
      },
      {
        settledUnits: 125n,
        account: { type: 'USER', userId: 'investor-1' },
      },
      {
        settledUnits: 475n,
        account: { type: 'INITIAL_OFFERING', userId: null },
      },
    ];

    expect(
      operationsQueueTestUtils.authoritativeInvestorOwnedUnits(
        positions,
        'collector-1',
      ),
    ).toBe(125n);
  });

  it('reports lifecycle contradictions without inferring a destructive reset', () => {
    const incidents = operationsQueueTestUtils.operationIntegrityIncidents({
      exception: { type: 'LIFECYCLE_PHYSICAL_MARKET_CONFLICT' },
      ownership: { totalUnits: '1000', issuedUnits: '900' },
      offering: { totalUnits: '1100' },
    } as never);

    expect(incidents.map((incident) => incident.code)).toEqual([
      'LIFECYCLE_PHYSICAL_MARKET_CONFLICT',
      'OWNERSHIP_SUPPLY_MISMATCH',
      'OFFERING_EXCEEDS_OWNERSHIP_SUPPLY',
    ]);
    expect(incidents.every((incident) => incident.resolution.length > 20)).toBe(
      true,
    );
  });
});
