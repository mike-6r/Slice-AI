import {
  authoritativeFinancialDataClasses,
  classificationForJournalType,
  classificationForTrade,
  financeDataScope,
  financialDataClassesForScope,
  isAuthoritativeFinancialDataClass,
} from './financial-data-classification';

describe('financial data classification', () => {
  it('keeps only operational and provider-backed sandbox data authoritative', () => {
    expect(isAuthoritativeFinancialDataClass('OPERATIONAL')).toBe(true);
    expect(isAuthoritativeFinancialDataClass('SANDBOX_REAL')).toBe(true);
    expect(isAuthoritativeFinancialDataClass('DEMO')).toBe(false);
    expect(authoritativeFinancialDataClasses).toEqual([
      'OPERATIONAL',
      'SANDBOX_REAL',
    ]);
  });

  it('classes explicit demo funding as non-authoritative', () => {
    expect(classificationForJournalType('DEMO_FUNDING')).toBe('DEMO');
    expect(classificationForJournalType('EXTERNAL_DEPOSIT')).toBe(
      'OPERATIONAL',
    );
  });

  it('does not let a mixed fixture trade inflate operational volume', () => {
    expect(classificationForTrade('OPERATIONAL', 'DEMO')).toBe('DEMO');
    expect(classificationForTrade('SANDBOX_REAL', 'QA')).toBe('QA');
    expect(classificationForTrade('SANDBOX_REAL', 'OPERATIONAL')).toBe(
      'SANDBOX_REAL',
    );
  });

  it('exposes QA and demo records only through an intentional scope', () => {
    expect(financeDataScope(undefined)).toBe('OPERATIONAL');
    expect(financialDataClassesForScope('QA_DEMO')).toEqual([
      'QA',
      'DEMO',
      'SEED',
    ]);
    expect(financialDataClassesForScope('ALL')).toBeUndefined();
  });
});
