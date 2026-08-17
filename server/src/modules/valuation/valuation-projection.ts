export type ValuationDecisionForProjection = {
  id: string;
  valueMinor: bigint;
  currency: string;
  confidence: number;
  methodologyCode: string;
  decidedAt: Date;
  status: string;
};

export type SliceValuationProjection = {
  id: string;
  amountMinor: bigint;
  currency: string;
  confidence: number;
  sourceType: string;
  approvedAt: Date;
  status: 'ACTIVE';
};

/**
 * Selects the one staff-approved valuation that is allowed to power customer
 * value projections. External market references and legacy marks deliberately
 * never enter this selection.
 */
export function selectAuthoritativeSliceValuation(
  decisions: readonly ValuationDecisionForProjection[],
): SliceValuationProjection | null {
  const decision = decisions
    .filter((item) => item.status === 'ACTIVE')
    .slice()
    .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())[0];

  return decision
    ? {
        id: decision.id,
        amountMinor: decision.valueMinor,
        currency: decision.currency,
        confidence: decision.confidence,
        sourceType: decision.methodologyCode,
        approvedAt: decision.decidedAt,
        status: 'ACTIVE',
      }
    : null;
}
