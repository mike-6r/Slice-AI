/** Customer-facing runtime boundary for retired staging fixture identifiers. */
export function isRetiredBetaAssetSlug(value: string | null | undefined) {
  return Boolean(value?.startsWith("slice-demo-"));
}
