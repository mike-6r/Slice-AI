import { selectAuthoritativeSliceValuation } from './valuation-projection';

const decision = (
  overrides: Partial<
    Parameters<typeof selectAuthoritativeSliceValuation>[0][number]
  > = {},
) => ({
  id: 'valuation-1',
  valueMinor: 164717n,
  currency: 'GBP',
  confidence: 80,
  methodologyCode: 'MANUAL_RESEARCH',
  decidedAt: new Date('2026-08-16T00:56:20.073Z'),
  status: 'ACTIVE',
  ...overrides,
});

describe('authoritative Slice valuation projection', () => {
  it('selects the newest active decision', () => {
    const result = selectAuthoritativeSliceValuation([
      decision({
        id: 'older',
        decidedAt: new Date('2026-08-15T00:00:00.000Z'),
      }),
      decision({
        id: 'newer',
        decidedAt: new Date('2026-08-16T00:00:00.000Z'),
      }),
    ]);

    expect(result).toMatchObject({
      id: 'newer',
      amountMinor: 164717n,
      currency: 'GBP',
      status: 'ACTIVE',
    });
  });

  it('ignores draft, rejected, and superseded decisions', () => {
    expect(
      selectAuthoritativeSliceValuation([
        decision({ status: 'DRAFT' }),
        decision({ status: 'REJECTED' }),
        decision({ status: 'SUPERSEDED' }),
      ]),
    ).toBeNull();
  });

  it('does not select an external market snapshot or fallback mark', () => {
    const result = selectAuthoritativeSliceValuation([
      decision({
        id: 'approved-slice-valuation',
        methodologyCode: 'PRICECHARTING_REFERENCE_FX_CONVERTED',
      }),
    ]);

    expect(result?.id).toBe('approved-slice-valuation');
    expect(result?.amountMinor).toBe(164717n);
    expect(result?.currency).toBe('GBP');
  });

  it('leaves the projection unavailable when no active decision exists', () => {
    expect(selectAuthoritativeSliceValuation([])).toBeNull();
  });
});
