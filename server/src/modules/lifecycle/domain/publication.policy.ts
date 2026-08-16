import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';

export const custodyTransitions: Readonly<Record<string, readonly string[]>> = {
  EXPECTED: ['RECEIVED', 'EXCEPTION'],
  RECEIVED: ['INSPECTED', 'EXCEPTION'],
  INSPECTED: ['SECURED', 'EXCEPTION'],
  SECURED: ['RELEASE_PENDING', 'EXCEPTION'],
  RELEASE_PENDING: ['RELEASED', 'SECURED', 'EXCEPTION'],
  RELEASED: [],
  EXCEPTION: ['EXPECTED', 'RECEIVED', 'INSPECTED', 'SECURED'],
};

export type PublicationReadiness = {
  status: 'BLOCKED' | 'READY';
  blockingCodes: string[];
  controlledBetaPhysicalBypass: boolean;
};

export function assertCustodyTransition(from: string, to: string) {
  if (!custodyTransitions[from]?.includes(to)) {
    throw new ConflictException({
      code: 'CUSTODY_TRANSITION_INVALID',
      message: 'That custody transition is not allowed.',
    });
  }
}

export function assertMoney(valueMinor: bigint, currency: string) {
  if (valueMinor < 0n || currency !== 'GBP') {
    throw new UnprocessableEntityException({
      code: 'VALUATION_EVIDENCE_INVALID',
      message: 'Money values must be non-negative GBP minor units.',
    });
  }
}

export function evaluateReadiness(input: {
  cataloguePublished: boolean;
  verificationApproved: boolean;
  activeDecision: boolean;
  custodySecured: boolean;
  controlledBetaPhysicalBypass?: boolean;
  activeCoverage: boolean;
  hasException: boolean;
}): PublicationReadiness {
  const controlledBetaPhysicalBypass = input.controlledBetaPhysicalBypass === true;
  const blockingCodes = [
    !input.cataloguePublished && 'CATALOGUE_NOT_PUBLISHED',
    !input.verificationApproved && 'VERIFICATION_NOT_APPROVED',
    !input.activeDecision && 'VALUATION_REQUIRED',
    !input.custodySecured && !controlledBetaPhysicalBypass && 'CUSTODY_NOT_SECURED',
    !input.activeCoverage && 'ACTIVE_COVERAGE_REQUIRED',
    input.hasException && 'LIFECYCLE_EXCEPTION',
  ].filter((code): code is string => Boolean(code));
  return {
    status: blockingCodes.length ? 'BLOCKED' : 'READY',
    blockingCodes,
    controlledBetaPhysicalBypass,
  };
}
