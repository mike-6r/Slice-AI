export type QualificationOutcome =
  | 'AUTO_QUALIFIED'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'COLLECTOR_ACTION_REQUIRED'
  | 'BLOCKED';

export type QualificationCheckResult =
  | 'PASS'
  | 'ADVISORY'
  | 'UNCERTAIN'
  | 'FAIL'
  | 'ACTION_REQUIRED'
  | 'BLOCKED';

export type QualificationPolicy = {
  version: string;
  enabled: boolean;
  enabledCategories: string[];
  enabledGraders: string[];
  qaSamplingBps: number;
  autoPreSaleLaunch: boolean;
  defaultPreSaleSupply: bigint;
  emergencyDisabled: boolean;
};

export type QualificationCheck = {
  code: string;
  result: QualificationCheckResult;
  mandatory: boolean;
  reason: string;
  details?: Record<string, unknown>;
};

export const DEFAULT_AUTO_REVIEW_POLICY = {
  version: 'GRADED_CARD_AUTO_REVIEW_V1',
  enabled: true,
  enabledCategories: [] as string[],
  enabledGraders: ['PSA', 'BGS', 'CGC'],
  qaSamplingBps: 0,
  autoPreSaleLaunch: true,
  defaultPreSaleSupply: 1000n,
  emergencyDisabled: false,
};

export function calculateProvisionalTerms(metadata: Record<string, unknown>, supply: bigint) {
  const estimate = String(metadata.collectorExpectedValueMinor ?? '').trim();
  const percent = Number(metadata.offerIntentPercent ?? 0);
  if (!/^\d+$/.test(estimate) || BigInt(estimate) <= 0n || !Number.isFinite(percent) || percent <= 0 || percent > 100 || supply <= 0n)
    return null;
  const offeredUnits = (supply * BigInt(Math.round(percent * 100))) / 10000n;
  if (offeredUnits <= 0n) return null;
  const retainedUnits = supply - offeredUnits;
  const pricePerUnitMinor = BigInt(estimate) / supply;
  if (pricePerUnitMinor <= 0n) return null;
  return {
    estimateMinor: BigInt(estimate),
    offeredUnits,
    retainedUnits,
    pricePerUnitMinor,
    grossOfferingMinor: pricePerUnitMinor * offeredUnits,
  };
}

export function isPolicyEligibleCategory(category: string, policy: QualificationPolicy) {
  return policy.enabledCategories.length === 0 || policy.enabledCategories.includes(category);
}

export function qualificationCustomerStatus(outcome: QualificationOutcome) {
  switch (outcome) {
    case 'AUTO_QUALIFIED': return 'PRE_SALE_QUALIFIED';
    case 'COLLECTOR_ACTION_REQUIRED': return 'NEEDS_YOUR_ACTION';
    case 'BLOCKED': return 'BLOCKED_CONTACT_SUPPORT';
    default: return 'NEEDS_STAFF_REVIEW';
  }
}

