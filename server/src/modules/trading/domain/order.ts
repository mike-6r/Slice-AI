import { UnprocessableEntityException } from '@nestjs/common';
import { parseOwnershipUnits } from '../../ownership/domain/ownership-units';

export type OrderSide = 'BUY' | 'SELL';
export type TimeInForce = 'GTC' | 'IOC';
export type ActiveOrderStatus = 'OPEN' | 'PARTIALLY_FILLED';

export type NormalizedOrderInput = Readonly<{
  side: OrderSide;
  timeInForce: TimeInForce;
  units: bigint;
  limitPriceMinor: bigint;
}>;

export function normalizeLimitOrder(input: {
  side: string;
  type: string;
  timeInForce: string;
  units: string;
  limitPriceMinor: string;
  tickSizeMinor: bigint;
  lotSizeUnits: bigint;
}): NormalizedOrderInput {
  if (input.type !== 'LIMIT')
    throw invalidOrder('Only LIMIT orders are supported.');
  if (input.side !== 'BUY' && input.side !== 'SELL')
    throw invalidOrder('Order side is invalid.');
  if (input.timeInForce !== 'GTC' && input.timeInForce !== 'IOC')
    throw invalidOrder('Time in force is invalid.');
  const units = parseOwnershipUnits(input.units);
  const price = parsePositiveMinor(input.limitPriceMinor);
  if (input.tickSizeMinor < 1n || price % input.tickSizeMinor !== 0n)
    throw invalidOrder('Limit price does not satisfy the market tick size.');
  if (input.lotSizeUnits < 1n || units % input.lotSizeUnits !== 0n)
    throw invalidOrder('Units do not satisfy the market lot size.');
  return {
    side: input.side,
    timeInForce: input.timeInForce,
    units,
    limitPriceMinor: price,
  };
}

export function checkedGross(priceMinor: bigint, units: bigint) {
  const value = priceMinor * units;
  if (value <= 0n || value > 9_000_000_000_000_000n)
    throw invalidOrder('Order notional is outside the supported range.');
  return value;
}

export function crosses(buyPriceMinor: bigint, sellPriceMinor: bigint) {
  return buyPriceMinor >= sellPriceMinor;
}

export function makerPrice(input: {
  buyPriority: bigint;
  sellPriority: bigint;
  buyPriceMinor: bigint;
  sellPriceMinor: bigint;
}) {
  return input.buyPriority < input.sellPriority
    ? input.buyPriceMinor
    : input.sellPriceMinor;
}

function parsePositiveMinor(value: string) {
  if (!/^[1-9][0-9]*$/.test(value)) throw invalidOrder('Price is invalid.');
  const parsed = BigInt(value);
  if (parsed > 9_000_000_000_000_000n)
    throw invalidOrder('Price is outside the supported range.');
  return parsed;
}

function invalidOrder(message: string): never {
  throw new UnprocessableEntityException({
    code: 'INVALID_ORDER_QUANTITY_PRICE',
    message,
  });
}
