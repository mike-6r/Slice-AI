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
});
