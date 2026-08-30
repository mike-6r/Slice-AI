export type CatalogueNextActor = 'COLLECTOR' | 'STAFF' | 'SYSTEM' | 'NONE';

export type CatalogueLifecycleInput = {
  submissionStatus: string | null;
  intake: {
    status: string;
    deliveryMethod: 'SHIPMENT' | 'IN_PERSON';
    shipmentStatus: string | null;
    hasReceipt: boolean;
    verificationStatus: string | null;
    hasOpenException: boolean;
  } | null;
  custodyStatus: string | null;
  hasValuation: boolean;
  ownershipPolicyStatus: string | null;
  ownershipSupplyStatus: string | null;
  issuedUnits: bigint | null;
  offeringStatus: string | null;
  publicationStatus: string | null;
  marketStatus: string | null;
  tradingEnabled: boolean | null;
};

export function cataloguePhysicalState(input: CatalogueLifecycleInput) {
  if (input.custodyStatus === 'EXCEPTION' || input.intake?.hasOpenException)
    return 'EXCEPTION';
  if (!input.intake)
    return input.submissionStatus === 'APPROVED'
      ? 'AWAITING_DESTINATION'
      : 'NOT_STARTED';
  if (input.intake.deliveryMethod === 'IN_PERSON' && !input.intake.hasReceipt)
    return 'AWAITING_DROP_OFF';
  if (input.intake.shipmentStatus === 'DELIVERED' && !input.intake.hasReceipt)
    return 'CARRIER_DELIVERED';
  if (
    input.intake.shipmentStatus &&
    ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(
      input.intake.shipmentStatus,
    )
  )
    return 'IN_TRANSIT';
  if (
    !input.intake.shipmentStatus &&
    input.intake.deliveryMethod === 'SHIPMENT'
  )
    return 'AWAITING_SHIPMENT';
  if (
    input.intake.verificationStatus === 'IN_PROGRESS' ||
    input.intake.status === 'VERIFICATION'
  )
    return 'VERIFYING';
  if (input.custodyStatus === 'SECURED') return 'IN_CUSTODY';
  if (input.intake.verificationStatus === 'VERIFIED')
    return 'READY_FOR_CUSTODY';
  if (input.intake.hasReceipt || input.intake.status === 'RECEIVED')
    return 'RECEIVED';
  return 'AWAITING_SHIPMENT';
}

export function catalogueVerificationState(input: CatalogueLifecycleInput) {
  if (
    input.intake?.hasOpenException ||
    input.intake?.verificationStatus === 'BLOCKED'
  )
    return 'EXCEPTION';
  if (!input.intake || !input.intake.hasReceipt) return 'NOT_STARTED';
  if (input.intake.verificationStatus === 'VERIFIED') return 'VERIFIED';
  if (
    input.intake.verificationStatus === 'IN_PROGRESS' ||
    input.intake.status === 'VERIFICATION'
  )
    return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export function catalogueCustodyState(input: CatalogueLifecycleInput) {
  if (input.custodyStatus === 'EXCEPTION') return 'EXCEPTION';
  if (input.custodyStatus === 'SECURED') return 'IN_CUSTODY';
  if (input.custodyStatus === 'INSPECTED') return 'READY_FOR_CUSTODY';
  if (input.custodyStatus === 'RECEIVED') return 'RECEIVED';
  if (input.custodyStatus === 'EXPECTED') return 'EXPECTED';
  return 'NOT_ESTABLISHED';
}

export function catalogueOwnershipState(input: CatalogueLifecycleInput) {
  if (input.issuedUnits && input.issuedUnits > 0n) return 'ISSUED';
  if (
    input.ownershipSupplyStatus === 'ACTIVE' ||
    input.ownershipPolicyStatus === 'ISSUED'
  )
    return 'ISSUED';
  if (input.ownershipPolicyStatus === 'APPROVED') return 'CONFIGURED';
  if (input.ownershipPolicyStatus === 'PROPOSED') return 'PENDING_APPROVAL';
  return 'NOT_CONFIGURED';
}

export function catalogueMarketState(input: CatalogueLifecycleInput) {
  if (input.publicationStatus === 'PUBLISHED') return 'MARKET_LIVE';
  if (input.marketStatus === 'HALTED') return 'PAUSED';
  if (
    input.offeringStatus &&
    ['OPEN', 'PARTIALLY_FILLED', 'SOLD_OUT'].includes(input.offeringStatus)
  )
    return 'INITIAL_OFFERING';
  if (input.offeringStatus) return 'SETUP_REQUIRED';
  if (input.publicationStatus === 'READY') return 'READY_FOR_LAUNCH';
  return 'NOT_ELIGIBLE';
}

export function catalogueAttention(input: CatalogueLifecycleInput) {
  const reasons: string[] = [];
  if (input.custodyStatus === 'EXCEPTION' || input.intake?.hasOpenException)
    reasons.push('Physical intake exception');
  if (input.intake?.verificationStatus === 'BLOCKED')
    reasons.push('Verification exception');
  return { required: reasons.length > 0, reasons };
}

export function catalogueNextAction(input: CatalogueLifecycleInput): {
  label: string;
  actor: CatalogueNextActor;
  target: 'COLLECTIBLE' | 'INTAKE' | 'VALUATION' | 'OWNERSHIP' | 'MARKET';
} {
  const attention = catalogueAttention(input);
  if (attention.required)
    return { label: 'Resolve exception', actor: 'STAFF', target: 'INTAKE' };
  const physical = cataloguePhysicalState(input);
  if (physical === 'AWAITING_DESTINATION')
    return {
      label: 'Await collector destination',
      actor: 'COLLECTOR',
      target: 'INTAKE',
    };
  if (physical === 'AWAITING_SHIPMENT')
    return {
      label: 'Await collector shipment',
      actor: 'COLLECTOR',
      target: 'INTAKE',
    };
  if (physical === 'AWAITING_DROP_OFF')
    return {
      label: 'Await collector drop-off',
      actor: 'COLLECTOR',
      target: 'INTAKE',
    };
  if (physical === 'CARRIER_DELIVERED')
    return {
      label: 'Confirm physical receipt',
      actor: 'STAFF',
      target: 'INTAKE',
    };
  if (physical === 'RECEIVED')
    return { label: 'Begin verification', actor: 'STAFF', target: 'INTAKE' };
  if (physical === 'VERIFYING')
    return { label: 'Complete verification', actor: 'STAFF', target: 'INTAKE' };
  if (physical === 'READY_FOR_CUSTODY')
    return { label: 'Establish custody', actor: 'STAFF', target: 'INTAKE' };
  if (!input.hasValuation)
    return { label: 'Record valuation', actor: 'STAFF', target: 'VALUATION' };
  if (catalogueOwnershipState(input) === 'NOT_CONFIGURED')
    return {
      label: 'Configure ownership',
      actor: 'STAFF',
      target: 'OWNERSHIP',
    };
  if (catalogueMarketState(input) !== 'MARKET_LIVE')
    return {
      label: 'Open market operations',
      actor: 'STAFF',
      target: 'MARKET',
    };
  return { label: 'No action required', actor: 'NONE', target: 'COLLECTIBLE' };
}