export function evaluateQualification(input: {
  category: string;
  grader: string;
  policy: QualificationPolicy;
  accountStatus: string;
  identity: Record<string, unknown>;
  certification: { status: string; verifiedGrade?: string | null } | null;
  certificationClaimedByOther: boolean;
  media: Array<{ slot: string; status: string; deletedAt: Date | null; sizeBytes: number }>;
  possession: boolean;
  intakeValid: boolean;
  terms: ReturnType<typeof calculateProvisionalTerms>;
  marketState?: string | null;
}) {
  const checks: QualificationCheck[] = [];
  const add = (code: string, result: QualificationCheckResult, reason: string, mandatory = true, details?: Record<string, unknown>) =>
    checks.push({ code, result, mandatory, reason, ...(details ? { details } : {}) });
  const raw = !input.grader || input.grader.toLowerCase() === 'ungraded';
  if (['SUSPENDED', 'CLOSED', 'DEACTIVATED'].includes(input.accountStatus))
    add('ACCOUNT_STATUS', 'BLOCKED', 'The collector account is not eligible to submit this listing.');
  else if (input.accountStatus !== 'ACTIVE')
    add('ACCOUNT_STATUS', 'UNCERTAIN', 'The collector account requires staff review.');
  const requiredIdentity = ['name', 'year', 'set', 'cardNumber'];
  const missingIdentity = requiredIdentity.filter((key) => !String(input.identity[key] ?? '').trim());
  add('IDENTITY_COMPLETE', missingIdentity.length ? 'ACTION_REQUIRED' : 'PASS', missingIdentity.length ? `Add: ${missingIdentity.join(', ')}.` : 'The collectible identity is complete.', true, { missing: missingIdentity });
  const requiredSlots = raw ? ['front', 'back'] : ['front', 'back', 'grading-label'];
  const safeSlots = new Set(input.media.filter((media) => media.status === 'SAFE' && !media.deletedAt && media.sizeBytes > 0).map((media) => media.slot));
  const missingMedia = requiredSlots.filter((slot) => !safeSlots.has(slot));
  add('EVIDENCE_COMPLETE', missingMedia.length ? 'ACTION_REQUIRED' : 'PASS', missingMedia.length ? `Upload safe evidence for: ${missingMedia.join(', ')}.` : 'Required evidence is present and safe.', true, { missing: missingMedia });
  add('POSSESSION_CONFIRMED', input.possession ? 'PASS' : 'ACTION_REQUIRED', input.possession ? 'The collector confirmed possession.' : 'Confirm that you currently have the physical collectible.', true);
  add('INTAKE_DESTINATION', input.intakeValid ? 'PASS' : 'ACTION_REQUIRED', input.intakeValid ? 'The selected intake destination is eligible.' : 'Select an eligible Slice intake destination and delivery method.', true);
  if (raw) add('ASSET_TYPE', 'UNCERTAIN', 'Raw or ungraded collectibles require manual review by policy.');
  else if (!input.policy.enabledGraders.includes(input.grader.toUpperCase())) add('GRADER_POLICY', 'UNCERTAIN', `${input.grader} is not enabled for automated qualification.`);
  else if (!isPolicyEligibleCategory(input.category, input.policy)) add('CATEGORY_POLICY', 'UNCERTAIN', 'This collectible category requires manual review by policy.');
  else add('GRADER_POLICY', 'PASS', `${input.grader} is enabled for automated qualification.`);
  if (!raw) {
    const cert = input.certification;
    if (input.certificationClaimedByOther || cert?.status === 'ALREADY_LISTED') add('CERTIFICATION_DUPLICATE', 'BLOCKED', 'That certification number is already associated with another Slice record.');
    else if (cert?.status === 'MISMATCH') add('CERTIFICATION_MATCH', 'UNCERTAIN', 'The certification result does not match the submitted collectible.');
    else if (!cert || !['CLEAR', 'VERIFIED'].includes(cert.status)) add('CERTIFICATION_CHECK', 'UNCERTAIN', 'Certification evidence needs staff confirmation before this listing can progress.');
    else add('CERTIFICATION_CHECK', 'PASS', 'The certification number passed the Slice duplicate and verification checks.');
    if (cert?.verifiedGrade && String(input.identity.grade ?? '').trim() && cert.verifiedGrade !== String(input.identity.grade).trim()) add('CERTIFICATION_GRADE', 'UNCERTAIN', 'The submitted grade does not match the verified grade.', true, { submitted: input.identity.grade, verified: cert.verifiedGrade });
  }
  const terms = input.terms;
  add('PROVISIONAL_TERMS', terms ? 'PASS' : 'ACTION_REQUIRED', terms ? 'A valid provisional Pre-Sale allocation can be calculated.' : 'Add a valid expected value and offer percentage before submitting.', true);
  add('MARKET_REFERENCE', ['FOUND', 'LIMITED', 'NO_MATCHES', 'COMPLETED'].includes(String(input.marketState)) ? 'PASS' : 'ADVISORY', input.marketState ? `Market reference status: ${input.marketState}.` : 'No market reference was available; staff can review pricing separately.', false);
  const blocked = checks.some((check) => check.result === 'BLOCKED');
  const action = checks.some((check) => check.result === 'ACTION_REQUIRED');
  const uncertain = checks.some((check) => check.result === 'UNCERTAIN');
  const outcome: QualificationOutcome = blocked ? 'BLOCKED' : action ? 'COLLECTOR_ACTION_REQUIRED' : uncertain ? 'HUMAN_REVIEW_REQUIRED' : 'AUTO_QUALIFIED';
  return { outcome, checks, reasons: checks.filter((check) => check.result !== 'PASS' && check.result !== 'ADVISORY').map((check) => check.reason) };
}
