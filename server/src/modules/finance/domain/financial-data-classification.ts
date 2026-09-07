/**
 * Financial provenance is intentionally separate from user/account state.
 * These values are persisted in Prisma's FinancialDataClass enum.
 */
export const authoritativeFinancialDataClasses = [
  'OPERATIONAL',
  'SANDBOX_REAL',
] as const;

export const nonAuthoritativeFinancialDataClasses = [
  'QA',
  'DEMO',
  'SEED',
] as const;

export type FinancialDataClass =
  | (typeof authoritativeFinancialDataClasses)[number]
  | (typeof nonAuthoritativeFinancialDataClasses)[number];

export type FinanceDataScope = 'OPERATIONAL' | 'QA_DEMO' | 'ALL';

export function isAuthoritativeFinancialDataClass(value: FinancialDataClass) {
  return (authoritativeFinancialDataClasses as readonly string[]).includes(
    value,
  );
}

export function financialDataClassesForScope(
  scope: FinanceDataScope,
): readonly FinancialDataClass[] | undefined {
  if (scope === 'OPERATIONAL') return authoritativeFinancialDataClasses;
  if (scope === 'QA_DEMO') return nonAuthoritativeFinancialDataClasses;
  return undefined;
}

export function financeDataScope(value: string | undefined): FinanceDataScope {
  return value === 'QA_DEMO' || value === 'ALL' ? value : 'OPERATIONAL';
}

/** Demo journals must never become operational merely because the author is valid. */
export function classificationForJournalType(type: string): FinancialDataClass {
  return type === 'DEMO_FUNDING' ? 'DEMO' : 'OPERATIONAL';
}

/** A mixed trade remains non-authoritative if either side is fixture data. */
export function classificationForTrade(
  ...classes: Array<FinancialDataClass | null | undefined>
): FinancialDataClass {
  if (classes.includes('DEMO')) return 'DEMO';
  if (classes.includes('SEED')) return 'SEED';
  if (classes.includes('QA')) return 'QA';
  if (classes.includes('SANDBOX_REAL')) return 'SANDBOX_REAL';
  return 'OPERATIONAL';
}
