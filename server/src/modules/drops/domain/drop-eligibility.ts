export const DROP_INELIGIBILITY = {
  NOT_CANONICAL: 'NOT_CANONICAL',
  CREATOR_NOT_VERIFIED: 'CREATOR_NOT_VERIFIED',
  NOT_SECURED_IN_VAULT: 'NOT_SECURED_IN_VAULT',
  VERIFICATION_INCOMPLETE: 'VERIFICATION_INCOMPLETE',
  OWNERSHIP_SUPPLY_INACTIVE: 'OWNERSHIP_SUPPLY_INACTIVE',
  CREATOR_NOT_WHOLE_OWNER: 'CREATOR_NOT_WHOLE_OWNER',
  OWNERSHIP_RESERVED: 'OWNERSHIP_RESERVED',
  ASSET_OPERATIONALLY_FROZEN: 'ASSET_OPERATIONALLY_FROZEN',
  CONFLICTING_OFFERING: 'CONFLICTING_OFFERING',
  CONFLICTING_MARKET: 'CONFLICTING_MARKET',
  CREATOR_FINANCIAL_EXCEPTION: 'CREATOR_FINANCIAL_EXCEPTION',
  CREATOR_COMPLIANCE_HOLD: 'CREATOR_COMPLIANCE_HOLD',
  ALREADY_LOCKED: 'ALREADY_LOCKED',
} as const;

export type DropIneligibilityCode =
  (typeof DROP_INELIGIBILITY)[keyof typeof DROP_INELIGIBILITY];

export type DropEligibilityFacts = {
  canonicalStatus: string;
  creatorVerified: boolean;
  custodyStatus: string | null;
  receivedAt: Date | null;
  securedAt: Date | null;
  verificationApproved: boolean;
  supplyStatus: string | null;
  totalUnits: bigint;
  issuedUnits: bigint;
  creatorSettledUnits: bigint;
  creatorReservedUnits: bigint;
  otherSettledUnits: bigint;
  operationalControlStatus: string | null;
  offeringStatus: string | null;
  preSaleStatus: string | null;
  marketStatus: string | null;
  hasFinancialDeficit: boolean;
  hasComplianceHold: boolean;
  hasConflictingSale: boolean;
  lockedByDropId: string | null;
  requestedDropId?: string;
};

export type DropEligibilityResult = {
  eligible: boolean;
  reasons: Array<{ code: DropIneligibilityCode; message: string }>;
};

export function evaluateDropAssetEligibility(
  facts: DropEligibilityFacts,
): DropEligibilityResult {
  const reasons: DropEligibilityResult['reasons'] = [];
  const add = (code: DropIneligibilityCode, message: string) =>
    reasons.push({ code, message });

  if (!['VERIFIED', 'PUBLISHED'].includes(facts.canonicalStatus))
    add(
      DROP_INELIGIBILITY.NOT_CANONICAL,
      'Canonical verification is not complete.',
    );
  if (!facts.creatorVerified)
    add(
      DROP_INELIGIBILITY.CREATOR_NOT_VERIFIED,
      'The creator account is not verified and active.',
    );
  if (
    facts.custodyStatus !== 'SECURED' ||
    !facts.receivedAt ||
    !facts.securedAt
  )
    add(
      DROP_INELIGIBILITY.NOT_SECURED_IN_VAULT,
      'The collectible must be physically received and secured in the vault.',
    );
  if (!facts.verificationApproved)
    add(
      DROP_INELIGIBILITY.VERIFICATION_INCOMPLETE,
      'A completed approved verification review is required.',
    );
  if (facts.supplyStatus !== 'ACTIVE' || facts.issuedUnits !== facts.totalUnits)
    add(
      DROP_INELIGIBILITY.OWNERSHIP_SUPPLY_INACTIVE,
      'The ownership supply must be active and fully issued.',
    );
  if (
    facts.totalUnits <= 0n ||
    facts.creatorSettledUnits !== facts.totalUnits ||
    facts.otherSettledUnits !== 0n
  )
    add(
      DROP_INELIGIBILITY.CREATOR_NOT_WHOLE_OWNER,
      'The creator must own 100% of the collectible.',
    );
  if (facts.creatorReservedUnits !== 0n)
    add(
      DROP_INELIGIBILITY.OWNERSHIP_RESERVED,
      'Ownership units are reserved by another workflow.',
    );
  if (facts.operationalControlStatus === 'FROZEN')
    add(
      DROP_INELIGIBILITY.ASSET_OPERATIONALLY_FROZEN,
      'The collectible is frozen by an operational control.',
    );
  if (
    facts.offeringStatus &&
    !['CANCELLED', 'EXPIRED'].includes(facts.offeringStatus)
  )
    add(
      DROP_INELIGIBILITY.CONFLICTING_OFFERING,
      'The collectible is committed to an initial offering.',
    );
  if (facts.preSaleStatus && !['CANCELLED'].includes(facts.preSaleStatus))
    add(
      DROP_INELIGIBILITY.CONFLICTING_OFFERING,
      'The collectible is committed to a pre-sale.',
    );
  if (facts.marketStatus && facts.marketStatus !== 'CLOSED')
    add(
      DROP_INELIGIBILITY.CONFLICTING_MARKET,
      'The collectible has an active or halted secondary market.',
    );
  if (facts.hasFinancialDeficit)
    add(
      DROP_INELIGIBILITY.CREATOR_FINANCIAL_EXCEPTION,
      'The creator has an unresolved financial exception.',
    );
  if (facts.hasComplianceHold)
    add(
      DROP_INELIGIBILITY.CREATOR_COMPLIANCE_HOLD,
      'The creator has an active compliance hold.',
    );
  if (facts.hasConflictingSale)
    add(
      DROP_INELIGIBILITY.CONFLICTING_MARKET,
      'The collectible is committed to a whole-asset sale workflow.',
    );
  if (facts.lockedByDropId && facts.lockedByDropId !== facts.requestedDropId)
    add(
      DROP_INELIGIBILITY.ALREADY_LOCKED,
      'The collectible is already locked to another Drop.',
    );

  return { eligible: reasons.length === 0, reasons };
}
