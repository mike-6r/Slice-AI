import { deriveMarketLifecycle } from './market-lifecycle';

const published = { published: true };

describe('market lifecycle projection', () => {
  it.each([
    ['published without custody', { ...published }, 'CUSTODY_REQUIRED', 'Pre-market', 'Market opening soon', 2],
    [
      'secured custody without policy approval',
      { ...published, custodyStatus: 'SECURED' },
      'SUPPLY_APPROVAL_REQUIRED',
      'Pre-market',
      'Ownership setup required',
      3,
    ],
    [
      'approved policy without issuance',
      { ...published, custodyStatus: 'SECURED', supplyPolicyStatus: 'APPROVED' },
      'READY_FOR_ISSUANCE',
      'Ready for issuance',
      'Ownership ready to issue',
      3,
    ],
    [
      'issued market not open',
      { ...published, custodyStatus: 'SECURED', supplyPolicyStatus: 'ISSUED', issuedUnits: 1000n, marketStatus: 'CLOSED' },
      'ISSUANCE_PENDING',
      'Issued',
      'Ownership issued',
      4,
    ],
    [
      'issued open market',
      { ...published, custodyStatus: 'SECURED', supplyPolicyStatus: 'ISSUED', issuedUnits: 1000n, marketStatus: 'OPEN', tradingEnabled: true, availabilityBps: 2500 },
      'LIVE',
      'Live',
      'Live market',
      4,
    ],
    [
      'suspended market',
      { ...published, custodyStatus: 'SECURED', supplyPolicyStatus: 'ISSUED', issuedUnits: 1000n, marketStatus: 'HALTED' },
      'SUSPENDED',
      'Paused',
      'Market temporarily unavailable',
      4,
    ],
    [
      'closed market',
      { ...published, custodyStatus: 'SECURED', supplyPolicyStatus: 'ISSUED', issuedUnits: 1000n, marketStatus: 'CLOSED' },
      'ISSUANCE_PENDING',
      'Issued',
      'Ownership issued',
      4,
    ],
  ])('%s maps deterministically', (_name, input, phase, badge, headline, step) => {
    const projection = deriveMarketLifecycle(input);
    expect(projection.phase).toBe(phase);
    expect(projection.badge).toBe(badge);
    expect(projection.headline).toBe(headline);
    expect(projection.currentStep).toBe(step);
    expect(projection.steps.map((item) => item.state)).toHaveLength(4);
  });

  it('gates buy on live market plus available supply and sell on settled units', () => {
    const live = deriveMarketLifecycle({
      ...published,
      custodyStatus: 'SECURED',
      supplyPolicyStatus: 'ISSUED',
      issuedUnits: 1000n,
      marketStatus: 'OPEN',
      tradingEnabled: true,
      availabilityBps: 0,
      userSettledUnits: 10n,
    });
    expect(live.canBuy).toBe(false);
    expect(live.canSell).toBe(true);
    expect(live.statusPill).toBe('Trading live');
  });

  it('keeps closed precedence explicit when requested as a terminal state', () => {
    const projection = deriveMarketLifecycle({
      ...published,
      closed: true,
      issuedUnits: 1000n,
      marketStatus: 'OPEN',
      tradingEnabled: true,
    });
    expect(projection.phase).toBe('CLOSED');
    expect(projection.statusPill).toBe('No longer trading');
    expect(projection.canBuy).toBe(false);
    expect(projection.canSell).toBe(false);
  });
});
