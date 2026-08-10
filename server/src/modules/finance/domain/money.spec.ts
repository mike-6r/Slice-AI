import { UnprocessableEntityException } from '@nestjs/common';
import { money, parsePositiveMoneyMinor } from './money';

describe('financial money', () => {
  it('accepts bounded integer GBP minor units', () => {
    expect(parsePositiveMoneyMinor('1')).toBe(1n);
    expect(parsePositiveMoneyMinor('9000000000000000')).toBe(9000000000000000n);
    expect(money(125n)).toEqual({ minor: 125n, currency: 'GBP' });
  });

  it.each(['0', '-1', '+1', '1.5', '1e3', ' 1', '9000000000000001'])(
    'rejects non-authoritative money form %s',
    (value) => {
      expect(() => parsePositiveMoneyMinor(value)).toThrow(
        UnprocessableEntityException,
      );
    },
  );

  it('rejects non-GBP and negative domain money', () => {
    expect(() => money(-1n)).toThrow(UnprocessableEntityException);
    expect(() => money(1n, 'USD')).toThrow(UnprocessableEntityException);
  });
});
