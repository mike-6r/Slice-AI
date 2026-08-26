/**
 * The owner-demo path is intentionally a separate physical authority.  It
 * must never be confused with a carrier-delivered package or vault custody.
 */
export const STAGING_DEMO_PIKACHU_FIXTURE_KEY = 'PIKACHU_OWNER_DEMO_2026';
export const STAGING_DEMO_PHYSICAL_CONFIRMATION = 'COMPLETE_STAGING_DEMO_INTAKE';
export const STAGING_DEMO_PIKACHU_SUBMISSION_ID = '07dbf13f-f712-4d4a-adcf-96c45c7e641b';

export function isExplicitPikachuOwnerDemoSubmission(submissionId: string) {
  return submissionId === STAGING_DEMO_PIKACHU_SUBMISSION_ID;
}

type DemoCandidate = {
  owner?: { email?: string | null } | null;
  asset?: {
    title?: string | null;
    year?: number | null;
    cardNumber?: string | null;
    certificationNumber?: string | null;
    normalizedCertificationNumber?: string | null;
    category?: { name?: string | null } | null;
    collectibleSet?: { name?: string | null } | null;
    gradeScaleEntry?: { company?: { code?: string | null } | null; grade?: { toString(): string } | null } | null;
  } | null;
};

export function isProtectedControlledAsset(asset: DemoCandidate['asset']) {
  const identity = [asset?.title, asset?.collectibleSet?.name, asset?.cardNumber]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return identity.includes('umbreon') || identity.includes('charizard');
}

/** A deliberately narrow allow-list for the existing owner-demo record. */
export function isEligiblePikachuOwnerDemo(candidate: DemoCandidate) {
  const asset = candidate.asset;
  const grade = Number(asset?.gradeScaleEntry?.grade?.toString());
  const certification = (asset?.certificationNumber ?? asset?.normalizedCertificationNumber ?? '')
    .replace(/\D/g, '');
  return (
    asset?.title?.trim().toLowerCase() === 'pikachu with grey felt hat' &&
    certification === '107760843' &&
    asset.gradeScaleEntry?.company?.code?.toUpperCase() === 'PSA' &&
    grade === 10
  );
}

export function hasStagingDemoPhysicalReadiness(
  isBeta: boolean | undefined,
  authority: { status: string } | null | undefined,
) {
  return isBeta === true && authority?.status === 'DEMO_CUSTODY';
}
