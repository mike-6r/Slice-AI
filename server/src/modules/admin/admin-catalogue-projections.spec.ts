import {
  catalogueAttention,
  catalogueCustodyState,
  catalogueMarketState,
  catalogueNextAction,
  cataloguePhysicalState,
  catalogueVerificationState,
  type CatalogueLifecycleInput,
} from './admin-catalogue-projections';

const base = (): CatalogueLifecycleInput => ({
  submissionStatus: 'APPROVED',
  intake: null,
  custodyStatus: null,
  hasValuation: false,
  ownershipPolicyStatus: null,
  ownershipSupplyStatus: null,
  issuedUnits: null,
  offeringStatus: null,
  publicationStatus: null,
  marketStatus: null,
  tradingEnabled: null,
});

describe('admin catalogue lifecycle projection', () => {
  it('keeps canonical identity separate from downstream receipt, verification, custody and market', () => {
    const asset = base();
    expect(cataloguePhysicalState(asset)).toBe('AWAITING_DESTINATION');
    expect(catalogueVerificationState(asset)).toBe('NOT_STARTED');
    expect(catalogueCustodyState(asset)).toBe('NOT_ESTABLISHED');
    expect(catalogueMarketState(asset)).toBe('NOT_ELIGIBLE');
  });

  it('does not treat carrier delivery or receipt as custody or verification', () => {
    const delivered = base();
    delivered.intake = {
      status: 'DELIVERED',
      deliveryMethod: 'SHIPMENT',
      shipmentStatus: 'DELIVERED',
      hasReceipt: false,
      verificationStatus: 'NOT_STARTED',
      hasOpenException: false,
    };
    expect(cataloguePhysicalState(delivered)).toBe('CARRIER_DELIVERED');
    expect(catalogueVerificationState(delivered)).toBe('NOT_STARTED');
    expect(catalogueCustodyState(delivered)).toBe('NOT_ESTABLISHED');

    delivered.intake.hasReceipt = true;
    delivered.intake.status = 'RECEIVED';
    expect(cataloguePhysicalState(delivered)).toBe('RECEIVED');
    expect(catalogueVerificationState(delivered)).toBe('NOT_STARTED');
  });

  it('requires physical verification before custody and never marks normal pending work as attention', () => {
    const verified = base();
    verified.intake = {
      status: 'COMPLETE',
      deliveryMethod: 'SHIPMENT',
      shipmentStatus: 'DELIVERED',
      hasReceipt: true,
      verificationStatus: 'VERIFIED',
      hasOpenException: false,
    };
    expect(cataloguePhysicalState(verified)).toBe('READY_FOR_CUSTODY');
    expect(catalogueCustodyState(verified)).toBe('NOT_ESTABLISHED');
    expect(catalogueAttention(verified)).toEqual({
      required: false,
      reasons: [],
    });
    expect(catalogueNextAction(verified)).toMatchObject({
      label: 'Establish custody',
      actor: 'STAFF',
    });
  });

  it('derives attention and the staff exception action only from exceptional authority', () => {
    const exceptional = base();
    exceptional.intake = {
      status: 'RECEIVED',
      deliveryMethod: 'SHIPMENT',
      shipmentStatus: 'DELIVERED',
      hasReceipt: true,
      verificationStatus: 'BLOCKED',
      hasOpenException: true,
    };
    expect(catalogueAttention(exceptional)).toEqual({
      required: true,
      reasons: ['Physical intake exception', 'Verification exception'],
    });
    expect(catalogueNextAction(exceptional)).toMatchObject({
      label: 'Resolve exception',
      actor: 'STAFF',
    });
  });
});
