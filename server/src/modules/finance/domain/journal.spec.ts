import { InternalServerErrorException } from '@nestjs/common';
import { accountAuthority, validateBalancedJournal } from './journal';

describe('financial journal domain', () => {
  it('accepts balanced GBP integer-minor entries', () => {
    const lines = validateBalancedJournal('GBP', [
      { accountId: 'clearing', side: 'DEBIT', amountMinor: '1250' },
      { accountId: 'cash', side: 'CREDIT', amountMinor: '1250' },
    ]);
    expect(lines[0].money.minor).toBe(1250n);
  });

  it('rejects unbalanced journals', () => {
    expect(() =>
      validateBalancedJournal('GBP', [
        { accountId: 'clearing', side: 'DEBIT', amountMinor: '1250' },
        { accountId: 'cash', side: 'CREDIT', amountMinor: '1200' },
      ]),
    ).toThrow(InternalServerErrorException);
  });

  it('derives authority from an account normal side', () => {
    expect(accountAuthority('CREDIT', 100n, 900n)).toBe(800n);
    expect(accountAuthority('DEBIT', 900n, 100n)).toBe(800n);
  });
});
