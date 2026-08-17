import { ConflictException } from '@nestjs/common';

export const initialOfferingFeePolicy = {
  version: 'INITIAL_OFFERING_ZERO_FEE_V1',
  feeBps: 0,
} as const;

export type InitialOfferingStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'SOLD_OUT'
  | 'PAUSED'
  | 'CANCELLED'
  | 'EXPIRED';

export function validateOfferingTerms(input: {
  totalUnits: bigint;
  offeredUnits: bigint;
  pricePerUnitMinor: bigint;
  currency: string;
  approvedCurrency: string;
}) {
  if (input.totalUnits <= 0n) invalid('TOTAL_UNITS_INVALID', 'Total units must be positive.');
  if (input.offeredUnits <= 0n) invalid('OFFERED_UNITS_INVALID', 'Offered units must be positive.');
  if (input.offeredUnits > input.totalUnits) invalid('OFFERED_UNITS_EXCEEDS_SUPPLY', 'Offered units cannot exceed approved supply.');
  if (input.pricePerUnitMinor <= 0n) invalid('PRICE_INVALID', 'Price per unit must be positive.');
  if (input.currency !== input.approvedCurrency) invalid('CURRENCY_MISMATCH', 'Offering currency must match the approved supply policy.');
  return {
    retainedUnits: input.totalUnits - input.offeredUnits,
    grossOfferingMinor: input.offeredUnits * input.pricePerUnitMinor,
  };
}

export function assertInitialOfferingTransition(from: InitialOfferingStatus, to: InitialOfferingStatus) {
  const allowed: Record<InitialOfferingStatus, InitialOfferingStatus[]> = {
    DRAFT: ['AWAITING_APPROVAL', 'CANCELLED'],
    AWAITING_APPROVAL: ['APPROVED', 'CANCELLED'],
    APPROVED: ['OPEN', 'CANCELLED'],
    OPEN: ['PARTIALLY_FILLED', 'SOLD_OUT', 'PAUSED', 'CANCELLED', 'EXPIRED'],
    PARTIALLY_FILLED: ['SOLD_OUT', 'PAUSED', 'CANCELLED', 'EXPIRED'],
    PAUSED: ['OPEN', 'CANCELLED', 'EXPIRED'],
    SOLD_OUT: [],
    CANCELLED: [],
    EXPIRED: [],
  };
  if (!allowed[from].includes(to)) invalid('INITIAL_OFFERING_INVALID_STATE', `Cannot move an offering from ${from} to ${to}.`);
}

export function calculateInitialOfferingSettlement(grossMinor: bigint, feeBps: number) {
  if (grossMinor <= 0n) invalid('GROSS_INVALID', 'Gross consideration must be positive.');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) invalid('FEE_POLICY_INVALID', 'Initial offering fee policy is invalid.');
  const feeMinor = (grossMinor * BigInt(feeBps)) / 10_000n;
  return { grossMinor, feeMinor, collectorNetMinor: grossMinor - feeMinor };
}

function invalid(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
