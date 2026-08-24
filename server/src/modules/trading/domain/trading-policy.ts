import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * User-authorized production-shaped initial trading variables. Individual
 * markets persist configurable values; this object supplies bounded defaults
 * and prevents magic fee/tick/lot literals in matching code. Provider checks
 * remain a future provider-neutral boundary rather than a KYC claim.
 */
export const tradingPolicy = Object.freeze({
  currency: 'GBP' as const,
  defaultTickSizeMinor: 1n,
  defaultLotSizeUnits: 1n,
  defaultMinimumNotionalMinor: 100n,
  fee: Object.freeze({
    makerBps: 0,
    takerBps: 0,
    minBps: 0,
    maxBps: 1_000,
    application: 'SLICE_ZERO_TRADING_FEES_V2' as const,
  }),
  selfTradePrevention: 'REJECT_TAKER' as const,
  localAlwaysOpen: false,
});

export type MarketPolicy = Readonly<{
  status: 'OPEN' | 'HALTED' | 'CLOSED';
  tickSizeMinor: bigint;
  lotSizeUnits: bigint;
  minimumNotionalMinor: bigint;
  makerFeeBps: number;
  takerFeeBps: number;
  selfTradePrevention: string;
  tradingEnabled: boolean;
}>;

export function assertMarketPolicy(policy: MarketPolicy) {
  if (!policy.tradingEnabled || policy.status !== 'OPEN')
    throw new ConflictException({
      code: 'MARKET_NOT_OPEN',
      message: 'Trading market is not open.',
    });
  if (
    policy.tickSizeMinor < 1n ||
    policy.lotSizeUnits < 1n ||
    policy.minimumNotionalMinor < 1n
  )
    throw invalidPolicy();
  for (const bps of [policy.makerFeeBps, policy.takerFeeBps]) {
    if (
      !Number.isInteger(bps) ||
      bps < tradingPolicy.fee.minBps ||
      bps > tradingPolicy.fee.maxBps
    )
      throw invalidPolicy();
  }
  if (policy.selfTradePrevention !== tradingPolicy.selfTradePrevention)
    throw invalidPolicy();
}

export function feeMinor(grossMinor: bigint, bps: number) {
  // Policy is stored/previewed now; application remains an explicit future
  // settlement-boundary decision rather than an invented ledger transfer.
  return (grossMinor * BigInt(bps) + 9_999n) / 10_000n;
}

function invalidPolicy(): never {
  throw new UnprocessableEntityException({
    code: 'INVALID_TRADING_POLICY',
    message: 'Trading market policy is invalid.',
  });
}
