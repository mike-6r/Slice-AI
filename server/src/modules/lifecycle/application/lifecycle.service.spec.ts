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
  });

  it('keeps pre-custody assets visible and routes their next action to Intake', () => {
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
    expect([pendingPhysical, postIntake]).toHaveLength(2);
    expect(
      operationsQueueTestUtils.operationsMatches(pendingPhysical as never, {
        tab: 'needs-action',
      }),
    ).toBe(true);
    expect(
      operationsQueueTestUtils.operationsMatches(postIntake as never, {
        tab: 'valuation',
      }),
    ).toBe(true);
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
});
