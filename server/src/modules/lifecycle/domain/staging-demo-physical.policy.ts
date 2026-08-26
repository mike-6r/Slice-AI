/**
 * The owner-demo path is intentionally a separate physical authority.  It
 * must never be confused with a carrier-delivered package or vault custody.
 */
export const STAGING_DEMO_PIKACHU_FIXTURE_KEY = 'PIKACHU_OWNER_DEMO_2026';
export const STAGING_DEMO_PHYSICAL_CONFIRMATION = 'COMPLETE_STAGING_DEMO_INTAKE';

type DemoCandidate = {
  owner?: { email?: string | null } | null;
  asset?: {
    title?: string | null;
    year?: number | null;
    cardNumber?: string | null;
    certificationNumber?: string | null;
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
  const grade = asset?.gradeScaleEntry?.grade?.toString() ?? null;
  return (
    candidate.owner?.email?.toLowerCase() === 'demo-collector@slicecollectable.com' &&
    asset?.title?.trim().toLowerCase() === 'pikachu with grey felt hat' &&
    asset.year === 2023 &&
    asset.cardNumber === '85' &&
    asset.certificationNumber === '107760843' &&
    asset.category?.name?.toLowerCase() === 'pokémon tcg' &&
    asset.collectibleSet?.name?.toLowerCase() === 'pokémon x van gogh' &&
    asset.gradeScaleEntry?.company?.code?.toUpperCase() === 'PSA' &&
    grade === '10'
  );
}

export function hasStagingDemoPhysicalReadiness(
  isBeta: boolean | undefined,
  authority: { status: string } | null | undefined,
) {
  return isBeta === true && authority?.status === 'DEMO_CUSTODY';
}
