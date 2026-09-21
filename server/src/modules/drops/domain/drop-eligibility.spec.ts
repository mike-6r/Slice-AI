import { evaluateDropAssetEligibility } from './drop-eligibility';
import { assertDropTransition, isDropEditable } from './drop-lifecycle';
import { calculateDropReadiness } from './drop-readiness';
import { assertDropLockAllowsWorkflow } from './drop-lock.policy';
import { PREVIEW_DROP_FIXTURE_CLASSIFICATION } from './drop-fixture';

const eligible = {
  canonicalStatus: 'VERIFIED',
  creatorVerified: true,
  custodyStatus: 'SECURED',
  receivedAt: new Date('2026-01-01T00:00:00Z'),
  securedAt: new Date('2026-01-02T00:00:00Z'),
  verificationApproved: true,
  supplyStatus: 'ACTIVE',
  totalUnits: 1n,
  issuedUnits: 1n,
  creatorSettledUnits: 1n,
  creatorReservedUnits: 0n,
  otherSettledUnits: 0n,
  operationalControlStatus: 'ACTIVE',
  offeringStatus: null,
  preSaleStatus: null,
  marketStatus: null,
  hasFinancialDeficit: false,
  hasComplianceHold: false,
  hasConflictingSale: false,
  lockedByDropId: null,
};

describe('Slice Drops eligibility policy', () => {
  it('accepts only a verified, secured, whole-owned uncommitted asset', () => {
    expect(evaluateDropAssetEligibility(eligible)).toEqual({
      eligible: true,
      reasons: [],
    });
  });

  it.each([
    [{ custodyStatus: 'RECEIVED' }, 'NOT_SECURED_IN_VAULT'],
    [{ verificationApproved: false }, 'VERIFICATION_INCOMPLETE'],
    [
      {
        creatorSettledUnits: 50n,
        totalUnits: 100n,
        issuedUnits: 100n,
        otherSettledUnits: 50n,
      },
      'CREATOR_NOT_WHOLE_OWNER',
    ],
    [{ creatorReservedUnits: 1n }, 'OWNERSHIP_RESERVED'],
    [{ offeringStatus: 'OPEN' }, 'CONFLICTING_OFFERING'],
    [{ marketStatus: 'HALTED' }, 'CONFLICTING_MARKET'],
    [{ hasComplianceHold: true }, 'CREATOR_COMPLIANCE_HOLD'],
    [{ hasConflictingSale: true }, 'CONFLICTING_MARKET'],
    [
      { lockedByDropId: 'another-drop', requestedDropId: 'current-drop' },
      'ALREADY_LOCKED',
    ],
  ] as const)('rejects an authoritative blocker %#', (override, code) => {
    const result = evaluateDropAssetEligibility({ ...eligible, ...override });
    expect(result.eligible).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain(code);
  });

  it("rejects another user's asset because the creator is not the whole owner", () => {
    const result = evaluateDropAssetEligibility({
      ...eligible,
      creatorSettledUnits: 0n,
      otherSettledUnits: 1n,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'CREATOR_NOT_WHOLE_OWNER',
    );
  });
});

describe('Slice Drops lifecycle policy', () => {
  it('uses an explicit non-operational preview fixture classification', () => {
    expect(PREVIEW_DROP_FIXTURE_CLASSIFICATION).toBe('PREVIEW_QA');
  });
  it('keeps editing conservative and rejects skipped publication transitions', () => {
    expect(isDropEditable('DRAFT')).toBe(true);
    expect(isDropEditable('READY_FOR_REVIEW')).toBe(false);
    expect(() => assertDropTransition('DRAFT', 'LIVE')).toThrow();
    expect(() =>
      assertDropTransition('DRAFT', 'READY_FOR_REVIEW'),
    ).not.toThrow();
    expect(() =>
      assertDropTransition('READY_FOR_REVIEW', 'READY_TO_PUBLISH'),
    ).not.toThrow();
  });

  it('blocks readiness until inventory and its exclusive lock are complete', () => {
    expect(
      calculateDropReadiness({
        name: 'Vault icons',
        description: 'A controlled collection of verified vault icons.',
        inventoryCount: 1,
        lockCount: 0,
        inventoryEligible: true,
      }).ready,
    ).toBe(false);
    expect(
      calculateDropReadiness({
        name: 'Vault icons',
        description: 'A controlled collection of verified vault icons.',
        inventoryCount: 1,
        lockCount: 1,
        inventoryEligible: true,
      }).ready,
    ).toBe(true);
  });

  it('blocks conflicting workflows only in preview when an asset is Drop-locked', () => {
    expect(() =>
      assertDropLockAllowsWorkflow(
        'preview',
        { dropId: 'drop-1' },
        'Ownership transfer',
      ),
    ).toThrow();
    expect(() =>
      assertDropLockAllowsWorkflow(
        'staging',
        { dropId: 'drop-1' },
        'Ownership transfer',
      ),
    ).not.toThrow();
  });
});
