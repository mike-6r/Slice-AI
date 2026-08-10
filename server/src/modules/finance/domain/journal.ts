import { InternalServerErrorException } from '@nestjs/common';
import { parsePositiveMoneyMinor, type Money } from './money';

export type JournalSide = 'DEBIT' | 'CREDIT';

export type JournalLine = Readonly<{
  accountId: string;
  side: JournalSide;
  amountMinor: string;
}>;

export type ValidatedJournalLine = Readonly<{
  accountId: string;
  side: JournalSide;
  money: Money;
}>;

/**
 * Financial postings are application-owned templates. This validator intentionally
 * has no client-account selection or mutable balance behaviour.
 */
export function validateBalancedJournal(
  currency: string,
  lines: readonly JournalLine[],
): ValidatedJournalLine[] {
  if (lines.length < 2)
    throw unbalancedJournal('A journal requires at least two entries.');
  const validated: ValidatedJournalLine[] = lines.map((line) => ({
    accountId: line.accountId,
    side: line.side,
    money: {
      minor: parsePositiveMoneyMinor(line.amountMinor),
      currency: 'GBP',
    },
  }));
  if (
    currency !== 'GBP' ||
    validated.some((line) => line.money.currency !== currency)
  )
    throw unbalancedJournal('Journal entries must use GBP.');
  const debits = total(validated, 'DEBIT');
  const credits = total(validated, 'CREDIT');
  if (debits !== credits)
    throw unbalancedJournal('Journal debits and credits must be equal.');
  return validated;
}

export function accountAuthority(
  normalSide: JournalSide,
  debitMinor: bigint,
  creditMinor: bigint,
) {
  return normalSide === 'DEBIT'
    ? debitMinor - creditMinor
    : creditMinor - debitMinor;
}

function total(lines: readonly ValidatedJournalLine[], side: JournalSide) {
  return lines
    .filter((line) => line.side === side)
    .reduce((sum, line) => sum + line.money.minor, 0n);
}

function unbalancedJournal(message: string): never {
  throw new InternalServerErrorException({
    code: 'UNBALANCED_JOURNAL',
    message,
  });
}
