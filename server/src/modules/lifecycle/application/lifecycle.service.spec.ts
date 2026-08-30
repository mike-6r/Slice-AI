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
});
