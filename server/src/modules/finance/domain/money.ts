import { UnprocessableEntityException } from '@nestjs/common';

export const FINANCIAL_CURRENCY = 'GBP' as const;
const MAX_MINOR = 9_000_000_000_000_000n;

export type Money = Readonly<{
  minor: bigint;
  currency: typeof FINANCIAL_CURRENCY;
}>;

/** Parses a positive wire minor-unit integer without accepting float-like forms. */
export function parsePositiveMoneyMinor(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) invalidMoney();
  const minor = BigInt(value);
  if (minor > MAX_MINOR) invalidMoney();
  return minor;
}

export function money(
  minor: bigint,
  currency: string = FINANCIAL_CURRENCY,
): Money {
  if (currency !== FINANCIAL_CURRENCY || minor < 0n || minor > MAX_MINOR)
    invalidMoney();
  return { minor, currency };
}

export function invalidMoney(): never {
  throw new UnprocessableEntityException({
    code: 'INVALID_MONEY',
    message:
      'Money must be a GBP integer minor-unit value within the supported range.',
  });
}
