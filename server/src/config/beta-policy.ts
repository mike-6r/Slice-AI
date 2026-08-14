/**
 * Customer-facing beta boundary for the old staging showcase.  These values
 * are deliberately narrow and immutable: they identify records created by
 * the repository's staging fixture, rather than attempting to infer ownership
 * from a title, price, or account role.
 */
export const BETA_FIXTURE_SLUG_PREFIX = 'slice-demo-';
export const BETA_FIXTURE_SOURCE_PREFIXES = [
  'STAGING_',
  'DEMO_',
  'TEST_',
] as const;

export function isBetaFixtureSlug(slug: string) {
  return slug.startsWith(BETA_FIXTURE_SLUG_PREFIX);
}

export function isBetaFixtureSource(source: string | null | undefined) {
  return (
    typeof source === 'string' &&
    BETA_FIXTURE_SOURCE_PREFIXES.some((prefix) => source.startsWith(prefix))
  );
}

/** The beta only hides explicitly tagged fixture records from public reads. */
export function publicBetaAssetWhere(isBeta: boolean | undefined) {
  return isBeta
    ? { slug: { not: { startsWith: BETA_FIXTURE_SLUG_PREFIX } } }
    : {};
}
