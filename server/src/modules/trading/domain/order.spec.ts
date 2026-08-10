import {
  checkedGross,
  crosses,
  makerPrice,
  normalizeLimitOrder,
} from './order';

describe('Document 014 limit-order domain', () => {
  const base = {
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    units: '10',
    limitPriceMinor: '125',
    tickSizeMinor: 1n,
    lotSizeUnits: 1n,
  };

  it('uses integer-only tick and lot validation', () => {
    expect(normalizeLimitOrder(base)).toMatchObject({
      units: 10n,
      limitPriceMinor: 125n,
    });
    expect(() => normalizeLimitOrder({ ...base, units: '1.5' })).toThrow(
      'Ownership units',
    );
    expect(() =>
      normalizeLimitOrder({ ...base, limitPriceMinor: '0' }),
    ).toThrow('Price is invalid');
    expect(() =>
      normalizeLimitOrder({
        ...base,
        limitPriceMinor: '127',
        tickSizeMinor: 5n,
      }),
    ).toThrow('tick size');
  });

  it('uses maker price and exact integer gross', () => {
    expect(crosses(125n, 120n)).toBe(true);
    expect(
      makerPrice({
        buyPriority: 1n,
        sellPriority: 2n,
        buyPriceMinor: 125n,
        sellPriceMinor: 120n,
      }),
    ).toBe(125n);
    expect(
      makerPrice({
        buyPriority: 3n,
        sellPriority: 2n,
        buyPriceMinor: 125n,
        sellPriceMinor: 120n,
      }),
    ).toBe(120n);
    expect(checkedGross(125n, 10n)).toBe(1250n);
  });
});
